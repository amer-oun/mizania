import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { categories } from "./categories";

// Wallets, cycles, plan items and transactions (ADR 005). Amounts are
// integer millimes. Balances are never stored: they're derived from
// transactions (a starting balance is an "adjustment").
//
// Rows that point to a wallet or cycle carry user_id too, and the foreign
// key covers (id, user_id): the database itself refuses a transaction that
// uses another user's wallet or cycle.

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp({ withTimezone: true }),
};

const millimes = () => bigint({ mode: "number" });

export const walletType = pgEnum("wallet_type", ["cash", "d17", "flouci", "card", "other"]);
export type WalletType = (typeof walletType.enumValues)[number];

export const wallets = pgTable(
  "wallets",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: walletType().notNull(),
    // Only "other" wallets have a name (what the student typed); the others
    // are shown with the translated name of their type.
    name: text(),
    archived: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("wallets_user_id_idx").on(t.userId),
    unique("wallets_id_user_id_unique").on(t.id, t.userId),
    // One cash, D17, Flouci and card wallet per user, archived or not (an
    // archived one is restored instead of added again). "Other" can repeat.
    uniqueIndex("wallets_one_per_type")
      .on(t.userId, t.type)
      .where(sql`${t.type} <> 'other' and ${t.deletedAt} is null`),
    check(
      "wallets_name_only_for_other",
      sql`(${t.type} = 'other' and ${t.name} is not null and btrim(${t.name}) <> '')
        or (${t.type} <> 'other' and ${t.name} is null)`,
    ),
  ],
);

export const cycleStatus = pgEnum("cycle_status", ["active", "closed"]);

/** From one transfer from home to the next. */
export const cycles = pgTable(
  "cycles",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Calendar dates in Africa/Tunis.
    startedOn: date({ mode: "string" }).notNull(),
    expectedNextOn: date({ mode: "string" }).notNull(),
    actualEndOn: date({ mode: "string" }),
    status: cycleStatus().notNull().default("active"),
    weeklyMode: boolean().notNull(),
    ...timestamps,
  },
  (t) => [
    index("cycles_user_id_idx").on(t.userId),
    unique("cycles_id_user_id_unique").on(t.id, t.userId),
    // At most one active cycle per user.
    uniqueIndex("cycles_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active' and ${t.deletedAt} is null`),
    check("cycles_next_after_start", sql`${t.expectedNextOn} > ${t.startedOn}`),
  ],
);

export const planItemKind = pgEnum("plan_item_kind", ["fixed", "envelope", "savings"]);

/** What a cycle sets aside: fixed costs (rent, bills), envelopes, savings. */
export const planItems = pgTable(
  "plan_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    cycleId: uuid()
      .notNull()
      .references(() => cycles.id, { onDelete: "cascade" }),
    kind: planItemKind().notNull(),
    // Null when the category's own (translated) name is enough.
    name: text(),
    categoryId: uuid().references(() => categories.id),
    amountMillimes: millimes().notNull(),
    dueOn: date({ mode: "string" }),
    paidAt: timestamp({ withTimezone: true }),
    // Envelopes added mid-month cover spending only from this time, so a plan
    // change never rewrites past days (ADR 006). Null: the whole cycle.
    coversFrom: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("plan_items_cycle_id_idx").on(t.cycleId),
    check("plan_items_amount_positive", sql`${t.amountMillimes} > 0`),
    // Savings is one line with no name; everything else has a category or a name.
    check(
      "plan_items_named",
      sql`${t.kind} = 'savings' or ${t.categoryId} is not null or (${t.name} is not null and btrim(${t.name}) <> '')`,
    ),
    // One savings line per cycle (savings goals come in V1).
    uniqueIndex("plan_items_one_savings_per_cycle")
      .on(t.cycleId)
      .where(sql`${t.kind} = 'savings' and ${t.deletedAt} is null`),
  ],
);

export const transactionType = pgEnum("transaction_type", [
  "expense",
  "income",
  "transfer",
  "adjustment",
]);
export const transactionSource = pgEnum("transaction_source", [
  "quick",
  "text",
  "checkin",
  "plan",
  "household",
  // Entered by hand: starting balances, corrections.
  "manual",
]);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cycleId: uuid(),
    walletId: uuid().notNull(),
    // Transfers only: the wallet the money goes to.
    toWalletId: uuid(),
    categoryId: uuid().references(() => categories.id),
    planItemId: uuid().references(() => planItems.id),
    type: transactionType().notNull(),
    // Positive, except adjustments, which are signed (never 0).
    amountMillimes: millimes().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    note: text(),
    source: transactionSource().notNull(),
    ...timestamps,
  },
  (t) => [
    index("transactions_user_id_idx").on(t.userId),
    index("transactions_wallet_id_idx").on(t.walletId),
    index("transactions_to_wallet_id_idx").on(t.toWalletId),
    index("transactions_cycle_id_idx").on(t.cycleId),
    foreignKey({
      name: "transactions_wallet_same_user_fk",
      columns: [t.walletId, t.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: "transactions_to_wallet_same_user_fk",
      columns: [t.toWalletId, t.userId],
      foreignColumns: [wallets.id, wallets.userId],
    }),
    foreignKey({
      name: "transactions_cycle_same_user_fk",
      columns: [t.cycleId, t.userId],
      foreignColumns: [cycles.id, cycles.userId],
    }),
    check(
      "transactions_amount_sign",
      sql`(${t.type} = 'adjustment' and ${t.amountMillimes} <> 0)
        or (${t.type} <> 'adjustment' and ${t.amountMillimes} > 0)`,
    ),
    check(
      "transactions_transfer_target",
      sql`(${t.type} = 'transfer' and ${t.toWalletId} is not null and ${t.toWalletId} <> ${t.walletId})
        or (${t.type} <> 'transfer' and ${t.toWalletId} is null)`,
    ),
  ],
);

/**
 * A week's allowance in weekly mode, stored the first time it's needed so
 * that plan changes mid-week don't move it (ADR 006).
 */
export const weekSnapshots = pgTable(
  "week_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cycleId: uuid().notNull(),
    // 0 for the cycle's first week.
    weekIndex: integer().notNull(),
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    allowanceMillimes: millimes().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("week_snapshots_cycle_week_unique").on(t.cycleId, t.weekIndex),
    foreignKey({
      name: "week_snapshots_cycle_same_user_fk",
      columns: [t.cycleId, t.userId],
      foreignColumns: [cycles.id, cycles.userId],
    }).onDelete("cascade"),
    check("week_snapshots_week_index_not_negative", sql`${t.weekIndex} >= 0`),
    check("week_snapshots_allowance_not_negative", sql`${t.allowanceMillimes} >= 0`),
    check("week_snapshots_dates", sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);

export type Wallet = typeof wallets.$inferSelect;
export type Cycle = typeof cycles.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type WeekSnapshot = typeof weekSnapshots.$inferSelect;
