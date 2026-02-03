import json
import os
import tempfile
import unittest
from pathlib import Path

from app.core.pipeline import run as generate_run


class OutputLanguagePathsTests(unittest.TestCase):
    def test_language_subfolders(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            output_root = Path(tmp) / "reports"
            project_dir = workspace / "projects" / "client_abc"
            project_dir.mkdir(parents=True, exist_ok=True)

            project = {
                "project_key": "client_abc",
                "client_name": "Client ABC",
                "domain": "example.com",
                "canonical_origin": "https://www.example.com",
                "output_path": str(output_root),
                "timezone": "Europe/Helsinki",
                "report_language": "de",
                "sources": {
                    "gsc": {"enabled": True, "property": "sc-domain:example.com"},
                    "dataforseo": {"enabled": False, "locations_set": "de_core"},
                    "pagespeed": {"enabled": True},
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

            out_de = generate_run(project_path, "2026-01", mock=True, lang_override="de")
            out_en = generate_run(project_path, "2026-01", mock=True, lang_override="en")

            self.assertTrue((out_de / "report.md").exists())
            self.assertTrue((out_en / "report.md").exists())
            self.assertNotEqual(out_de, out_en)
            self.assertEqual(out_de.name, "de")
            self.assertEqual(out_en.name, "en")


if __name__ == "__main__":
    unittest.main()
