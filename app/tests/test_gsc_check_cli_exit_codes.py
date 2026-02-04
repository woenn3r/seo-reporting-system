import json
import os
import unittest
from unittest.mock import patch

from app.core.gsc_check import run_gsc_check


class _FakeCreds:
    token = "fake"
    def refresh(self, req):
        return None


class GscCheckExitCodesTests(unittest.TestCase):
    def setUp(self):
        os.environ["GSC_AUTH_MODE"] = "service_account"
        os.environ["GSC_CREDENTIALS_JSON"] = json.dumps({"type": "service_account"})

    def test_ok_exit_code(self):
        project = {"sources": {"gsc": {"property": "sc-domain:example.com"}}}
        with patch("app.core.gsc_check.service_account.Credentials.from_service_account_info") as fn:
            fn.return_value = _FakeCreds()
            with patch("app.core.gsc_check._sites_list") as sites:
                sites.return_value = [{"siteUrl": "sc-domain:example.com"}]
                with patch("app.core.gsc_check._search_analytics") as sa:
                    sa.return_value = True
                    result = run_gsc_check(project, "2026-01")
        self.assertEqual(result.exit_code, 0)
        self.assertTrue(any("property accessible" in m for m in result.messages))

    def test_property_mismatch_exit_code(self):
        project = {"sources": {"gsc": {"property": "sc-domain:example.com"}}}
        with patch("app.core.gsc_check.service_account.Credentials.from_service_account_info") as fn:
            fn.return_value = _FakeCreds()
            with patch("app.core.gsc_check._sites_list") as sites:
                sites.return_value = [{"siteUrl": "https://example.com/"}]
                result = run_gsc_check(project, "2026-01")
        self.assertEqual(result.exit_code, 3)
        self.assertTrue(any("property not accessible" in m for m in result.messages))


if __name__ == "__main__":
    unittest.main()
