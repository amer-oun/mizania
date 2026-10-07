# 002 — Money as integer millimes, parsed and formatted by hand

- Status: accepted
- Date: 2026-10-07

## Context

Mizania adds, subtracts and splits small amounts all day: a 2.500 DT coffee, rent split three ways. The Tunisian dinar has 3 decimals (1 TND = 1000 millimes). JavaScript numbers are binary floating point, and they can't store most decimal amounts exactly.

## Decision

### 1. Store money as a whole number of millimes

Every amount is an integer: 2.500 DT is `2500`. Whole numbers add, subtract and split exactly, so a balance never drifts by a millime. `assertMillimes` rejects anything else (decimals, `NaN`, infinity, or numbers too big to store exactly). `splitEven` splits with `Math.floor` and `%`, so the shares always add up to the total.

### 2. `parseTND` never uses `parseFloat`

`parseFloat(input) * 1000` looks right but goes through a binary decimal first:

```
parseFloat("1.005") * 1000  →  1004.9999999999999   (should be 1005)
```

This isn't rare. Of the 10,001 amounts from 0.000 to 10.000 DT, **175** come out as non-whole numbers this way (for example 1.001, 1.003, 1.005 and 1.007). Rounding afterwards would hide the problem, and `Math.floor` would silently lose a millime.

Instead, `parseTND` reads the text: it splits the dinar and millime digits as strings, pads the millimes to 3 digits, and computes `dinars × 1000 + millimes` with whole numbers only.

### 3. `formatTND` doesn't use `Intl`

`Intl.NumberFormat` gets its rules from a data library (ICU) built into each browser and Node version. On Node 24.15 (ICU 78.2), formatting 1250.5 TND gave:

| Locale  | Intl output                        | Problem                                |
| ------- | ---------------------------------- | -------------------------------------- |
| `en`    | `TND 1,250.500`                    | currency code in front, not "DT" after |
| `fr`    | `1 250,500 TND`                    | invisible U+202F and U+00A0 spaces     |
| `ar`    | `1,250.500 د.ت.` (+ hidden U+200F) | hidden right-to-left marks, extra dot  |
| `ar-TN` | `1.250,500 د.ت.` (+ hidden U+200F) | separators swapped                     |

These details change between ICU versions, so an old phone, a new phone and the server could show the same amount differently, and tests would break on invisible characters. `formatTND` builds the string by hand from a small table of separators and suffixes per locale: always 3 decimals and plain spaces, with "DT" or "د.ت" after the number.

## Consequences

- Amounts are exact and identical on every device, in CI and on the server.
- All money code goes through `packages/core/money`. UI and API code never do money arithmetic or formatting themselves.
- Adding a locale means adding a row to the format table and its tests.
- Display details that Intl would give us for free (for example Arabic-Indic digits) must be added by hand if we ever want them.
