// Dates are calendar days in Tunisia (Africa/Tunis), written as "YYYY-MM-DD".

import { APP_TIME_ZONE } from "./constants";

/** A calendar day in Tunisia, "YYYY-MM-DD". */
export type IsoDate = string;

/** One week of a money cycle. `end` is included; `days` is 1–7. */
export interface CycleWeek {
  start: IsoDate;
  end: IsoDate;
  days: number;
}

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses "YYYY-MM-DD" into numbers, rejecting impossible days like 2026-02-30.
 * Date.UTC silently rolls over (Feb 30 → Mar 2), so we build the date and
 * check that it still has the same year, month and day.
 */
function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return { year, month, day };
    }
  }
  throw new RangeError(
    `Invalid date: ${JSON.stringify(value)}. Expected a real calendar day as "YYYY-MM-DD".`,
  );
}

/**
 * Day number counted from 1970-01-01, using UTC midnight. UTC has no daylight
 * saving, so every day is exactly 24 h and this is always a whole number.
 */
function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromUtcDate(date: Date): IsoDate {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Throws unless `value` is a real calendar day written as "YYYY-MM-DD". */
export function assertIsoDate(value: string): void {
  parseIsoDate(value);
}

// Created once: building an Intl formatter is slow. Gregorian calendar and
// Latin digits are forced so formatToParts always returns "2026", "10", "07".
const tunisDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  calendar: "gregory",
  numberingSystem: "latn",
});

/**
 * The calendar day it is in Tunisia at the instant `now`, whatever the
 * device's own time zone: 2026-10-06T23:30Z is already "2026-10-07" in Tunis.
 */
export function todayInTunis(now: Date = new Date()): IsoDate {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("Invalid date: cannot tell which day it is in Tunis.");
  }
  const parts = tunisDateParts.formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";

  const today = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
  assertIsoDate(today); // guards against an unexpected Intl output shape
  return today;
}

/** Calendar days from `from` to `to`: 0 for the same day, negative if `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** The calendar day `days` after `date` (or before, if negative). */
export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError(`Invalid number of days: ${days}. Expected a whole number.`);
  }
  const { year, month, day } = parseIsoDate(date);
  // Date.UTC rolls over month and year ends for us: Jan 31 + 1 → Feb 1.
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Days the student must live on the current money: from today (included)
 * until the transfer day (not included). At least 1: on the transfer day,
 * or when the money is late, today still has to be paid for.
 */
export function daysLeft(today: IsoDate, nextTransfer: IsoDate): number {
  return Math.max(1, daysBetween(today, nextTransfer));
}

/** True on and after the expected transfer day: time to ask "did the money arrive?". */
export function isTransferDue(today: IsoDate, nextTransfer: IsoDate): boolean {
  return daysBetween(today, nextTransfer) <= 0;
}

/**
 * Cuts a cycle into 7-day weeks counted from the day the money arrived.
 * The cycle runs from `start` until the day before `nextTransfer`;
 * only the last week can be shorter than 7 days.
 */
export function cycleWeeks(start: IsoDate, nextTransfer: IsoDate): CycleWeek[] {
  const totalDays = daysBetween(start, nextTransfer);
  if (totalDays < 1) {
    throw new RangeError(
      `Invalid cycle: next transfer ${nextTransfer} must be after the start ${start}.`,
    );
  }

  const weeks: CycleWeek[] = [];
  for (let offset = 0; offset < totalDays; offset += 7) {
    const days = Math.min(7, totalDays - offset);
    weeks.push({
      start: addDays(start, offset),
      end: addDays(start, offset + days - 1),
      days,
    });
  }
  return weeks;
}

/**
 * Index of the week that contains `today`. When the transfer is late and
 * today is past the cycle, the student stays on the last week.
 */
export function weekIndexFor(today: IsoDate, weeks: readonly CycleWeek[]): number {
  const first = weeks[0];
  if (!first) {
    throw new RangeError("Invalid cycle: it has no weeks.");
  }
  if (daysBetween(first.start, today) < 0) {
    throw new RangeError(`Invalid date: ${today} is before the cycle starts on ${first.start}.`);
  }

  // Weeks are in order, so the first one ending on or after today contains it.
  const index = weeks.findIndex((week) => daysBetween(today, week.end) >= 0);
  return index === -1 ? weeks.length - 1 : index;
}
