# 006 — Budget engine: daily money, reserved money, week snapshots, late transfers

- Status: accepted
- Date: 2026-10-09

## Context

ADR 003 defines today's spendable amount from four inputs: `poolNow`, `spentToday`, `spentThisWeekBeforeToday` and the cycle dates. ADR 004 defines the check-in and the run-out forecast, which needs the daily spending of recent days. Phase 3 connects these formulas to real data: wallets and transactions (Phase 2), plan items, and new tables. This ADR fixes what each input means, so the home screen, the check-in and the warnings all agree, and so Phase 4 can move the same calculation to the phone.

## Decision

### 1. One core function turns data into the inputs

`cycleSummary` in `packages/core` takes the active cycle, its plan items, the user's wallets and their transactions that aren't deleted, and today's date (Africa/Tunis). It returns `available`, `reserved`, `poolNow`, `spentToday`, `spentThisWeekBeforeToday` and the daily-money spending per day. The server (and, from Phase 4, the phone) only loads rows and calls it, then `todayBudget` and `runOutForecast`. Nothing outside core classifies spending.

### 2. Available and reserved

- **available** = the sum of the active wallets' balances (`walletBalances`). Archived wallets are always at 0.
- **reserved** = the sum over the cycle's plan items of:
  - an **unpaid fixed cost**: its planned amount (a paid one reserves 0);
  - an **envelope**: `max(0, planned − spent in its category this cycle)`;
  - **savings**: the full amount for this cycle. The money stays in the wallets but is set aside.
- **poolNow** = `dailyPool(available, reserved)` (ADR 003).

Which categories are fixed costs: rent, electricity, water, internet and the trip home. Phone recharge is an **envelope** (since 2026-10-09): it's topped up several times a month at a kiosk and logged with quick log, so each top-up uses the envelope first and any overspend is daily money; without a phone recharge envelope in the plan, top-ups are daily money.

A fixed cost can be paid in parts (rent in two halves): each payment uses up its planned amount, and an unpaid fixed cost reserves only what's left to pay. "That's everything for this month" marks it paid, which releases whatever is left into the daily money.

Envelopes are matched to spending **by category when the numbers are computed**, not by a stored link, so editing the plan never leaves stale links. Fixed costs are paid only through "Mark paid", which records an expense linked to its plan item (`plan_item_id`) with the amount actually paid. Quick log doesn't offer fixed-cost categories.

### 3. What counts as daily-money spending

Counted in `spentToday`, `spentThisWeekBeforeToday` and the forecast's history, on the day (Africa/Tunis) it happened:

- expenses in a category that has no envelope in this cycle's plan;
- check-in "unlogged spending";
- the part of an envelope expense beyond the envelope's remainder;
- the part of a fixed-cost payment above its planned amount;
- negative adjustments after the cycle starts (for example archiving a wallet with "I don't have this money any more").

Not counted: transfers between wallets, envelope spending within the envelope, fixed-cost payments up to the planned amount, income, starting balances and positive adjustments.

**Why the overspent parts count as spending:** ADR 003 promises that today's amount stays the same all day. If 10 DT over an envelope only lowered `poolNow`, this morning's money (`poolNow + spentToday`) would drop mid-day. Counting it as spent today lowers "left" instead and rolls into tomorrow.

**Good news shows at once:** whatever raises the daily money (income, a bill cheaper than planned, a smaller plan) goes straight into `poolNow`. Today's amount can go up during the day, never down.

### 4. Week snapshot (fixes ADR 003's known limitation)

- Table `week_snapshots (id, user_id, cycle_id, week_index, starts_on, ends_on, allowance_millimes, created_at)`, unique on `(cycle_id, week_index)`, with the same-user foreign key as transactions.
- **Stored lazily:** the first time the budget is computed on a day of a week without a snapshot, its allowance is ADR 003's fair share of `poolNow + spentToday + spentThisWeekBeforeToday` at that moment. The insert ignores a duplicate and reads the row back, so two tabs or devices agree. "I received money" stores week 1 right away.
- **Used:** `todayBudget` takes an optional `weekAllowance`. What's left of the week this morning is `min(weekAllowance − spent earlier this week, this morning's money)`: a plan change mid-week can't make the week promise money that no longer exists, so "never more than exists" still holds.
- **Not changed by** mid-week plan edits or extra income: their effect shows from next week. That's the point of the snapshot.
- **Deleted and stored again** (current and later weeks of the cycle) when the expected date moves or a new cycle starts.

### 5. Late transfers

From the expected date, the home screen asks "Did the money arrive?":

- **Yes** opens "I received money".
- **Not yet** asks for a new expected date (default: 2 days later), moves `expected_next_on`, and stores the week snapshots again.

Without this, ADR 003's `daysLeft` of 1 after the expected date would show all the remaining money as today's amount. Reminders and notifications stay in Phase 6.

### 6. New month or extra money

"I received money" always asks whether this is the monthly transfer or extra money, defaulting to "new month" within 5 days of the expected date.

- **New month:** closes the active cycle (`actual_end_on` = today), starts a new one and copies the last cycle's plan as suggestions. Leftover money simply stays in the wallets and becomes part of the new month's money.
- **Extra money** (a bourse, a job): an income in the current cycle.

The income's source (parents, bourse, job, other) is a nullable `income_source` column on `transactions`, set only for income. There is no separate `incomes` table: balances come from transactions, and a second table would be a second source of truth.

## Consequences

- The home screen, check-in, warnings and the later offline client compute the same numbers from the same rows.
- Property tests in core cover: every millime of spending is classified once, transfers change nothing, and paying a fixed cost at its planned amount leaves the daily money unchanged.
- Integration tests cover the snapshot being stored once under concurrent requests.
- Today's amount never drops during the day, whatever is logged.
- A week's amount is stable even when the plan changes, at the price of plan changes showing only from next week in weekly mode.
- Moving leftover money to savings, and savings goals, wait for V1.
