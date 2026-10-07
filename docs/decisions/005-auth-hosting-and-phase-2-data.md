# 005 — Auth placement, hosting and Phase 2 data

- Status: accepted
- Date: 2026-10-07

## Context

Phase 2 adds sign-in (email + password, Google), onboarding and wallets. The web app runs on Vercel at `mizania-roan.vercel.app`; the Fastify API isn't deployed yet. Session cookies must work on mobile browsers, including Safari, and the Phase 4 offline sync will call the API with the same session.

`*.vercel.app` is on the Public Suffix List, as are most free API hosts (`fly.dev`, `onrender.com`). So an API on any other host is a different site from the web app, and its cookies are third-party. Safari blocks those, and users appear logged out.

## Decision

### 1. Better Auth inside the Next.js app, configured in `packages/auth`

- Better Auth is configured once in `packages/auth` and mounted by `apps/web` at `/api/auth/[...all]`, with the `nextCookies()` plugin for server actions. The session cookie is set by the app's own domain: always first-party.
- In Phase 4 the Fastify API imports the same package to check sessions (`auth.api.getSession`) against the same database. It's reached through a Next.js rewrite (`/api/v1/*`), so requests stay same-origin and the same cookie works.
- Rejected: Better Auth in Fastify. It would need the API deployed now, a proxy for the cookie anyway, and an extra network hop (plus cold starts on free hosts) on every login.

Settings:

- **Email verification required** before the first sign-in. Google is the one-tap alternative.
- Sessions last **30 days**, renewed daily when used (Better Auth's default is 7 days, too short for a phone app).
- Rate limits stored in the **database**: Vercel functions don't share memory.
- **UUID** ids (matching `categories.user_id`) and plural table names.
- Account linking stays at the default: a Google sign-in only links to an existing account whose email is verified. No provider is "trusted", to avoid account takeover through an unverified email.

**Until Phase 4, data changes go through Next.js server actions** (noted in CLAUDE.md). The IndexedDB-first rule applies from Phase 4, when the API and sync arrive.

### 2. Hosting

- **Database:** Neon Free, project `mizania` in **Frankfurt** (`aws-eu-central-1`), the closest region to Tunisia. A `preview` branch serves Vercel preview deployments. Vercel connects through the **pooled** URL; migrations use the **direct** URL.
- **Web:** Vercel Hobby, function region **`fra1`** (Frankfurt), next to the database.
- **API (Phase 4):** a second Vercel project (Fastify runs on Vercel with zero config), also in `fra1`, behind the rewrite above.
- **Email:** Gmail SMTP with an app password for now (no domain needed). Locally, Mailpit. Moving to a custom domain + Resend later is only a configuration change.

### 3. Migrations

- CI applies migrations and the idempotent seed after the checks pass: to the production database on pushes to `main` (`DATABASE_URL_DIRECT`), and to the shared `preview` branch on pushes to any other branch (`DATABASE_URL_PREVIEW_DIRECT`).
- Vercel may deploy new code a minute before its migration runs. So **migrations only add things**: new tables, new nullable or defaulted columns. Removing or renaming waits for a later release, after no deployed code uses the old shape.
- The `preview` branch is shared by all feature branches. If an abandoned branch leaves it in a bad state, reset it from `main` in Neon.

### 4. Phase 2 tables

- `0001` (PR 1): Better Auth's `users`, `sessions`, `accounts`, `verifications`, `rate_limits`. `users` also has `locale`, `weekly_mode` (default **true**), `checkin_time` and `deleted_at`. Adds the foreign key `categories.user_id → users.id`.
- `0002` (PR 3): `users` gains `usual_monthly_millimes`, `usual_arrival_day`, `onboarded_at`; new `wallets`, `cycles` (at most one active per user), `plan_items` and `transactions`. Starting balances are `adjustment` transactions; balances are always derived, never stored. `hlc` columns come with Phase 4 (ADR 001).

## Consequences

- Login and every later request share one first-party cookie, on every browser.
- No extra service to run or pay for until Phase 4.
- Phase 2–3 screens that change data need a connection; they show an offline state until Phase 4.
- Destructive schema changes take two releases.
- Risk to check in PR 2: an installed iPhone PWA keeps cookies separate from Safari, so a Google sign-in started there may not reach the app. Fallback: a one-time-token handoff.
