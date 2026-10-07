# CLAUDE.md — Mizania

Mizania is an offline-first budgeting PWA for Tunisian students who receive money monthly from home. Its home screen shows how much the student can spend today until the next transfer. Full spec, formulas and roadmap: `PLAN.md`. Read it before starting any task.

## Current phase

Phase 2: Auth, onboarding, wallets <!-- update as you progress -->

## Architecture

- `apps/web` — Next.js (App Router) PWA, Tailwind, shadcn/ui, next-intl (ar RTL / fr / en), Dexie (IndexedDB).
- `apps/api` — Fastify REST + sync endpoints. Input validated with Zod from `packages/shared`.
- `apps/worker` — BullMQ jobs: reminders, warnings, expected-transfer checks.
- `packages/core` — pure business logic (money, cycles, daily amount, check-in, warnings, splits). No I/O, no framework imports. Runs in browser and server.
- `packages/db` — Drizzle schema, migrations, seed.
- `packages/shared` — Zod schemas, types, constants.
- `packages/sync` — offline sync protocol.
- `packages/parser` — derja/AR/FR quick-entry parser (pure functions).
- Postgres + Redis via `docker-compose.yml`. Mailpit at http://localhost:8025.

## Commands

- `pnpm install`
- `docker compose up -d`
- `pnpm dev`
- `pnpm db:migrate` / `pnpm db:seed`
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e`

## Rules (non-negotiable)

- **Money is always an integer number of millimes** (1 TND = 1000 millimes). Never use floats. Format only for display via `packages/core/money`.
- All business calculations live in `packages/core` and follow the formulas in `PLAN.md` §4. UI and API call core; they never re-implement it.
- All dates and cycles use the `Africa/Tunis` time zone.
- Offline-first: the UI writes to IndexedDB first and never blocks on the network. Syncable records have a client UUID, `updated_at`, `deleted_at`, `hlc`. Never hard-delete syncable records. Sync is idempotent.
- Every query is scoped by `user_id`; household data also requires membership. Isolation has tests.
- The app never sends money and never connects to D17/Flouci/bank accounts. Wallets are manual.
- The "ask for money" feature only generates text for the user to copy. Nothing is sent automatically.
- All user-facing strings go through i18n; every layout must work in RTL.
- Code in `packages/core`, `packages/sync` and `packages/parser` ships with tests (property-based where it fits).
- packages/core must keep 100% coverage. A v8 ignore is allowed only for code that can't run, with a comment explaining why.

## Conventions

- Small focused changes; one feature per branch/PR; conventional commits.
- Propose a plan before implementing anything larger than one file.
- Significant decisions get an ADR in `docs/decisions/NNN-title.md`.
- Mobile-first UI; every view handles loading, empty, error and offline states.
- Keep the home screen focused on one number: today's spendable amount.
- Arabic UI text is written in Tunisian derja (Arabic script), friendly and short, not Modern Standard Arabic.
