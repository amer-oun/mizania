// Exact integer division helpers for non-negative safe integers. Internal to
// packages/core (not exported from index.ts).
//
// `a % b` is exact for integers, and `a - a % b` is an exact multiple of b,
// so dividing it gives an exact whole number: no decimals are ever rounded.

/** floor(a / b) for a ≥ 0, b ≥ 1. */
export function floorDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

/** ceil(a / b) for a ≥ 0, b ≥ 1. */
export function ceilDiv(a: number, b: number): number {
  return floorDiv(a, b) + (a % b > 0 ? 1 : 0);
}

/**
 * floor(amount × part / whole) without computing amount × part, which could
 * grow past the safe integer range. amount ≥ 0, part ≥ 0, whole ≥ 1.
 * Throws instead of returning a wrong number if an intermediate isn't exact.
 */
export function mulDivFloor(amount: number, part: number, whole: number): number {
  const rest = amount % whole; // < whole
  const restTimesPart = rest * part;
  const result = floorDiv(amount, whole) * part + floorDiv(restTimesPart, whole);
  if (!Number.isSafeInteger(restTimesPart) || !Number.isSafeInteger(result)) {
    throw new RangeError(`Amount too large to compute exactly: ${amount} × ${part} / ${whole}.`);
  }
  return result;
}
