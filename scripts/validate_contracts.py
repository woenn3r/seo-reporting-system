import json
from pathlib import Path
import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]

def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def validate(instance, schema, name: str):
    v = Draft202012Validator(schema)
    errors = sorted(v.iter_errors(instance), key=lambda e: e.path)
    if errors:
        msg = "\n".join([f"- {name}: {list(e.path)}: {e.message}" for e in errors[:50]])
        raise SystemExit(f"Schema validation failed:\n{msg}")

def main():
    # Contracts exist + are valid JSON
    project_schema = load_json(ROOT / "contracts/project_pack/v1.schema.json")
    payload_schema = load_json(ROOT / "contracts/report_payload/v1.schema.json")

    # Examples validate
    project = load_json(ROOT / "examples/project_pack/sample_project.json")
    payload = load_json(ROOT / "examples/report_payload/sample_payload.json")

    validate(project, project_schema, "examples/project_pack/sample_project.json")
    validate(payload, payload_schema, "examples/report_payload/sample_payload.json")

    # YAML registries parse
    for p in (ROOT / "registries").rglob("*.yaml"):
        yaml.safe_load(p.read_text(encoding="utf-8"))

    # Templates & docs exist
    required = [
        "docs/00_scope.md",
        "docs/01_masterplan.md",
        "docs/02_user_manual.md",
        "docs/03_onboarding_inputs.md",
        "configs/report_templates/monthly_de.md",
        "configs/report_templates/monthly_en.md",
        "configs/report_rules/actions_v1.yaml",
        "configs/system/system_manifest_v1.yaml",
        "configs/system/reporting_policy_v1.yaml",
        "configs/system/system_runbook_v1.yaml",
    ]
    for r in required:
        if not (ROOT / r).exists():
            raise SystemExit(f"Missing required file: {r}")

    print("OK: contracts + examples + registries + required docs validated.")

if __name__ == "__main__":
    main()
