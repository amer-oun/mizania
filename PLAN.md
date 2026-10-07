# Mizania (ميزانية)

> **Mizania tells Tunisian students how much they can spend each day until their next transfer from home, splits rent and bills with flatmates, and takes 5 seconds a day to use.**

---

## 1. The problem

Most Tunisian university students rent near campus, away from home. Their parents send money **once a month** (some also get a bourse). That money has to cover rent, bills, groceries, coffee, transport and going out until the next transfer.

What goes wrong:

- **Front-loading:** money arrives, the first week feels rich, the last week is empty.
- **Invisible small spending:** coffee, snacks, photocopies and louage trips add up without anyone noticing.
- **Money is scattered:** cash in the pocket, some in D17, some in Flouci, some on a card.
- **Irregular timing:** parents don't always send on the same day; a bourse can arrive late.
- **Shared costs are messy:** rent, STEG, SONEDE, internet and groceries split between flatmates.

Existing budgeting apps aren't built for this: they assume a salary, a bank sync, and a calendar month.

---

## 2. The solution: one number

The home screen shows one main number:

> ### You can spend **12.500 DT** today
>
> 9 days until your next transfer · on track ✓

Everything in the app exists to make that number correct and to keep the student using the app.

### The core loop

```
Money arrives ──► Plan it (once, 1 minute) ──► Spend + check in daily (5 seconds)
     ▲                                                   │
     └──── Next transfer ◄── Warnings & rollover ◄───────┘
```

1. **Money arrives.** Student taps "I received money": amount, source (parents / bourse / job / other), wallet (cash / D17 / Flouci / card), expected date of the next transfer.
2. **Plan it.** The app suggests a split based on last month, the student adjusts:
   - **Fixed costs** (paid once): rent share, STEG, SONEDE, internet, phone recharge, transport home
   - **Envelopes** (spent over the month): groceries, studies
   - **Savings goal** (optional): laptop, summer
   - **Daily money:** whatever is left = coffee, snacks, going out, small transport
3. **Spend.** Two ways, the student picks:
   - **Quick log:** "+" → amount → category, or type `9ahwa 2.5`
   - **Evening check-in:** "How much do you have left?" The app calculates what was spent. No need to log every coffee.
4. **Stay on track.** Unspent daily money rolls into tomorrow. Early, kind warnings: _"At this pace you'll run out on the 22nd, 6 days early. Spending 2 DT less per day fixes it."_
5. **Next transfer.** On the expected date, the app asks "Did the money arrive?". If not, it extends the cycle and recalculates the daily amount. Leftover money moves to the next month or to savings.

### Weekly mode (fixes front-loading)

Because money arrives monthly, the daily money is split into **weekly portions**. Week 1 can't eat into week 4. Unspent money from a week rolls forward. Students can turn this off.

---

## 3. Features

### MVP: the core loop (ship this first, test with real students)

- Sign up / log in (email + Google)
- Onboarding wizard (under 2 minutes): language, usual monthly amount, usual arrival day, rent share, usual bills, wallets
- Wallets: Cash, D17, Flouci, Card, Other (manual balances, transfers between them)
- "I received money" flow with the next expected transfer date
- Month plan: fixed costs, envelopes, savings, daily money; suggested from last month
- **Daily spendable amount** with weekly mode and rollover
- Quick log expense (under 3 taps)
- Evening check-in (balance-based tracking)
- Mark fixed costs as paid
- Simple history: this month by category, compared with last month
- Arabic (RTL), French, English
- Installable PWA, works offline

### V1: after the pilot

- Early warnings ("you'll run out on the 22nd")
- Late transfer handling (extend cycle, recalculate)
- **Flatmates:** shared household, split rent/bills/groceries (equal, by amount, by share), balances, settle up with the fewest transfers
- Savings goals with progress
- Notifications: evening check-in reminder, fixed cost due, warnings (all user-controlled)
- **Derja quick entry:** `9ahwa 2.5`, `louage sousse 12`, `قهوة ٢٫٥`
- **"Ask for money" message:** writes a polite message for parents with a short summary of what the last transfer covered; student copies it into WhatsApp/Messenger (nothing is sent automatically)
- Export CSV, delete account

### Stretch (only after V1 ships)

- End-of-month recap card students can share (no amounts, just "I stayed on budget 3 months in a row")
- Streaks for daily check-ins
- AI monthly tips based on aggregates only

### Deliberately NOT in scope

- **Sending money from the app.** That needs Central Bank licensing and serious security. Transfers happen in D17/Flouci; Mizania only records them.
- **Reading D17/Flouci balances automatically.** As far as is known, there is no public API for reading a personal account's transactions (verify before deciding). Wallets are tracked manually, and the evening check-in keeps them accurate.
- **Parent dashboard.** Students won't use an app their parents watch. The student stays in control.

---

## 4. How the numbers work

All money is stored as **integer millimes** (1 TND = 1000 millimes).

### Daily spendable amount

```
available        = sum of wallet balances
reserved         = unpaid fixed costs + envelope remainders + savings for this cycle
daily_pool       = available − reserved
days_left        = days from today until expected next transfer (inclusive of today)

normal mode:     today = daily_pool / days_left
weekly mode:     week_left  = this week's portion + rollover − spent this week
                 today      = week_left / days left in this week
```

- If `daily_pool < 0` → "over budget" state with a recovery suggestion.
- Rollover is automatic: spending less today raises tomorrow's amount.

### Evening check-in

```
expected_cash = cash at last check-in + cash received − cash logged
spent_unlogged = expected_cash − reported_cash
```

If `spent_unlogged > 0`, the app records one "unlogged spending" transaction in the daily money (the student can categorize it if they want). If negative, it asks whether they forgot to log money they received.

### Warnings

```
avg_daily_spend   = flexible spending over last 7 days / 7
runs_out_on       = today + daily_pool / avg_daily_spend
```

Warn when `runs_out_on` is before the next transfer, and say how much less per day fixes it.

### Splitting and rounding

Splitting 10.000 DT among 3 people gives 3.334 + 3.333 + 3.333. Remainder millimes are distributed deterministically. Property-based tests prove splits always sum to the total.

---

## 5. Tech stack

| Layer          | Choice                                                                   | Why                               |
| -------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo                                              | Shared code between web and api   |
| Language       | TypeScript (strict)                                                      |                                   |
| App            | Next.js (App Router) as an installable **PWA**                           | Phone-first, no app store needed  |
| UI             | Tailwind + shadcn/ui, next-intl (AR RTL / FR / EN)                       |                                   |
| Local DB       | IndexedDB via Dexie                                                      | Offline-first                     |
| Service worker | Serwist                                                                  | Offline cache, push notifications |
| API            | Fastify                                                                  |                                   |
| Validation     | Zod (shared)                                                             |                                   |
| DB             | PostgreSQL + Drizzle ORM                                                 |                                   |
| Jobs           | Redis + BullMQ                                                           | Reminders, warnings, cycle checks |
| Auth           | Better Auth                                                              | Email + Google                    |
| Testing        | Vitest, fast-check, Playwright (incl. offline), Testcontainers           |                                   |
| Monitoring     | Sentry, pino                                                             |                                   |
| Hosting        | Vercel (web), Fly.io or Railway (api + worker), managed Postgres + Redis |                                   |
| CI/CD          | GitHub Actions                                                           |                                   |

Keep the stack boring. The interesting part is the product logic and offline sync.

---

## 6. Repository structure

```
mizania/
├── apps/
│   ├── web/          # Next.js PWA
│   ├── api/          # Fastify REST + sync
│   └── worker/       # Reminders, warnings, cycle jobs
├── packages/
│   ├── core/         # Pure business logic: money, cycles, daily amount,
│   │                 # check-in, warnings, splits. No I/O. Heavily tested.
│   ├── db/           # Drizzle schema, migrations, seed
│   ├── shared/       # Zod schemas, types, constants
│   ├── sync/         # Offline sync protocol (client + server)
│   ├── parser/       # Derja/AR/FR quick-entry parser (V1)
│   └── config/       # eslint, tsconfig, tailwind
├── docs/decisions/   # ADRs
├── docker-compose.yml
├── CLAUDE.md
├── PLAN.md
└── README.md
```

`packages/core` is the heart of the project. It runs both in the browser (offline) and on the server, so the daily amount is always the same everywhere.

---

## 7. Data model

```
users              (id, email, name, locale[ar|fr|en], weekly_mode bool,
                    checkin_time, created_at, deleted_at)

wallets            (id, user_id, name, type[cash|d17|flouci|card|other],
                    archived, position)

cycles             (id, user_id, started_on, expected_next_on, actual_end_on,
                    status[active|closed], weekly_mode)
incomes            (id, user_id, cycle_id, wallet_id, amount_millimes,
                    source[parents|bourse|job|other], received_on, note)

plan_items         (id, cycle_id, kind[fixed|envelope|savings], name, category_id,
                    amount_millimes, due_on nullable, paid_at nullable,
                    household_expense_id nullable)

categories         (id, user_id nullable (null = default), key, icon, color,
                    group[fixed|envelope|daily|income])

transactions       (id client UUID, user_id, cycle_id, wallet_id, category_id,
                    plan_item_id nullable, type[expense|income|transfer|adjustment],
                    amount_millimes, to_wallet_id, occurred_at, note,
                    source[quick|text|checkin|plan|household],
                    updated_at, deleted_at, hlc)

checkins           (id, user_id, wallet_id, reported_millimes, expected_millimes,
                    difference_millimes, created_at)

savings_goals      (id, user_id, name, target_millimes, deadline)

households         (id, name, created_by, invite_code_hash, invite_expires_at)
household_members  (household_id, user_id, role[admin|member], joined_at, left_at)
household_expenses (id, household_id, paid_by, amount_millimes, category_id,
                    description, occurred_at, split_type[equal|exact|shares],
                    updated_at, deleted_at)
household_splits   (household_expense_id, user_id, share_millimes)
settlements        (id, household_id, from_user, to_user, amount_millimes, occurred_at)

push_subscriptions (id, user_id, endpoint, keys jsonb)
sync_cursors       (user_id, device_id, last_pulled_at)
```

Default categories (with AR/FR/EN names): Rent, Electricity (STEG), Water (SONEDE), Internet, Phone recharge, Groceries, Coffee, Food out, Transport (louage, bus, metro, taxi), Trip home, Studies (books, photocopies), Going out, Health, Clothes, Other.

---

## 8. Phases (~10 weeks part-time, ~15–20h/week)

Each phase ends with tests passing, CI green and a deploy. **Real students use the app from Phase 4 onward.**

### Phase 0: Foundation (3–4 days)

- [ ] Monorepo, strict TS, ESLint, Prettier
- [ ] docker-compose: Postgres, Redis, Mailpit
- [ ] Drizzle, first migration, seed default categories
- [ ] Next.js PWA (manifest, icons, service worker), next-intl with AR RTL / FR / EN
- [ ] Skeleton api and worker
- [ ] GitHub Actions CI
- **Done when:** the empty app installs on your phone and switches to Arabic with an RTL layout.

### Phase 1: Core logic, no UI (1 week)

- [ ] `packages/core/money`: parse, format per locale, add, split (property-based tests)
- [ ] `packages/core/cycle`: days left, weekly portions, late transfer extension
- [ ] `packages/core/daily`: daily spendable amount (normal + weekly mode, rollover)
- [ ] `packages/core/checkin`: unlogged spending calculation
- [ ] `packages/core/warnings`: run-out date and fix-per-day amount
- [ ] Write the formulas from §4 as tests first, then implement
- **Done when:** core logic has ~100% coverage and you can explain every formula.

### Phase 2: Auth, onboarding, wallets (1 week)

- [ ] Auth (email + Google)
- [ ] Onboarding wizard: language → monthly amount + arrival day → rent + bills → wallets with starting balances
- [ ] Wallet list, manual transfers between wallets (e.g. cash withdrawal from card)
- **Done when:** a new user finishes onboarding in under 2 minutes in any language.

### Phase 3: The core loop (1.5 weeks)

- [ ] "I received money" flow
- [ ] Month plan screen with suggestions from the previous cycle
- [ ] Home screen: today's amount, days left, status, week progress
- [ ] Quick log (under 3 taps)
- [ ] Evening check-in
- [ ] Mark fixed costs as paid
- [ ] This month by category vs last month
- **Done when:** you use it yourself for a full week and the daily number feels right.

### Phase 4: Offline-first + pilot (1.5 weeks)

- [ ] Dexie local DB; UI reads and writes locally first
- [ ] Sync protocol in `packages/sync`: push/pull, client UUIDs, HLC, soft deletes, idempotent
- [ ] Sync status indicator (synced / pending / offline)
- [ ] Tests: two devices editing offline, syncing in different orders → same result
- [ ] ADR: sync design and conflict strategy
- [ ] **Pilot: 10 students** use it for 2 weeks. Short feedback form + 3 quick interviews.
- **Done when:** expenses logged in airplane mode appear on another device after reconnecting, and you have real feedback.

### Phase 5: Fix what the pilot taught you (3–5 days)

- [ ] List the top 3 problems from feedback and fix them
- [ ] Write down what you learned in `docs/pilot-notes.md` (this goes in your README and interviews)

### Phase 6: Warnings, late transfers, notifications (1 week)

- [ ] Run-out warnings on the home screen
- [ ] "Did the money arrive?" on the expected date; extend cycle if not
- [ ] Cycle close: leftover → next month or savings
- [ ] Savings goals
- [ ] Push notifications: check-in reminder, fixed cost due, warnings (all toggleable)

### Phase 7: Flatmates (1.5 weeks)

- [ ] Create household, invite by link/code, join, leave (blocked if balance ≠ 0)
- [ ] Shared expenses with equal / exact / shares splits
- [ ] Your share automatically becomes a plan item or transaction in your own budget
- [ ] Balances and minimal settle-up suggestions; record settlements
- [ ] Tests: settle-up always brings every balance to zero; non-members can't see household data
- **Done when:** one real flat tracks a month of shared costs with it.

### Phase 8: Derja quick entry + "ask for money" (1 week)

- [ ] `packages/parser`: `9ahwa 2.5` → 2500 millimes, Coffee. Handles Latin derja, Arabic script, French, Arabic-Indic digits, `2.5` / `2500` / `2,500`
- [ ] 100+ table-driven test cases, collected from real students during the pilot
- [ ] Live preview while typing; user confirms before saving
- [ ] "Ask for money" message generator (AR / FR / derja), copy to clipboard
- **Done when:** `قهوة ٢٫٥` and `9ahwa 2.5` both create the right expense.

### Phase 9: Hardening (1 week)

- [ ] Playwright E2E: onboarding → receive money → plan → offline logging → sync → check-in → warning
- [ ] Lighthouse on mobile ≥ 90 for performance, accessibility, PWA
- [ ] Test on a low-end Android phone with throttled 3G
- [ ] Security: rate-limited auth, data isolation tests, secure headers, CSV export, account deletion
- [ ] Sentry in all apps

### Phase 10: Launch (1 week)

- [ ] Production deploy, demo account with a realistic month of data
- [ ] Share with 50+ students (university groups, student Facebook groups, friends' flats)
- [ ] Track simple, privacy-friendly metrics: weekly active users, check-in rate, % of users who finish a cycle on budget
- [ ] README (see §10), 2-minute demo video
- [ ] Blog post: "What I learned building a budgeting app for Tunisian students"
- [ ] LinkedIn post with real numbers

---

## 9. Working with Claude Code

1. Keep `CLAUDE.md` updated with the current phase.
2. One feature per session. Start in plan mode, review the plan, then implement.
3. **Write tests first** for everything in `packages/core`, `packages/sync` and `packages/parser`.
4. **Write the core logic yourself** (daily amount, check-in, sync, settle-up). Use Claude Code to review it and to generate extra test cases. These are your interview stories.
5. Review every diff. If something isn't clear, ask Claude to explain, then write an ADR in your own words.
6. Small commits, one PR per checklist item.

### Example prompts

- **Phase 0:** "Read PLAN.md and CLAUDE.md. Do Phase 0 only. No features. Show me the plan first."
- **Phase 1:** "Using the formulas in PLAN.md §4, write Vitest tests for packages/core/daily covering normal mode, weekly mode, rollover, over-budget and the last day of a cycle. Don't implement yet."
- **Phase 1:** "Write fast-check property tests for split(): any amount split among n people sums to the total and no two shares differ by more than 1 millime."
- **Phase 4:** "Review my sync code in packages/sync for idempotency bugs and race conditions. List issues; don't fix them."
- **Phase 8:** "Generate 50 more realistic quick-entry phrases in Tunisian derja (Latin and Arabic script), French and mixed, with expected outputs, in the format of parser.test.ts."

---

## 10. README checklist

- [ ] One-line pitch, live link, demo login
- [ ] GIF: money arrives → plan → today's amount → offline log → check-in
- [ ] Screenshots in Arabic (RTL) and French
- [ ] The problem in 3 sentences, with what you learned from the pilot
- [ ] Architecture diagram (PWA + IndexedDB ↔ sync API ↔ Postgres; worker + Redis)
- [ ] "Interesting problems" linking to ADRs: daily amount, check-in, offline sync, millimes, settle-up, derja parser
- [ ] Real usage numbers
- [ ] Lighthouse scores, test coverage, CI badge
- [ ] Run locally in 3 commands

---

## 11. Interview questions you'll be able to answer

- How is the daily amount calculated, and how does weekly mode stop students from spending everything early?
- Why balance-based check-ins instead of logging every expense? What did the pilot show?
- How does the app work offline, and what happens when two devices edit the same data?
- Why integers for money, and how do you split 10 DT among 3 people?
- How do you settle a flat's debts with the fewest transfers?
- Why didn't you integrate D17/Flouci or let users send money?
- What did real students tell you, and what did you change?
