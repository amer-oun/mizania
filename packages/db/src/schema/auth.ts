import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Better Auth's core tables (users, sessions, accounts, verifications,
// rate_limits), with UUID ids and plural names (ADR 005). Field names must
// match Better Auth's model; packages/auth checks the schema at startup.
// Extra user fields are declared again as `additionalFields` in packages/auth.

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Interface languages; also used for emails. */
export const userLocales = ["ar", "fr", "en"] as const;
export type UserLocale = (typeof userLocales)[number];

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    // App fields
    locale: text().$type<UserLocale>().notNull().default("ar"),
    weeklyMode: boolean().notNull().default(true),
    // Evening check-in reminder, Africa/Tunis local time.
    checkinTime: time().notNull().default("21:00"),
    // Onboarding answers (null until onboarded).
    usualMonthlyMillimes: bigint({ mode: "number" }),
    usualArrivalDay: integer(),
    onboardedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("users_locale_check", sql`${t.locale} in ('ar', 'fr', 'en')`),
    check("users_usual_monthly_positive", sql`${t.usualMonthlyMillimes} > 0`),
    check("users_usual_arrival_day_range", sql`${t.usualArrivalDay} between 1 and 31`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "credential" for email + password (accountId = user id), else the
    // provider ("google") and the user's id there.
    providerId: text().notNull(),
    accountId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    // Scrypt hash, credential accounts only.
    password: text(),
    ...timestamps,
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// Rate limits live in the database because Vercel functions share no memory.
export const rateLimits = pgTable("rate_limits", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  // Milliseconds since the epoch, as Better Auth stores it.
  lastRequest: bigint({ mode: "number" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
