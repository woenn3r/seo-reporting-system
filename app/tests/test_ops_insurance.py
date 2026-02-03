import json
import os
import tempfile
import unittest
from pathlib import Path

from app.core.ops_insurance import snapshot, explain_plan, audit_export
<<<<<<< HEAD
from app.core.actions import build_actions_with_trace
from app.core.manifest import load_manifest
=======
from app.core.pipeline import run as generate_run
>>>>>>> 07da73a (add ops insurance commands and audit bundle)


class OpsInsuranceTests(unittest.TestCase):
    def _write_project(self, workspace: Path) -> Path:
        project_dir = workspace / "projects" / "client_abc"
        project_dir.mkdir(parents=True, exist_ok=True)
        project_path = project_dir / "project.json"
<<<<<<< HEAD
        sample = Path("examples/project_pack/sample_project.json").read_text(encoding="utf-8")
        project_path.write_text(sample, encoding="utf-8")
        return project_path

    def test_snapshot_contains_required_sections(self):
=======
        project = json.loads(Path("examples/project_pack/sample_project.json").read_text(encoding="utf-8"))
        project["output_path"] = str(workspace / "reports" / "client_abc")
        project_path.write_text(json.dumps(project, indent=2), encoding="utf-8")
        return project_path

    def test_snapshot_has_required_top_keys(self):
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            out_path = Path(tmp) / "snapshot.json"
            snapshot("client_abc", "2026-01", "de", out_path, mock=True)
<<<<<<< HEAD

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
=======
            data = json.loads(out_path.read_text(encoding="utf-8"))
            for key in [
                "meta",
                "project",
                "period_resolution",
                "sources",
                "doctor_expectations",
                "templates",
                "rulesets",
                "pipeline",
                "output_layout",
            ]:
                self.assertIn(key, data)

    def test_explain_deterministic_output(self):
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            first = explain_plan("client_abc", "2026-01", "de")
            second = explain_plan("client_abc", "2026-01", "de")
<<<<<<< HEAD
            self.assertEqual(first.plan, second.plan)
            self.assertEqual(first.text, second.text)

    def test_audit_export_redacts_secrets(self):
=======
            self.assertEqual(first.text, second.text)

    def test_audit_export_structure_and_filenames(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            project_path = self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            bundle_dir = audit_export("client_abc", "2026-01", "de", None)
            expected = {
                "snapshot.json",
                "explain.txt",
                "doctor.json",
                "redacted_project.json",
                "env_required.md",
                "resolved_rules.json",
                "template_manifest.json",
                "run_trace.json",
                "actions_debug.json",
                "template_trace.json",
            }
            found = {p.name for p in bundle_dir.iterdir() if p.is_file()}
            self.assertTrue(expected.issubset(found))

    def test_audit_export_redacts_env_values(self):
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            original = os.environ.get("GOOGLE_API_KEY")
            os.environ["GOOGLE_API_KEY"] = "SECRET_ABC"
<<<<<<< HEAD
            out_dir = Path(tmp) / "bundle"
            audit_export("client_abc", "2026-01", "de", out_dir, mock=True)
=======
            bundle_dir = audit_export("client_abc", "2026-01", "de", None)

            combined = ""
            for path in bundle_dir.iterdir():
                if path.is_file():
                    combined += path.read_text(encoding="utf-8")
            self.assertNotIn("SECRET_ABC", combined)
>>>>>>> 07da73a (add ops insurance commands and audit bundle)

            if original is None:
                os.environ.pop("GOOGLE_API_KEY", None)
            else:
                os.environ["GOOGLE_API_KEY"] = original

<<<<<<< HEAD
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
=======
    def test_actions_debug_includes_eval_trace(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            project_path = self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            output_dir = generate_run(project_path, "2026-01", mock=True, lang_override="de")
            data = json.loads((output_dir / "actions_debug.json").read_text(encoding="utf-8"))
            self.assertTrue(len(data) > 0)
            sample = data[0]
            for key in [
                "action_id",
                "title",
                "severity_final",
                "included",
                "rule_id",
                "conditions",
                "values",
                "eval_result",
                "justification",
            ]:
                self.assertIn(key, sample)

    def test_template_trace_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp) / "workspace"
            project_path = self._write_project(workspace)
            os.environ["SEO_REPORT_WORKSPACE"] = str(workspace)

            output_dir = generate_run(project_path, "2026-01", mock=True, lang_override="de")
            trace_path = output_dir / "template_trace.json"
            self.assertTrue(trace_path.exists())
            trace = json.loads(trace_path.read_text(encoding="utf-8"))
            for key in ["lang", "template_key", "template_path", "output_filenames", "variable_sections", "render_timestamp"]:
                self.assertIn(key, trace)
>>>>>>> 07da73a (add ops insurance commands and audit bundle)


if __name__ == "__main__":
    unittest.main()
