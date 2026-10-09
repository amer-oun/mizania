// Money is always an integer number of millimes: 1 TND = 1000 millimes.

export type Locale = "ar" | "fr" | "en";

/**
 * Throws unless `value` is a whole number of millimes that JavaScript can
 * represent exactly (no decimals, NaN, Infinity, or integers beyond ±2^53 − 1).
 */
export function assertMillimes(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `Invalid money amount: ${value}. Expected a whole number of millimes (1 TND = 1000 millimes).`,
    );
  }
}

const ARABIC_INDIC_ZERO = 0x0660; // ٠ (U+0660) … ٩ (U+0669)
const ARABIC_DECIMAL_SEPARATOR = "٫"; // ٫

// Optional dinars, then optionally "." or "," followed by 1–3 millime digits.
// Nothing else: no sign, no spaces inside, no thousands separators, no units.
const AMOUNT_PATTERN = /^([0-9]*)(?:[.,]([0-9]{1,3}))?$/;

/** Western digits and "." for whatever was typed: "٢٫٥ " → "2.5". */
function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replaceAll(ARABIC_DECIMAL_SEPARATOR, ".")
    .trim();
}

/** Below this, a whole number is surely dinars ("15" is 15 DT, not 15 millimes). */
const MILLIMES_HINT_FROM = 1000;

/**
 * Many people count in millimes: "2500" for 2.5 DT. For a whole number of at
 * least 1000 typed without a separator, returns that number read as millimes
 * (2500 → 2500 millimes = 2.500 DT), to offer "Did you mean 2.500 DT?".
 * Returns null for anything else, which parseTND reads as dinars.
 */
export function millimesReading(input: string): number | null {
  const normalized = normalizeDigits(input);
  if (!/^[0-9]+$/.test(normalized)) return null;
  const millimes = Number(normalized);
  return millimes >= MILLIMES_HINT_FROM && Number.isSafeInteger(millimes) ? millimes : null;
}

/**
 * Parses a typed amount in dinars ("2.5", "2,500", "٢٫٥", ".5") into millimes.
 * Returns null for anything that isn't a valid positive amount.
 * Works on strings only: no floating-point arithmetic is involved.
 */
export function parseTND(input: string): number | null {
  const normalized = normalizeDigits(input);

  const match = AMOUNT_PATTERN.exec(normalized);
  if (!match) return null;

  // Group 1 is `([0-9]*)`, which always matches (maybe as ""), so it's never
  // undefined. The fallback only satisfies noUncheckedIndexedAccess.
  /* v8 ignore next */
  const dinarDigits = match[1] ?? "";
  const millimeDigits = match[2];
  if (dinarDigits === "" && millimeDigits === undefined) return null; // empty input

  // "5" → 5000, ".5" → 500, "2.05" → 2050: pad the millime digits to 3 places.
  const dinars = dinarDigits === "" ? 0 : Number(dinarDigits);
  const millimes = millimeDigits === undefined ? 0 : Number(millimeDigits.padEnd(3, "0"));
  const total = dinars * 1000 + millimes;

  // Absurdly long inputs would exceed what a number can hold exactly.
  return Number.isSafeInteger(total) ? total : null;
}

interface MoneyFormat {
  thousands: string;
  decimal: string;
  suffix: string;
}

// Spaces are plain U+0020, matching the tests. Kept by hand (not Intl) so the
// output is identical on every device, browser and Node version.
const MONEY_FORMATS: Record<Locale, MoneyFormat> = {
  en: { thousands: ",", decimal: ".", suffix: "DT" },
  fr: { thousands: " ", decimal: ",", suffix: "DT" },
  ar: { thousands: " ", decimal: ",", suffix: "د.ت" },
};

/**
 * Formats millimes for display, always with 3 decimals:
 * 1250500 → "1,250.500 DT" (en), "1 250,500 DT" (fr), "1 250,500 د.ت" (ar).
 */
export function formatTND(millimes: number, locale: Locale): string {
  assertMillimes(millimes);
  const { thousands, decimal, suffix } = MONEY_FORMATS[locale];

  const sign = millimes < 0 ? "-" : "";
  const abs = Math.abs(millimes);
  const millimePart = abs % 1000;
  const dinarPart = (abs - millimePart) / 1000; // exact: abs - millimePart is a multiple of 1000

  // Insert the separator before every group of 3 digits counted from the right.
  const dinars = String(dinarPart).replace(/\B(?=(\d{3})+$)/g, thousands);
  const decimals = String(millimePart).padStart(3, "0");

  return `${sign}${dinars}${decimal}${decimals} ${suffix}`;
}

/**
 * Millimes as a person would type them, to pre-fill an amount: dinars with
 * only the decimals needed and no separators or unit. 250000 → "250",
 * 12500 → "12.5", 50 → "0.05". parseTND reads it back exactly.
 */
export function formatTypedTND(millimes: number): string {
  assertMillimes(millimes);
  if (millimes < 0) throw new RangeError(`Can't type a negative amount: ${millimes} millimes.`);
  const millimePart = millimes % 1000;
  const dinars = String((millimes - millimePart) / 1000);
  if (millimePart === 0) return dinars;
  return `${dinars}.${String(millimePart).padStart(3, "0").replace(/0+$/, "")}`;
}

/**
 * Splits `total` millimes into `people` shares that differ by at most 1 millime.
 * The leftover millimes go to the first shares: 10.000 DT / 3 → 3.334, 3.333, 3.333.
 */
export function splitEven(total: number, people: number): number[] {
  assertMillimes(total);
  if (total < 0) {
    throw new RangeError(`Cannot split a negative amount: ${total} millimes.`);
  }
  if (!Number.isSafeInteger(people) || people < 1) {
    throw new RangeError(
      `Invalid number of people: ${people}. Expected a whole number of at least 1.`,
    );
  }

  const base = Math.floor(total / people);
  const remainder = total % people; // 0 ≤ remainder < people

  return Array.from({ length: people }, (_, i) => (i < remainder ? base + 1 : base));
}
