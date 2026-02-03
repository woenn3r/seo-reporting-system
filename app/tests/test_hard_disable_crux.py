import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from click.exceptions import Exit

from app.core.doctor import run as doctor_run
from app.core.pipeline import run as generate_run


class HardDisableCruxTests(unittest.TestCase):
    def test_hard_disabled_crux_non_blocking(self):
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
                    "gsc": {"enabled": False, "property": "sc-domain:example.com"},
                    "dataforseo": {"enabled": False, "locations_set": "de_core"},
                    "pagespeed": {"enabled": False},
                    "crux": {"enabled": True, "mode": "history"},
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
            os.environ.pop("GOOGLE_API_KEY", None)

            buf = io.StringIO()
            with redirect_stdout(buf), redirect_stderr(buf):
                doctor_run("client_abc", mock=False)
            output = buf.getvalue()
            self.assertIn("hard-disabled", output)
            self.assertNotIn("GOOGLE_API_KEY", output)

            output_dir = generate_run(project_path, "2026-01", mock=True, lang_override="de")
            payload = json.loads((output_dir / "report_payload.json").read_text(encoding="utf-8"))
            self.assertNotIn("cwv", payload.get("kpis", {}))

            report_md = (output_dir / "report.md").read_text(encoding="utf-8")
            self.assertNotIn("Core Web Vitals", report_md)
            self.assertNotIn("CWV", report_md)

            output_dir_real = generate_run(project_path, "2026-01", mock=False, lang_override="de")
            payload_real = json.loads((output_dir_real / "report_payload.json").read_text(encoding="utf-8"))
            self.assertNotIn("cwv", payload_real.get("kpis", {}))


if __name__ == "__main__":
    unittest.main()
