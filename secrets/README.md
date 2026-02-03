# Local secrets (not committed)

Place per-service environment files here. These files are ignored by git.

Recommended layout:
- secrets/gsc.env
- secrets/dataforseo.env
- secrets/pagespeed.env
- secrets/crux.env
- secrets/rybbit.env
- secrets/openai.env
- secrets/notion.env

You can also use a single local `.env`, but per-service files reduce risk.

Example (gsc.env):
GSC_AUTH_MODE=service_account
GSC_CREDENTIALS_JSON=/absolute/path/to/service_account.json

Example (dataforseo.env):
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
DATAFORSEO_API_BASE=https://api.dataforseo.com

Example (pagespeed.env / crux.env):
GOOGLE_API_KEY=

Example (rybbit.env):
RYBBIT_API_KEY=
RYBBIT_API_BASE=
RYBBIT_SITE_ID=

Example (openai.env):
OPENAI_API_KEY=

Example (notion.env):
NOTION_TOKEN=
NOTION_DATABASE_ID=
