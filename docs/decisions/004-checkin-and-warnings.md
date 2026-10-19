# 004 — Evening check-in and run-out forecast

- Status: accepted
- Date: 2026-10-07

## Context

Students won't log every coffee, snack or photocopy. If the app only knows what they log, its balances drift and the daily amount (ADR 003) becomes wrong. They also need an early, concrete warning when they're spending too fast, not a surprise on day 25. The code is `packages/core/src/checkin.ts` and `warnings.ts`.

## Decision

### 1. Balance-based check-in instead of logging everything

In the evening the student counts what's really in a wallet (usually cash) and types one number. The app compares it with what it expected:

```
expected   = last confirmed balance + money logged in − money logged out
difference = expected − counted
```

This takes about 5 seconds. Logging each expense stays optional: the check-in catches whatever wasn't logged.

### 2. Unlogged spending and income

- **Counted less than expected** → `unlogged_spending` for the difference. The app records one "unlogged spending" transaction in the daily money; she can categorise it if she wants.
- **Counted more than expected** → `unlogged_income`. The app asks whether she forgot to log money she received (for example a friend paying her back).
- **Same** → `match`.

The amount is always ≥ 0 and the kind gives the direction. Recording the difference always brings the balance exactly to what she counted (property-tested). The counted balance can't be negative; the expected one can, when more spending was logged than money recorded.

### 3. Run-out forecast

Checked in this order:

1. **No money left** (`poolNow ≤ 0`) → `out`, today. No pace is needed for that.
2. **Fewer than 3 finished days** of spending data → `not_enough_data`.
3. **Pace** = average of the last 7 finished days (or fewer, at least 3). No spending → `safe`.
4. **Days covered** = `floor(money × days / total spent)`, in whole numbers. If that reaches the transfer → `safe`.
5. Otherwise `warning`: runs out on today + days covered, `daysShort` = days needed − days covered, and `cutPerDay` = pace rounded up − `floor(money / days needed)`.

Money left but less than one day's pace is a `warning` that runs out today. `out` only means no money left.

### 4. Why the pace is rounded up

The suggested cut is "your pace − what you can afford per day". Rounding the pace down would make the cut too small, and following it would still run out. Rounding up makes the advice always enough: following it makes the money last until the transfer (property-tested). The run-out date uses the exact average, so it isn't pulled earlier by rounding.

### 5. Why we wait for 3 days

One or two days aren't a pace. A big shopping day or a birthday dinner would look like normal spending and trigger an alarming warning on the first evening. Three days smooth out one unusual day; the window grows to 7 for a steadier pace.

### 6. How the check-in works in the app (added 2026-10-14)

- **Expected** is the wallet's balance computed from its transactions when the count is saved (balances are derived, ADR 006), so "last confirmed balance + in − out" needs no separate stored balance.
- **The card** on Today shows from 18:00, or from the student's check-in time when that's earlier, until midnight (Tunis), while the cash wallet hasn't been counted that day. "Not tonight" hides it until the next day, on that phone only. Once counted, one line remains: "Cash counted at 21:14 · matches", with Undo and Count again.
- **Cash only** on the card; "Check all wallets" (`/checkin`) counts every wallet, and the Wallets tab's "Count my cash" opens it at any time of day.
- **The expected amount isn't shown before counting,** so the count stays honest.
- **Less:** one expense, source `checkin`, no category, worded "8 DT spent without logging since your last count (Monday)", or "since you started" when the wallet was never counted. The student can pick a category later in today's list; it's never deleted there (undo the check-in instead).
- **More:** nothing is saved until she answers "I received money" (an income, with its source) or "I miscounted earlier" (a positive correction). An answer to a difference that changed meanwhile is refused, and she counts again.
- **Each check-in is stored** in `checkins` (expected, counted, kind, the transaction it recorded). Two in a day are fine: the second compares with the balance after the first. Only a wallet's latest check-in can be undone, with its transaction.

### 7. How the warning shows and is worded (added 2026-10-19)

- **Where:** on Today, an amber card (never red) under the amount. It's hidden before 3 finished days, when the pace is safe, while Today asks "Did your money arrive?", and when over budget or out of daily money (the over-budget screen already says it).
- **Finished days** are this month's days before today: today isn't over, and a morning without spending would look like a cheap day. Last month's days never count; a new month waits 3 days again.
- **The pace uses daily-money spending only** (ADR 006 §3), the same numbers as today's amount: unlogged spending from a check-in counts on the day of the count; spending covered by an envelope or a fixed cost doesn't (that money was set aside), only the part beyond it; negative corrections count.
- **Three wordings,** picked by `runOutWarning` in core so the thresholds are tested in one place:
  - _normal:_ "At this pace, your money runs out on Thursday 23 October, 6 days before your next transfer. Spending 2 DT less a day fixes it."
  - _big,_ when the cut is half the pace or more: a target instead of a cut. "To make it to your next transfer on …, aim for about 6 DT a day (you've been spending about 11). Every day under that helps." The target is what fits a day, rounded down to whole dinars (so following it still lasts); the pace is rounded to the nearest dinar.
  - _tight,_ when under 1 DT a day fits: "Money is tight: 4 DT for the 9 days until your transfer. Every dinar you don't spend helps."
- No exclamation marks and no "too much" in any language. The link to "ask for money" comes in Phase 8 (PLAN.md decision 11).
- **This month by category** (`/month`, linked from Today and the Plan tab) counts everything spent instead, plan or not, since it answers a different question: what went where. It compares with last month up to the same day number (decision 12), or all of last month when it was shorter; the difference is shown without colour.

## Consequences

- Balances stay accurate with one number a day, which is what keeps the daily amount right.
- Warnings are early, specific and actionable ("spend 7.500 DT less per day"), never "cut 0".
- All divisions use exact integer helpers (`integer-math.ts`), shared with the daily module; they were checked against exact BigInt maths.
- How warnings are worded is §7; linking big warnings to "ask for money" is Phase 8 (PLAN.md).
