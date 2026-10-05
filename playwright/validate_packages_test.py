import json
from pathlib import Path
import tempfile
import unittest

from playwright.validate_packages import validate


class ValidatePackagesTest(unittest.TestCase):
    def test_only_matching_packages_produce_validation_output(self):
        for test_version, core_version in [
            ("1.63.0", "1.63.0"),
            ("1.64.0", "1.63.0"),
            ("1.63.0", "1.64.0"),
            ("1.64.0", "1.64.0"),
        ]:
            with self.subTest(test=test_version, core=core_version), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                test, core = root / "test", root / "core"
                for directory, version in [(test, test_version), (core, core_version)]:
                    directory.mkdir()
                    (directory / "package.json").write_text(json.dumps({"version": version}))
                output = root / "validated.json"
                if test_version == core_version == "1.63.0":
                    validate(test, core, "1.63.0", output)
                    self.assertEqual(json.loads(output.read_text()), {"version": "1.63.0"})
                else:
                    with self.assertRaisesRegex(ValueError, "Playwright version mismatch"):
                        validate(test, core, "1.63.0", output)
                    self.assertFalse(output.exists())

    def test_missing_or_invalid_metadata_cannot_validate(self):
        for metadata in [None, "not JSON", "{}"]:
            with self.subTest(metadata=metadata), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                if metadata is not None:
                    (root / "package.json").write_text(metadata)
                output = root / "validated.json"
                with self.assertRaises((FileNotFoundError, json.JSONDecodeError, KeyError)):
                    validate(root, root, "1.63.0", output)
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
