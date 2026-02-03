import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from app.core.doctor import run as doctor_run
from click.exceptions import Exit


class DoctorMissingEnvTests(unittest.TestCase):
    def test_missing_env_vars_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            project_dir = workspace / "projects" / "client_abc"
            project_dir.mkdir(parents=True, exist_ok=True)

            project = {
                "project_key": "client_abc",
                "client_name": "Client ABC",
                "domain": "example.com",
                "canonical_origin": "https://www.example.com",
                "output_path": str(Path(tmp) / "reports" / "client_abc"),
                "timezone": "Europe/Helsinki",
                "report_language": "de",
                "sources": {
                    "gsc": {"enabled": True, "property": "sc-domain:example.com"},
                    "dataforseo": {"enabled": True, "locations_set": "de_core"},
                    "pagespeed": {"enabled": True},
                    "crux": {"enabled": True, "mode": "history"},
                    "rybbit": {"enabled": True},
                },
                "thresholds": {
                    "mom_drop_clicks_pct": 0.2,
                    "mom_drop_impressions_pct": 0.2,
                    "keyword_drop_positions": 3,
                    "inp_regression_ms": 50,
                },
            }
            project_path = project_dir / "project.json"
            project_path.write_text(json.dumps(project, indent=2), encoding="utf-8")

            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            keys = [
                "GOOGLE_API_KEY",
                "GSC_AUTH_MODE",
                "GSC_CREDENTIALS_JSON",
                "DATAFORSEO_LOGIN",
                "DATAFORSEO_PASSWORD",
                "RYBBIT_API_KEY",
                "RYBBIT_API_BASE",
            ]
            original = {k: os.environ.get(k) for k in keys}
            try:
                for key in keys:
                    if key in os.environ:
                        del os.environ[key]

                buf = io.StringIO()
                with redirect_stdout(buf), redirect_stderr(buf):
                    with self.assertRaises(Exit):
                        doctor_run("client_abc", mock=False)

                output = buf.getvalue()
                self.assertIn("GOOGLE_API_KEY", output)
                self.assertIn("GSC_AUTH_MODE", output)
                self.assertIn("GSC_CREDENTIALS_JSON", output)
                self.assertIn("DATAFORSEO_LOGIN", output)
                self.assertIn("DATAFORSEO_PASSWORD", output)
                self.assertIn("RYBBIT_API_KEY", output)
            finally:
                for key, value in original.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
