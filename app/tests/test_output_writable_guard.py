import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from app.core.doctor import run as doctor_run
from click.exceptions import Exit


class OutputWritableGuardTests(unittest.TestCase):
    def test_unwritable_output_path_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            project_dir = workspace / "projects" / "client_abc"
            project_dir.mkdir(parents=True, exist_ok=True)

            project = {
                "project_key": "client_abc",
                "client_name": "Client ABC",
                "domain": "example.com",
                "canonical_origin": "https://www.example.com",
                "output_path": "/path/to/reports/readonly",
                "timezone": "Europe/Helsinki",
                "report_language": "de",
                "sources": {
                    "gsc": {"enabled": False, "property": "sc-domain:example.com"},
                    "dataforseo": {"enabled": False, "locations_set": "de_core"},
                    "pagespeed": {"enabled": False},
                    "crux": {"enabled": False, "mode": "history"},
                    "rybbit": {"enabled": False},
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

            buf = io.StringIO()
            with redirect_stdout(buf), redirect_stderr(buf):
                with self.assertRaises(Exit) as exc:
                    doctor_run("client_abc", mock=True)

            self.assertNotEqual(exc.exception.exit_code, 0)
            self.assertIn("Output path not writable", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
