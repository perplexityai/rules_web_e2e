"""Exercise the public supervisor dependency from a separate Bazel module."""
import unittest

from worker.supervisor import bazel_config


class SupervisorConfigTest(unittest.TestCase):
    def test_forwarded_endpoint_preserves_isolated_execution(self):
        endpoint = "grpc://127.0.0.1:18980"
        lines = bazel_config(endpoint).splitlines()
        self.assertTrue(all(line.startswith("build:web-e2e ") for line in lines))
        flags = [line.removeprefix("build:web-e2e ") for line in lines]
        self.assertIn("--remote_executor=" + endpoint, flags)
        self.assertIn("--remote_cache=" + endpoint, flags)
        self.assertIn("--remote_local_fallback=false", flags)
        self.assertIn("--remote_download_outputs=all", flags)
        self.assertIn("--strategy=VrtCapture=remote", flags)
        self.assertFalse(any(flag.startswith("--remote_default_exec_properties") for flag in flags))


if __name__ == "__main__":
    unittest.main()
