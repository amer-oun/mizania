# Mizania (ميزانية)

An offline-first budgeting PWA for Tunisian students who get money monthly from home. It shows how much you can spend today until the next transfer. Arabic (RTL), French and English.

**Live:** https://mizania-roan.vercel.app

Full spec and roadmap: [PLAN.md](PLAN.md). Conventions for contributors and Claude Code: [CLAUDE.md](CLAUDE.md). Decisions: [docs/decisions](docs/decisions).

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 12 (`corepack enable`, or `npm i -g pnpm@12`)
- Docker Desktop, running

## Run locally (PowerShell)

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d --wait
pnpm db:migrate; pnpm db:seed
pnpm dev
```

The same commands work in bash (`cp .env.example .env`). Stop the dev servers with Ctrl+C.

| What       | URL                                                                                   |
| ---------- | ------------------------------------------------------------------------------------- |
| Web app    | http://localhost:3000 (redirects to `/ar`, `/fr` or `/en` from your browser language) |
| API health | http://localhost:4000/health                                                          |
| Mailpit    | http://localhost:8025                                                                 |
| Postgres   | `localhost:5432` (user/password/db: `mizania`)                                        |
| Redis      | `localhost:6379`                                                                      |

### Ports already in use?

If another project already uses 5432 or 6379, change the ports in `.env` only and keep `.env.example` unchanged. For example:

```dotenv
POSTGRES_PORT=5433
REDIS_PORT=6380
DATABASE_URL=postgres://mizania:mizania@localhost:5433/mizania
REDIS_URL=redis://localhost:6380
```

Then run `docker compose up -d --wait` again.

## Scripts

| Command                        | Does                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`                     | Web (Next.js), API (Fastify) and worker, in watch mode                    |
| `pnpm build`                   | Production builds, including the service worker (`apps/web/public/sw.js`) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript across the workspace                                  |
| `pnpm test`                    | Vitest. Database tests start a Postgres container: Docker must be running |
| `pnpm format` / `format:check` | Prettier                                                                  |
| `pnpm db:generate`             | New Drizzle migration from the schema                                     |
| `pnpm db:migrate` / `db:seed`  | Apply migrations / upsert the default categories                          |

## Try the PWA on your phone

The service worker only exists in a production build:

```powershell
pnpm build
pnpm --filter @mizania/web start
```

Then open `http://<your-PC-LAN-IP>:3000` on your phone (same Wi-Fi). Browsers only install PWAs and register service workers on HTTPS or `localhost`. To install from a phone, use an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:3000`) or deploy a preview.

## Production

See [ADR 005](docs/decisions/005-auth-hosting-and-phase-2-data.md) for why it's set up this way.

| Where                  | Variables                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel, Production     | `DATABASE_URL` (Neon main, pooled), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` |
| Vercel, Preview        | `DATABASE_URL` (Neon `preview` branch, pooled), `BETTER_AUTH_SECRET`, `SMTP_*`, `EMAIL_FROM`                                                      |
| GitHub Actions secrets | `DATABASE_URL_DIRECT` (Neon main, direct), `DATABASE_URL_PREVIEW_DIRECT` (Neon `preview`, direct)                                                 |

**Migrations reach the databases through CI**, after all checks pass: pushes to `main` migrate and seed production; pushes to any other branch migrate and seed the shared `preview` branch. Migrations must only add things (new tables, new nullable or defaulted columns), because Vercel can deploy the new code a moment before its migration runs.

## Repository layout

```
apps/web        Next.js PWA (next-intl, Tailwind, shadcn/ui, Serwist)
apps/api        Fastify API
apps/worker     Background jobs (Redis)
packages/core   Pure business logic, no I/O
packages/db     Drizzle schema, migrations, seed
packages/shared Zod schemas, types, constants
packages/sync   Offline sync protocol
packages/parser Quick-entry parser
packages/config Shared tsconfig, ESLint, Prettier, Tailwind theme
```
