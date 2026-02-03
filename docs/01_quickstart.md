# Quickstart (copy/paste safe)

## 1) Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

Env setup (no secrets in repo):
- Put values in `.env` (repo root) or `secrets/*.env`, or export in shell.
- See `.env.example` for required keys.

## 2) Workspace bootstrap (script)

```bash
./scripts/bootstrap_local.sh client_abc
```

## 3) Full check (script)

```bash
./scripts/check_all.sh
```

## 4) Manual commands (optional)

```bash
seo-report doctor --project client_abc --mock
seo-report generate --project client_abc --month auto --mock --lang de
seo-report generate --project client_abc --month auto --mock --lang en
```

Expected output:
- Reports are written to `~/seo-reporting-workspace/reports/client_abc/<YYYY-MM>/<lang>/`.
