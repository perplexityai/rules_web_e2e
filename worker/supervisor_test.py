"""Exercise supervisor lifecycle with real child processes and loopback listeners."""
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from worker.supervisor import main, preflight, supervise


class SupervisorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.worker = self.root / "worker"
        self.record = self.root / "worker.json"
        self.logs = self.root / "logs"
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            self.port = listener.getsockname()[1]

    def make_worker(self, mode="listen"):
        self.worker.write_text(f'''#!{sys.executable}
import json, os, socket, sys, time
from pathlib import Path
args = dict(arg[2:].split("=", 1) for arg in sys.argv[2:])
Path(__file__).with_suffix(".json").write_text(json.dumps({{"pid": os.getpid(), "root": args["root"], "env": dict(os.environ)}}))
mode = {mode!r}
if mode == "exit":
    sys.exit(17)
if mode == "stall":
    time.sleep(30)
with socket.socket() as listener:
    host, port = args["listen"].split(":")
    listener.bind((host, int(port)))
    listener.listen()
    connection, _ = listener.accept()
    connection.close()
    if mode == "die":
        deadline = time.monotonic() + 5
        while not Path(__file__).with_name("child.pid").exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        sys.exit(19)
    time.sleep(30)
''')
        self.worker.chmod(0o755)
        return hashlib.sha256(self.worker.read_bytes()).hexdigest()

    def assert_cleaned(self):
        record = json.loads(self.record.read_text())
        self.assertFalse(Path(record["root"]).parent.exists())
        with self.assertRaises(ProcessLookupError):
            os.kill(record["pid"], 0)
        self.assertTrue(list(self.logs.glob("run-*/actiond.log")))

    def test_command_status_configuration_and_private_worker_environment(self):
        checksum = self.make_worker()
        output = self.root / "command.json"
        script = '''import json, os, pathlib, sys
config = pathlib.Path(os.environ["RULES_WEB_E2E_BAZELRC"]).read_text()
pathlib.Path(sys.argv[1]).write_text(json.dumps({"config": config, "endpoint": os.environ["RULES_WEB_E2E_ENDPOINT"]}))
sys.exit(7)
'''
        with patch.dict(os.environ, {"SECRET_FOR_TEST": "not-for-worker"}):
            status = supervise(self.worker, checksum,
                lambda config: [sys.executable, "-c", script, str(output)], self.logs, self.port, 2)
        self.assertEqual(status, 7)
        result = json.loads(output.read_text())
        self.assertEqual(result["endpoint"], f"grpc://127.0.0.1:{self.port}")
        self.assertIn("--remote_executor=" + result["endpoint"], result["config"])
        self.assertIn("--remote_default_exec_properties=actiond-worker-sha256=" + checksum, result["config"])
        self.assertIn("--remote_local_fallback=false", result["config"])
        self.assertNotIn("SECRET_FOR_TEST", json.loads(self.record.read_text())["env"])
        self.assert_cleaned()

    def test_occupied_port_never_launches_or_adopts_worker(self):
        checksum = self.make_worker()
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", self.port))
            listener.listen()
            with self.assertRaises(OSError):
                supervise(self.worker, checksum, lambda config: ["never"], self.logs, self.port, 1)
        self.assertFalse(self.record.exists())

    def test_startup_failure_and_timeout_do_not_launch_command(self):
        for mode in ("exit", "stall"):
            with self.subTest(mode=mode):
                checksum = self.make_worker(mode)
                with self.assertRaisesRegex(RuntimeError, "startup"):
                    supervise(self.worker, checksum, lambda config: self.fail("command ran before readiness"),
                        self.logs, self.port, 0.3)
                self.assert_cleaned()

    def test_worker_death_stops_command(self):
        checksum = self.make_worker("die")
        marker = self.root / "child.pid"
        script = "import os,pathlib,sys,time; pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)"
        with self.assertRaisesRegex(RuntimeError, "while the command"):
            supervise(self.worker, checksum, lambda config: [sys.executable, "-c", script, str(marker)],
                self.logs, self.port, 2)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(marker.read_text()), 0)
        self.assert_cleaned()

    def test_cancellation_cleans_worker_and_command(self):
        checksum = self.make_worker()
        marker = self.root / "command.pid"
        cancelled = threading.Event()
        def interrupt_when_started():
            deadline = time.monotonic() + 5
            while not cancelled.wait(0.01):
                if marker.exists() or time.monotonic() >= deadline:
                    os.kill(os.getpid(), signal.SIGTERM)
                    return
        sender = threading.Thread(target=interrupt_when_started)
        def command(config):
            sender.start()
            return [sys.executable, "-c",
                "import os,pathlib,sys,time; pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)", str(marker)]
        try:
            status = supervise(self.worker, checksum, command, self.logs, self.port, 2)
        finally:
            cancelled.set()
            if sender.ident is not None:
                sender.join()
        self.assertEqual(status, 128 + signal.SIGTERM)
        with self.assertRaises(ProcessLookupError):
            os.kill(int(marker.read_text()), 0)
        self.assert_cleaned()

    def test_materialized_launcher_runs_in_consumer_workspace(self):
        checksum = self.make_worker()
        manifest = self.root / "manifest.json"
        manifest.write_text(json.dumps({"sha256": checksum, "version": "test"}))
        self.addCleanup(os.chdir, Path.cwd())
        args = ["runner", "--worker-runfile=" + str(self.worker), "--manifest-runfile=" + str(manifest),
            "--port=" + str(self.port), "exec", "--", sys.executable, "-c",
            "from pathlib import Path; Path('working-directory').write_text(str(Path.cwd()))"]
        # Only the host's device probes are substituted; the CLI verifies the
        # executable hash and owns real worker/command processes.
        with patch.dict(os.environ, {"BUILD_WORKSPACE_DIRECTORY": str(self.root)}), \
                patch.object(sys, "argv", args), \
                patch.object(Path, "is_char_device", return_value=True), \
                patch("os.access", return_value=True):
            with self.assertRaises(SystemExit) as result:
                main()
        self.assertEqual(result.exception.code, 0)
        self.assertEqual((self.root / "working-directory").read_text(), str(self.root))
        self.assertFalse(Path(json.loads(self.record.read_text())["root"]).parent.exists())

    def test_checksum_mismatch_fails_before_devices_or_execution(self):
        self.make_worker()
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            preflight(self.worker, "0" * 64)
        self.assertFalse(self.record.exists())


if __name__ == "__main__":
    unittest.main()
