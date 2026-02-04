import json
import os
import tempfile
import unittest
from pathlib import Path

from app.core import gsc_check


class GscCheckParsingTests(unittest.TestCase):
    def test_credentials_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "creds.json"
            path.write_text(json.dumps({"type": "service_account"}), encoding="utf-8")
            os.environ["GSC_AUTH_MODE"] = "service_account"
            os.environ["GSC_CREDENTIALS_JSON"] = str(path)
            creds = gsc_check._resolve_credentials()
            self.assertIsInstance(creds, dict)

    def test_credentials_json_string(self):
        os.environ["GSC_AUTH_MODE"] = "service_account"
        os.environ["GSC_CREDENTIALS_JSON"] = json.dumps({"type": "service_account"})
        creds = gsc_check._resolve_credentials()
        self.assertIsInstance(creds, dict)

    def test_property_mismatch_hint(self):
        hint = gsc_check._property_mismatch_hint("sc-domain:example.com", ["https://example.com/"])
        self.assertIn("mismatch", hint)


if __name__ == "__main__":
    unittest.main()
