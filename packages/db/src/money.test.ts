import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cycles, transactions, users, wallets } from "./schema";
import { createTestDatabase, type TestDatabase } from "./test/test-database";

// The database rules from migration 0002, checked against a real Postgres.

let test: TestDatabase;
let n = 0;

beforeAll(async () => {
  test = await createTestDatabase();
});
afterAll(async () => {
  await test.close();
});

async function newUser() {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `money${++n}@example.com` })
    .returning();
  if (!user) throw new Error("no user");
  return user;
}

async function newWallet(userId: string, type: "cash" | "card" = "cash") {
  const [wallet] = await test.db.insert(wallets).values({ userId, type }).returning();
  if (!wallet) throw new Error("no wallet");
  return wallet;
}

const tx = (userId: string, walletId: string) => ({
  userId,
  walletId,
  type: "adjustment" as const,
  amountMillimes: 50_000,
  occurredAt: new Date(),
  source: "manual" as const,
});

describe("migration 0002", () => {
  it("creates the money tables", async () => {
    const rows = await test.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["wallets", "cycles", "plan_items", "transactions"]),
    );
  });

  it("adds onboarding fields to users, empty until onboarding, with sane ranges", async () => {
    const user = await newUser();
    expect(user).toMatchObject({
      usualMonthlyMillimes: null,
      usualArrivalDay: null,
      onboardedAt: null,
    });
    await expect(
      test.db.execute(sql`update users set usual_arrival_day = 32 where id = ${user.id}`),
    ).rejects.toThrow();
    await expect(
      test.db.execute(sql`update users set usual_monthly_millimes = 0 where id = ${user.id}`),
    ).rejects.toThrow();
  });
});

describe("wallets", () => {
  it("store a name only for 'other' wallets, where it's required", async () => {
    const { id: userId } = await newUser();

    await expect(newWallet(userId, "card")).resolves.toMatchObject({ name: null });
    await expect(
      test.db.insert(wallets).values({ userId, type: "other", name: "Tirelire" }),
    ).resolves.toBeDefined();

    await expect(
      test.db.insert(wallets).values({ userId, type: "cash", name: "Cash" }),
    ).rejects.toThrow();
    await expect(test.db.insert(wallets).values({ userId, type: "other" })).rejects.toThrow();
    await expect(
      test.db.insert(wallets).values({ userId, type: "other", name: "   " }),
    ).rejects.toThrow();
  });
});

describe("transactions", () => {
  it("can't use another user's wallet or cycle", async () => {
    const amel = await newUser();
    const sami = await newUser();
    const samiWallet = await newWallet(sami.id);
    const [samiCycle] = await test.db
      .insert(cycles)
      .values({
        userId: sami.id,
        startedOn: "2026-10-08",
        expectedNextOn: "2026-11-01",
        weeklyMode: true,
      })
      .returning();
    const amelWallet = await newWallet(amel.id);

    await expect(test.db.insert(transactions).values(tx(amel.id, samiWallet.id))).rejects.toThrow();
    await expect(
      test.db
        .insert(transactions)
        .values({ ...tx(amel.id, amelWallet.id), cycleId: samiCycle?.id ?? "" }),
    ).rejects.toThrow();
    await expect(
      test.db.insert(transactions).values({
        ...tx(amel.id, amelWallet.id),
        type: "transfer",
        amountMillimes: 1000,
        toWalletId: samiWallet.id,
      }),
    ).rejects.toThrow();
  });

  it("keep amounts positive; only adjustments are signed, and never 0", async () => {
    const { id: userId } = await newUser();
    const { id: walletId } = await newWallet(userId);

    await expect(
      test.db.insert(transactions).values({ ...tx(userId, walletId), amountMillimes: -2_000 }),
    ).resolves.toBeDefined();
    await expect(
      test.db.insert(transactions).values({ ...tx(userId, walletId), amountMillimes: 0 }),
    ).rejects.toThrow();
    await expect(
      test.db
        .insert(transactions)
        .values({ ...tx(userId, walletId), type: "expense", amountMillimes: -2_000 }),
    ).rejects.toThrow();
  });

  it("transfers need a different target wallet; other types have none", async () => {
    const { id: userId } = await newUser();
    const card = await newWallet(userId, "card");
    const cash = await newWallet(userId, "cash");
    const transfer = { ...tx(userId, card.id), type: "transfer" as const, amountMillimes: 20_000 };

    await expect(
      test.db.insert(transactions).values({ ...transfer, toWalletId: cash.id }),
    ).resolves.toBeDefined();
    await expect(test.db.insert(transactions).values(transfer)).rejects.toThrow();
    await expect(
      test.db.insert(transactions).values({ ...transfer, toWalletId: card.id }),
    ).rejects.toThrow();
    await expect(
      test.db.insert(transactions).values({ ...tx(userId, card.id), toWalletId: cash.id }),
    ).rejects.toThrow();
  });
});

describe("cycles", () => {
  it("allow at most one active cycle per user, ending after they start", async () => {
    const { id: userId } = await newUser();
    const cycle = {
      userId,
      startedOn: "2026-10-08",
      expectedNextOn: "2026-11-01",
      weeklyMode: true,
    };

    await test.db.insert(cycles).values(cycle);
    await expect(test.db.insert(cycles).values(cycle)).rejects.toThrow();
    await expect(
      test.db.insert(cycles).values({ ...cycle, status: "closed" }),
    ).resolves.toBeDefined();
    await expect(
      test.db.insert(cycles).values({ ...cycle, status: "closed", expectedNextOn: "2026-10-08" }),
    ).rejects.toThrow();
  });
});
