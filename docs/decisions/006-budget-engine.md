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

Envelopes are matched to spending **by category when the numbers are computed**, not by a stored link, so editing the plan never leaves stale links. An envelope added mid-month covers spending only from when it's added (`plan_items.covers_from`, since 2026-10-09; null means the whole cycle), so earlier spending in its category stays daily money. Fixed costs are paid only through "Mark paid", which records an expense linked to its plan item (`plan_item_id`) with the amount actually paid. Quick log doesn't offer fixed-cost categories.

### 3. What counts as daily-money spending

Counted in `spentToday`, `spentThisWeekBeforeToday` and the forecast's history, on the day (Africa/Tunis) it happened:

- expenses in a category that has no envelope in this cycle's plan;
- check-in "unlogged spending";
- the part of an envelope expense beyond the envelope's remainder;
- the part of a fixed-cost payment above its planned amount;
- negative adjustments after the cycle starts (for example archiving a wallet with "I don't have this money any more").

Not counted: transfers between wallets, envelope spending within the envelope, fixed-cost payments up to the planned amount, income, starting balances and positive adjustments.

**Why the overspent parts count as spending:** ADR 003 promises that today's amount stays the same all day. If 10 DT over an envelope only lowered `poolNow`, this morning's money (`poolNow + spentToday`) would drop mid-day. Counting it as spent today lowers "left" instead and rolls into tomorrow.

**Good news shows at once:** whatever raises the daily money (income, a bill cheaper than planned, a smaller plan) goes straight into `poolNow`. Today's amount never goes down because of spending; only a plan change you confirm can lower it, and a plan change never raises this week's amount (§7). The one exception is a week stored at 0 while over budget, which a plan change rebuilds (§7).

### 4. Week snapshot (fixes ADR 003's known limitation)

- Table `week_snapshots (id, user_id, cycle_id, week_index, starts_on, ends_on, allowance_millimes, created_at)`, unique on `(cycle_id, week_index)`, with the same-user foreign key as transactions.
- **Stored lazily:** the first time the budget is computed on a day of a week without a snapshot, its allowance is ADR 003's fair share of `poolNow + spentToday + spentThisWeekBeforeToday` at that moment. The insert ignores a duplicate and reads the row back, so two tabs or devices agree. "I received money" stores week 1 right away.
- **Used:** `todayBudget` takes an optional `weekAllowance`. What's left of the week this morning is `min(weekAllowance − spent earlier this week, this morning's money)`: a plan change mid-week can't make the week promise money that no longer exists, so "never more than exists" still holds.
- **Not raised by** mid-week plan edits or extra income: their effect shows from next week. That's the point of the snapshot. A saved plan change can only **lower** it: the week keeps `min(stored amount, amount rebuilt with the new plan)`, except a week stored at 0, which is rebuilt (§7).
- **Money that waits for next week** (added 2026-10-14): each stored week records `built_at`, the time of the numbers its amount was built from (the newest transaction when stored lazily, or the change when a plan change, a moved date or a week at 0 takes the rebuilt amount). In weekly mode, income or a positive correction this week after `built_at` isn't in the week's amount; the snackbar, the check-in result and the breakdown say "+20 DT · shows in your daily amount from next week".
- **A check-in** that finds more money (income or a correction) follows the extra-money rule below; unlogged spending is spending (§3).
- **Extra money** (added 2026-10-13) leaves a week stored above 0 as it is. A week stored at 0 (the plan needed more than the money) is rebuilt with the money, the same exception as a plan change, so a student who was over budget gets money this week. Undoing extra money follows the plan-change rule.
- **When the expected date moves,** this week is stored again with the new dates by the plan-change rule (the lower amount, or rebuilt when it was at 0), and later weeks are deleted, to be stored when they come. A new month stores its first week at once.

### 5. Late transfers

From the expected date, the home screen asks "Did the money arrive?":

- **Yes** opens "I received money".
- **Not yet** asks for a new expected date (default: 2 days later, from tomorrow on), moves `expected_next_on`, and stores this week again (§4).

Meanwhile the question replaces today's amount; "+", today's list and the Plan tab still work. The Plan tab can also change the expected date at any time (from today, up to 62 days ahead), for example when parents send it on another day.

Without this, ADR 003's `daysLeft` of 1 after the expected date would show all the remaining money as today's amount. Reminders and notifications stay in Phase 6.

### 6. New month or extra money

"I received money" always asks whether this is the monthly transfer or extra money, defaulting to "new month" within 5 days of the expected date.

- **New month:** closes the active cycle (`actual_end_on` = today), starts a new one and copies the last cycle's plan as suggestions. Leftover money simply stays in the wallets and becomes part of the new month's money.
  - The student reviews it first: the next expected date (the usual arrival day, at least 20 days away), what's left, last month's unpaid fixed costs ("if you still owe it, raise this month's amount"), and the copied plan in the plan editor with a preview of the new month's daily amount. Fixed costs, envelopes and savings are copied at their planned amounts, nothing paid or spent; without a groceries envelope, the suggestion uses last month's groceries spending.
  - Last month's unpaid fixed costs and envelope remainders simply stop being set aside.
  - Spending logged that morning, before the money arrived, stays in the last month: a month's spending leaves out transactions logged in another cycle (`cycle_id`), even on its first day.
  - There's no undo; the review is the confirmation.
- **Extra money** (a bourse, a job): an income in the current cycle, with Undo.

Both ask where the money is from (parents preselected), so a monthly bourse is recorded as one.

The income's source (parents, bourse, job, other) is a nullable `income_source` column on `transactions`, set only for income. There is no separate `incomes` table: balances come from transactions, and a second table would be a second source of truth.

### 7. Editing the month plan (added 2026-10-09)

The student edits fixed costs, envelopes and one savings line in a draft, with a live preview of today's amount (`previewPlan` in core, the same functions as the home screen), and saves the whole plan at once. **A plan change never rewrites past days**: what was spent from the daily money stays spent. So:

- an amount can't go below what's already used of it (paid towards a fixed cost, spent from an envelope);
- a fixed cost marked paid, and anything already overspent, can't change;
- a fixed cost with payments can't be removed; an envelope with spending is **closed** at what's spent instead (what's left goes back to the daily money);
- a new envelope covers spending from when it's added (§2).

`checkPlanChange` in core enforces this; the editor shows the same limits.

**Weekly mode:** saving stores this week's amount again as `min(stored, rebuilt with the new plan)` (when no week is stored yet, the amount rebuilt with the old plan counts as stored). A bigger plan (an envelope added, a cost raised, savings added) lowers today's amount at once; a smaller one shows from next week, and the preview says so. With past days never rewritten, a plan change can't undo an overspent week. In normal mode a smaller plan raises today's amount at once (good news, §3).

**Exception, a week stored at 0** (added 2026-10-13): while the plan needs more than the money, this week is stored at 0. A saved plan change then rebuilds the week with the new plan, even upward, so a student who fixes an over-budget plan ("Adjust my plan") gets money this week instead of waiting for next week. A week stored above 0 keeps the rule, so a plan edit still can't undo an overspent week.

The plan suggests a groceries envelope while it has none (`suggestGroceries`): with groceries logged this cycle, the same pace until the next transfer, rounded up to 5 DT; without, 20% of this morning's daily money, rounded down to 5 DT. From the second month, "I received money" suggests last month's plan instead.

## Consequences

- The home screen, check-in, warnings and the later offline client compute the same numbers from the same rows.
- Property tests in core cover, for extra money: a week above 0 stays as it is and an overspent week stays overspent; a week at 0 is rebuilt as if it weren't stored.
- Property tests in core cover: every millime of spending is classified once, transfers change nothing, and paying a fixed cost at its planned amount leaves the daily money unchanged; a plan change within the limits never changes any day's daily spending, never raises a week stored above 0 or undoes an overspent one, rebuilds a week stored at 0 with the new plan, and a bigger plan never raises today's amount.
- Integration tests cover the snapshot being stored once under concurrent requests.
- Today's amount never drops during the day because of spending. Only a plan change the student confirms, after seeing the preview, can lower it.
- A week's amount is stable even when the plan changes, at the price of plan changes showing only from next week in weekly mode.
- Moving leftover money to savings, and savings goals, wait for V1.
