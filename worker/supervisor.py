"""Own one local actiond worker for the lifetime of a Bazel invocation or CI bucket."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import socket
import subprocess
import sys
import tempfile
import time

from python.runfiles import runfiles


def preflight(worker, expected_sha256):
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise RuntimeError("This worker preset requires a Linux amd64 machine")
    if hashlib.sha256(worker.read_bytes()).hexdigest() != expected_sha256:
        raise RuntimeError("actiond binary does not match the preset checksum")
    for device in (Path("/dev/kvm"), Path("/dev/vhost-vsock")):
        if not device.is_char_device() or not os.access(device, os.R_OK | os.W_OK):
            raise RuntimeError(f"actiond requires readable/writable {device}; use a KVM-capable runner")


def bazel_config(endpoint, worker_sha256):
    flags = [
        "--jobs=2",
        f"--remote_executor={endpoint}",
        f"--remote_cache={endpoint}",
        "--spawn_strategy=sandboxed,local",
        "--strategy=VrtCapture=remote",
        "--strategy=VrtCompare=remote",
        # Native browser tests declare no-local; VRT's report wrapper declares no-remote.
        "--strategy=TestRunner=remote,local",
        "--remote_local_fallback=false",
        "--remote_upload_local_results=false",
        "--noremote_cache_compression",
        "--remote_download_outputs=all",
        "--extra_execution_platforms=@rules_web_e2e//internal:linux_amd64",
        f"--remote_default_exec_properties=actiond-worker-sha256={worker_sha256}",
    ]
    return "".join(f"build:web-e2e {flag}\n" for flag in flags)


def stop(process):
    if process is None:
        return
    # A child may exit before its descendants: signal the owned group either way.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def supervise(worker, worker_sha256, command, log_dir, port=8980, startup_timeout=90):
    # Refuse to attach to an existing listener, including another supervisor.
    with socket.socket() as probe:
        # Match actiond: TIME_WAIT is reusable, but an active listener is not.
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("127.0.0.1", port))
    log_dir.mkdir(parents=True, exist_ok=True)
    logs = Path(tempfile.mkdtemp(prefix="run-", dir=log_dir)).resolve()
    endpoint = f"grpc://127.0.0.1:{port}"
    config = logs / "worker.bazelrc"
    config.write_text(bazel_config(endpoint, worker_sha256))
    print(f"actiond logs: {logs}", file=sys.stderr, flush=True)
    interrupted = []
    previous = {}
    for signum in (signal.SIGINT, signal.SIGTERM):
        previous[signum] = signal.signal(signum, lambda sig, frame: interrupted.append(sig))
    worker_process = None
    command_process = None
    try:
        with tempfile.TemporaryDirectory(prefix="rules-web-e2e-") as state, (logs / "actiond.log").open("wb") as log:
            try:
                worker_process = subprocess.Popen([
                    str(worker), "serve-vm", f"--root={state}/vm", f"--listen=127.0.0.1:{port}",
                    "--memory-mib=6144", "--cpus=2", "--cas-image-size-mib=4096",
                ], stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                    env={"PATH": os.defpath, "HOME": state, "TMPDIR": state})
                deadline = time.monotonic() + startup_timeout
                while not interrupted:
                    if worker_process.poll() is not None:
                        raise RuntimeError(f"actiond exited during startup; see {logs / 'actiond.log'}")
                    if time.monotonic() >= deadline:
                        raise RuntimeError(f"actiond startup timed out; see {logs / 'actiond.log'}")
                    try:
                        with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                            break
                    except OSError:
                        time.sleep(0.05)
                if interrupted:
                    return 128 + interrupted[0]
                env = dict(os.environ, RULES_WEB_E2E_ENDPOINT=endpoint, RULES_WEB_E2E_BAZELRC=str(config))
                command_process = subprocess.Popen(command(config), env=env, start_new_session=True)
                while command_process.poll() is None and not interrupted:
                    if worker_process.poll() is not None:
                        raise RuntimeError(f"actiond exited while the command was running; see {logs / 'actiond.log'}")
                    time.sleep(0.05)
                if interrupted:
                    return 128 + interrupted[0]
                if worker_process.poll() is not None:
                    raise RuntimeError(f"actiond exited while the command was running; see {logs / 'actiond.log'}")
                return command_process.returncode if command_process.returncode >= 0 else 128 - command_process.returncode
            finally:
                stop(command_process)
                stop(worker_process)
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker-runfile", required=True, help=argparse.SUPPRESS)
    parser.add_argument("--manifest-runfile", required=True, help=argparse.SUPPRESS)
    parser.add_argument("--bazel", default="bazel", help="Bazel executable (for example bazelisk)")
    parser.add_argument("--port", type=int, default=8980)
    parser.add_argument("--log-dir", type=Path, default=Path(".web-e2e/logs"))
    parser.add_argument("--startup-timeout", type=float, default=90)
    parser.add_argument("operation", choices=["doctor", "build", "test", "run", "exec"])
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        # Bazel's --script_path launcher enters its runfiles tree before exec.
        workspace = os.environ.get("BUILD_WORKSPACE_DIRECTORY")
        if workspace:
            os.chdir(workspace)
        files = runfiles.Create()
        worker = Path(files.Rlocation(args.worker_runfile)).resolve()
        manifest = json.loads(Path(files.Rlocation(args.manifest_runfile)).read_text())
        preflight(worker, manifest["sha256"])
        if args.operation == "doctor":
            print(f"Linux amd64 devices and actiond {manifest['version']} checksum verified; run a browser test to validate VM startup")
            return
        if not 1 <= args.port <= 65535 or args.startup_timeout <= 0:
            raise RuntimeError("port must be 1..65535 and startup timeout must be positive")
        arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
        if not arguments:
            raise RuntimeError("Supply explicit targets or an exec command")
        if args.operation == "exec":
            command = lambda config: arguments
        else:
            command = lambda config: [args.bazel, "--noblock_for_lock", f"--bazelrc={config}", args.operation, "--config=web-e2e", *arguments]
        sys.exit(supervise(worker, manifest["sha256"], command, args.log_dir, args.port, args.startup_timeout))
    except (OSError, RuntimeError) as error:
        parser.exit(1, f"{error}\n")
