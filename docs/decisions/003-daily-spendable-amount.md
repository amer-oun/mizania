# 003 — How today's spendable amount is calculated

- Status: accepted
- Date: 2026-10-07

## Context

The home screen shows one number: how much the student can spend today until the next transfer (PLAN.md §2 and §4). That number has to feel stable during the day, react to yesterday's spending, never promise money that doesn't exist, and, in weekly mode, stop week 1 from eating week 4. The code is `dailyPool` and `todayBudget` in `packages/core/src/daily.ts`.

## Decision

### 1. The daily money

`dailyPool(available, reserved) = available − reserved`, where reserved is unpaid fixed costs, envelope remainders and savings. It can be negative: that means more money is promised than exists, and the app shows "over budget".

### 2. Today's amount is fixed from this morning's money

The app knows the daily money now (`poolNow`) and what was spent today, so this morning's money is `poolNow + spentToday`. Today's amount is calculated from that, so a coffee lowers what's **left** today, not today's **amount**. Whatever she doesn't spend, or overspends, automatically changes tomorrow's amount (rollover).

### 3. Normal mode

```
today's amount = floor(max(0, this morning's money) / daysLeft)
left           = today's amount − spent today
```

`daysLeft` counts today but not the transfer day, and is never less than 1: on the transfer day or when the money is late, today still has to be paid for.

### 4. Weekly mode

The cycle is cut into 7-day weeks from the day the money arrived (only the last week can be shorter).

```
week's starting money = poolNow + spentToday + spentThisWeekBeforeToday
week's amount         = floor(max(0, starting money) × days in week / days from week start to transfer)
today's amount        = floor(max(0, week's amount − spent earlier this week) / days left in week)
```

The week's amount is its fair share of what it started with, so money saved in one week makes the next week bigger. Once the week is overspent, today's amount is 0 for the rest of it. When the transfer is late, she stays on the last week with 1 day left. `week's amount` is computed without building numbers too large to store exactly (checked against exact BigInt maths on 200,005 cases).

### 5. Always round down

Rounding down to the millime means `today's amount × days left` never exceeds the money that exists. The leftover millimes roll into the next day.

### 6. Status, checked in this order

1. `over_budget` if `poolNow < 0`
2. `over_today` if `left < 0`
3. `over_week` if weekly mode and the week's left `< 0`
4. `on_track` otherwise, including a week used up exactly (left = 0)

## Known limitation

- **Plan changes mid-week shift the week's amount.** Weekly mode rebuilds the week's starting money from today's numbers. If money is received or the plan changes mid-week, the week's amount moves too. Fix: store a snapshot of the week's allowance at week start in Phase 3 (PLAN.md Phase 3 checklist).
- **A big overspend early in the week gives 0 for the rest of the week.** That's the point of weekly mode, but it can feel harsh. A "borrow from next week" option may be added after pilot feedback.

## Consequences

- One number per day that doesn't move while she spends, with automatic rollover.
- Property-based tests check, for random days and amounts: the amount stays the same all day, left = amount − spending, and the amounts never add up to more than the money that exists (per cycle in normal mode, per week in weekly mode).
- The UI and API only call `todayBudget`; they never recompute it.
