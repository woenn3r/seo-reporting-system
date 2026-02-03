import os
import types
import unittest
from unittest.mock import patch

import app.core.doctor as doctor


class _Resp:
    def __init__(self, status_ok=True):
        self._ok = status_ok
    def raise_for_status(self):
        if not self._ok:
            raise RuntimeError("bad status")


class DoctorConnectivityTests(unittest.TestCase):
    def test_gsc_connectivity_ok(self):
        with patch("app.extractors.gsc.list_sites") as fn:
            fn.return_value = {"siteEntry": []}
            ok, msg = doctor._check_gsc_connectivity()
            self.assertTrue(ok)
            self.assertIn("ok", msg)

    def test_pagespeed_missing_key(self):
        with patch.dict(os.environ, {}, clear=True):
            ok, msg = doctor._check_pagespeed_connectivity({"canonical_origin": "https://example.com"})
            self.assertFalse(ok)
            self.assertIn("GOOGLE_API_KEY", msg)

    def test_pagespeed_ok(self):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "x"}, clear=True):
            with patch("requests.get") as req:
                req.return_value = _Resp(True)
                ok, msg = doctor._check_pagespeed_connectivity({"canonical_origin": "https://example.com"})
                self.assertTrue(ok)
                self.assertIn("ok", msg)

    def test_crux_ok(self):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "x"}, clear=True):
            with patch("requests.post") as req:
                req.return_value = _Resp(True)
                ok, msg = doctor._check_crux_connectivity({"canonical_origin": "https://example.com"})
                self.assertTrue(ok)
                self.assertIn("ok", msg)

    def test_dataforseo_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            ok, msg = doctor._check_dataforseo_connectivity()
            self.assertFalse(ok)
            self.assertIn("DATAFORSEO", msg)

    def test_dataforseo_ok(self):
        with patch.dict(os.environ, {"DATAFORSEO_LOGIN": "u", "DATAFORSEO_PASSWORD": "p"}, clear=True):
            with patch("requests.get") as req:
                req.return_value = _Resp(True)
                ok, msg = doctor._check_dataforseo_connectivity()
                self.assertTrue(ok)
                self.assertIn("ok", msg)

    def test_rybbit_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            ok, msg = doctor._check_rybbit_connectivity()
            self.assertFalse(ok)
            self.assertIn("RYBBIT", msg)

    def test_rybbit_ok(self):
        with patch.dict(os.environ, {"RYBBIT_API_KEY": "k", "RYBBIT_API_BASE": "https://rybbit.test"}, clear=True):
            with patch("requests.get") as req:
                req.return_value = _Resp(True)
                ok, msg = doctor._check_rybbit_connectivity()
                self.assertTrue(ok)
                self.assertIn("ok", msg)


if __name__ == "__main__":
    unittest.main()
