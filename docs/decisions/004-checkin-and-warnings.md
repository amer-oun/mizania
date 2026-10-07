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

## Consequences

- Balances stay accurate with one number a day, which is what keeps the daily amount right.
- Warnings are early, specific and actionable ("spend 7.500 DT less per day"), never "cut 0".
- All divisions use exact integer helpers (`integer-math.ts`), shared with the daily module; they were checked against exact BigInt maths.
- How warnings are worded and linked to "ask for money" is a Phase 3 UI task (PLAN.md).
