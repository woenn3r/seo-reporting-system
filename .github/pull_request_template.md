## Summary
- What changed and why?

## Checklist (must pass)
### Contracts & IO
- [ ] If any IO changed: updated JSON Schemas in `contracts/**` (versioned if breaking)
- [ ] Updated `examples/**` to match schema changes
- [ ] Added/updated tests that validate examples against schemas

### Manifest / Policy / Runbook
- [ ] Updated `configs/system/system_manifest_v1.yaml` if any referenced file paths changed
- [ ] Updated `configs/system/reporting_policy_v1.yaml` if period behavior changed
- [ ] Updated `configs/system/system_runbook_v1.yaml` if operator steps changed

### Templates & Rules
- [ ] If templates changed: validated DE/EN output renders (smoke test)
- [ ] If actions rules changed: still produces 5–8 actions deterministically

### CI / Quality gates
- [ ] `validate_manifest` passes (fail-fast on missing files)
- [ ] `validate_schemas` passes (examples schema-valid)
- [ ] Golden/snapshot tests updated (if applicable)

### Security
- [ ] No secrets committed (checked `.env`, `secrets/`, tokens, credentials)
- [ ] `.gitignore` includes `secrets/` and local outputs

## Risk / Rollback
- Potential risks:
- Rollback plan:
