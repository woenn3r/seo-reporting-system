# syntax=docker/dockerfile:1
# Build context = repository root (the app reads contracts/, examples/ and apps/social-studio/i18n/).
# Usually used via apps/social-studio/docker-compose.yml.

FROM node:22-bookworm-slim AS deps
WORKDIR /repo/apps/social-studio/web
COPY apps/social-studio/web/package.json apps/social-studio/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS source
WORKDIR /repo
COPY contracts/social_studio contracts/social_studio
COPY examples/social_studio examples/social_studio
COPY apps/social-studio/i18n apps/social-studio/i18n
COPY apps/social-studio/web apps/social-studio/web
WORKDIR /repo/apps/social-studio/web

# Typecheck + unit tests + production build (fails the image build if anything is red)
FROM source AS check
RUN npm run typecheck && npm test && npm run build

FROM source AS build
RUN npm run build

# Production-like serving: static files behind nginx with SPA fallback
FROM nginx:1.27-alpine AS runtime
COPY apps/social-studio/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/social-studio/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

# Browser end-to-end tests (Playwright version must match @playwright/test in package.json)
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS e2e
WORKDIR /repo/apps/social-studio/web
COPY --from=source /repo /repo
ENV CI=1
CMD ["npx", "playwright", "test"]
