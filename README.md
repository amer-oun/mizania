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

| Command                        | Does                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Web (Next.js), API (Fastify) and worker, in watch mode                                    |
| `pnpm build`                   | Production builds, including the service worker (`apps/web/public/sw.js`)                 |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript across the workspace                                                  |
| `pnpm test`                    | Vitest. Database and auth tests start a Postgres container: Docker must be running        |
| `pnpm test:e2e`                | Playwright, against a production build (`pnpm build` first) with `docker compose` running |
| `pnpm format` / `format:check` | Prettier                                                                                  |
| `pnpm db:generate`             | New Drizzle migration from the schema                                                     |
| `pnpm db:migrate` / `db:seed`  | Apply migrations / upsert the default categories                                          |

## Accounts and email locally

Sign up at http://localhost:3000/ar/sign-up (or `/fr`, `/en`). Emails don't leave your machine: the verification and password-reset links arrive in Mailpit at http://localhost:8025. Verification links work for 24 hours, reset links for 1 hour.

After the first sign-in, a new account goes through the onboarding wizard (`/[locale]/onboarding`: language, money from home, rent and bills, wallets) before it can see the app. Its answers stay in the browser until "Finish" saves them all at once. To go through it again locally, set `onboarded_at` back to null for your user and delete its transactions, then its wallets and cycles (for example in `pnpm --filter @mizania/db db:studio`).

The **Today** tab (`/[locale]`) shows how much you can spend today, how much is left, the status and, in weekly mode, this week's money. Tap the amount to see how it's calculated. The **+** button logs an expense: type the amount on the keypad, then tap the category, which saves it (cash by default, or the wallet last used for that category). Today's expenses are listed under the number; deleting one is a soft delete with Undo. The **Plan** tab lists this month's fixed costs and envelopes: **Pay** records what a fixed cost really cost (in full or in parts), and **Undo** reverses the last payment. **Change my plan** edits fixed costs, envelopes and one savings line, with a live preview of today's amount; nothing changes until you save (ADR 006 §7). On the over-budget screen, **Adjust my plan** opens the same editor. The numbers come from `cycleSummary` and `todayBudget` in `packages/core` (ADR 003 and ADR 006); in weekly mode each week's amount is stored in `week_snapshots` the first time it's needed.

The **Wallets** tab (`/[locale]/wallets`) lists the wallets with their balances, which are always computed from transactions (a starting balance is an adjustment). From there you can add, rename ("Other" wallets only), reorder and archive wallets, and record transfers between them, such as a cash withdrawal from the card. Undoing a transfer soft-deletes it.

The first time, install the browser for the end-to-end tests:

```powershell
pnpm --filter @mizania/web exec playwright install chromium
```

## Try the PWA on your phone

The service worker only exists in a production build:

```powershell
pnpm build
pnpm --filter @mizania/web start
```

Then open `http://<your-PC-LAN-IP>:3000` on your phone (same Wi-Fi). Browsers only install PWAs and register service workers on HTTPS or `localhost`. To install from a phone, use an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:3000`) or deploy a preview.

## Production

See [ADR 005](docs/decisions/005-auth-hosting-and-phase-2-data.md) for why it's set up this way.

| Where                  | Variables                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel, Production     | `DATABASE_URL` (Neon main, pooled), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Vercel, Preview        | `DATABASE_URL` (Neon `preview` branch, pooled), `BETTER_AUTH_SECRET`, `SMTP_*`, `EMAIL_FROM`, `GOOGLE_*` (unused: Google is off on previews)                                                  |
| GitHub Actions secrets | `DATABASE_URL_DIRECT` (Neon main, direct), `DATABASE_URL_PREVIEW_DIRECT` (Neon `preview`, direct)                                                                                             |

**Auth on Preview deployments:** `BETTER_AUTH_URL` isn't set there. The app then accepts exactly the deployment's own two hosts (`VERCEL_URL` and `VERCEL_BRANCH_URL`, from Vercel's system environment variables, which must stay enabled) and refuses any other host. Previews are behind Vercel's login, so open email links in a browser where you're signed in to Vercel.

**Google sign-in** works locally and in production only: the OAuth client "Mizania Web" accepts redirects to `http://localhost:3000/api/auth/callback/google` and `https://mizania-roan.vercel.app/api/auth/callback/google`. Previews have neither a registered redirect nor a fixed URL, so the button is hidden there. While the Google app is in Testing mode, only its test users can sign in with Google.

**Privacy and terms** are drafts: fill in `CONTACT_EMAIL` and turn off `LEGAL_DRAFT` in `apps/web/src/lib/legal.ts` after reviewing them. The public home page for Google's branding review is `/en/welcome` (signed-out visitors to `/` land there).

**Auth emails** go through Gmail (port 465). A failed send doesn't block the user; it shows up in the Vercel function logs as `auth email failed` with the user id and SMTP error code (never the address or link).

**Migrations reach the databases through CI**, after all checks pass: pushes to `main` migrate and seed production; pushes to any other branch migrate and seed the shared `preview` branch. Migrations must only add things (new tables, new nullable or defaulted columns), because Vercel can deploy the new code a moment before its migration runs.

## Repository layout

```
apps/web        Next.js PWA (next-intl, Tailwind, shadcn/ui, Serwist)
apps/api        Fastify API
apps/worker     Background jobs (Redis)
packages/core   Pure business logic, no I/O
packages/auth   Better Auth configuration and auth emails
packages/db     Drizzle schema, migrations, seed
packages/shared Zod schemas, types, constants
packages/sync   Offline sync protocol
packages/parser Quick-entry parser
packages/config Shared tsconfig, ESLint, Prettier, Tailwind theme
```
