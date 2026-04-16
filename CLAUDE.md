# Karakeep Fork — joceqo/karakeep

Fork of karakeep-app/karakeep. Goal: dev-oriented knowledge hub with GitHub-native features, social feed aggregation, Eagle-style visual UI, and AI discovery. See ROADMAP.md for full feature plan.

## What changed from upstream

- **Auth**: Logto OIDC replaces password-only auth (via built-in `OAUTH_*` env vars)
  - Logto instance: `auth.joceqo.com` (self-hosted, Dokploy)
  - GitHub social connector with Secret Vault storing GitHub access token
  - ES384 JWT algorithm fix in `apps/web/server/auth.ts`
- **Sign-in page**: Redesigned minimal layout, theme-aware, lucide icons
- **Env**: dotenvx for encrypted `.env` management
- **Node**: Pinned to v22 via `.tool-versions` (better-sqlite3 compat)

## Architecture

- Monorepo: pnpm workspaces + Turborepo
- Frontend: Next.js App Router + React + Tailwind + Radix UI
- API: tRPC (`packages/trpc`) + Hono REST (`packages/api`)
- DB: SQLite (better-sqlite3) + Drizzle ORM (`packages/db`)
- Search: Meilisearch
- Workers: `apps/workers` — background jobs (crawl, AI tag, archive)
- Auth: NextAuth JWT strategy + Logto OIDC provider
- Plugins: `packages/plugins/` — search, queue, rate limit

## Dev setup

```bash
# Prerequisites: Docker Desktop running, Node 22, pnpm 9
pnpm install
pnpm run db:migrate

# Docker services (Meilisearch + headless Chrome):
docker run -d -p 7700:7700 --name karakeep-meilisearch getmeili/meilisearch:v1.13.3
docker run -d -p 9222:9222 --name karakeep-chrome gcr.io/zenika-hub/alpine-chrome:124 \
  --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222 --hide-scrollbars

pnpm web      # http://localhost:3000
pnpm workers  # background workers
```

Env encrypted with dotenvx. Scripts auto-decrypt via `dotenvx run --`. Keys in `.env.keys` (gitignored).

## Commands

| Command | Description |
|---------|-------------|
| `pnpm web` | Start web app (dotenvx decrypts env) |
| `pnpm workers` | Start background workers |
| `pnpm run db:migrate` | Run Drizzle migrations |
| `pnpm db:generate --name <desc>` | Generate migration after schema changes |
| `pnpm preflight` | Typecheck + lint + format (pre-commit hook) |
| `pnpm exec prettier --write <file>` | Fix formatting on single file |
| `pnpm exec dotenvx set KEY value` | Set/update encrypted env var |

## Key files

| File | Purpose |
|------|---------|
| `apps/web/server/auth.ts` | NextAuth config, Logto OAuth provider, JWT callbacks |
| `apps/web/app/signin/page.tsx` | Sign-in page |
| `packages/db/schema.ts` | Database schema (Drizzle) |
| `packages/trpc/` | All tRPC routers — business logic lives here |
| `packages/shared/config.ts` | Server config (reads all env vars) |
| `packages/plugins/` | Plugin system (search, queue, rate limit) |
| `apps/workers/` | Background job processors |

## External services

- **Logto** (`auth.joceqo.com` / `auth-admin.joceqo.com`) — self-hosted on Dokploy
  - GitHub connector scopes: `repo read:user user:email read:org gist notifications read:packages read:project read:discussion`
  - Secret Vault enabled — stores GitHub OAuth tokens
  - Account API: `GET /api/my-account/identities/github/access-token`
  - Traditional Web app (App ID in encrypted `.env`)
- **Dokploy** (`dokploy.joceqo.com`) — manages all self-hosted infra
- **GitHub API** — authenticated via stored token (5000 req/hr)

## Code style

- Run `pnpm preflight` before committing (husky pre-commit hook enforces this)
- Prettier for formatting, oxlint for linting
- Use theme tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-accent` — never hardcode colors
- Use `lucide-react` for all icons
- Keep changes focused — this is a fork, stay mergeable with upstream where possible
- New features: add tRPC router in `packages/trpc`, UI in `apps/web`, worker jobs in `apps/workers`
- Schema changes: edit `packages/db/schema.ts`, then `pnpm db:generate --name <desc>`
