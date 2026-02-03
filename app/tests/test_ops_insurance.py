import json
import os
import tempfile
import unittest
from pathlib import Path

from app.core.ops_insurance import snapshot, explain_plan, audit_export
from app.core.actions import build_actions_with_trace
from app.core.manifest import load_manifest


class OpsInsuranceTests(unittest.TestCase):
    def _write_project(self, workspace: Path) -> Path:
        project_dir = workspace / "projects" / "client_abc"
        project_dir.mkdir(parents=True, exist_ok=True)
        project_path = project_dir / "project.json"
        sample = Path("examples/project_pack/sample_project.json").read_text(encoding="utf-8")
        project_path.write_text(sample, encoding="utf-8")
        return project_path

    def test_snapshot_contains_required_sections(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            out_path = Path(tmp) / "snapshot.json"
            snapshot("client_abc", "2026-01", "de", out_path, mock=True)

            data = json.loads(out_path.read_text(encoding="utf-8"))
            for key in [
                "repo",
                "manifest",
                "project",
                "enabled_sources",
                "required_env_vars",
                "doctor",
                "template",
                "ruleset",
                "pipeline_steps",
                "policy",
                "output_dir",
            ]:
                self.assertIn(key, data)

    def test_explain_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            first = explain_plan("client_abc", "2026-01", "de")
            second = explain_plan("client_abc", "2026-01", "de")
            self.assertEqual(first.plan, second.plan)
            self.assertEqual(first.text, second.text)

    def test_audit_export_redacts_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            original = os.environ.get("GOOGLE_API_KEY")
            os.environ["GOOGLE_API_KEY"] = "SECRET_ABC"
            out_dir = Path(tmp) / "bundle"
            audit_export("client_abc", "2026-01", "de", out_dir, mock=True)

            if original is None:
                os.environ.pop("GOOGLE_API_KEY", None)
            else:
                os.environ["GOOGLE_API_KEY"] = original

            combined = ""
            for path in out_dir.iterdir():
                if path.is_file():
                    combined += path.read_text(encoding="utf-8")
            self.assertNotIn("SECRET_ABC", combined)

    def test_action_trace_includes_eval_details(self):
        payload = json.loads(Path("examples/report_payload/sample_payload.json").read_text(encoding="utf-8"))
        project = json.loads(Path("examples/project_pack/sample_project.json").read_text(encoding="utf-8"))
        manifest = load_manifest()
        _actions, trace = build_actions_with_trace(payload, project, manifest)
        self.assertTrue(len(trace) > 0)
        sample = trace[0]
        for key in ["rule_id", "conditions", "values", "eval_result", "included", "severity_final"]:
            self.assertIn(key, sample)


if __name__ == "__main__":
    unittest.main()
