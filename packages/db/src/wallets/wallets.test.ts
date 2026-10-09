import { randomUUID } from "node:crypto";

import { planOnboarding } from "@mizania/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveOnboarding } from "../onboarding/save-onboarding";
import { transactions, users, wallets } from "../schema";
import { seedDefaultCategories } from "../seed/seed-default-categories";
import { createTestDatabase, type TestDatabase } from "../test/test-database";
import {
  addWallet,
  archiveWallet,
  getWalletsOverview,
  moveWallet,
  renameWallet,
  restoreWallet,
  transfer,
  undoTransfer,
} from "./wallets";

let test: TestDatabase;
let n = 0;
const now = new Date("2026-10-09T10:00:00Z");

beforeAll(async () => {
  test = await createTestDatabase();
  await seedDefaultCategories(test.db);
});
afterAll(async () => {
  await test.close();
});

/** An onboarded student with card 120.000, cash 10.000 and D17 at 0. */
async function student() {
  const [user] = await test.db
    .insert(users)
    .values({ name: "Amel", email: `wallets${++n}@example.com` })
    .returning();
  if (!user) throw new Error("no user");
  const plan = planOnboarding(
    {
      locale: "fr",
      monthlyMillimes: 600_000,
      arrivalDay: 1,
      fixedCosts: [],
      wallets: [
        { kind: "card", balanceMillimes: 120_000 },
        { kind: "cash", balanceMillimes: 10_000 },
        { kind: "d17", balanceMillimes: 0 },
      ],
    },
    "2026-10-09",
  );
  await saveOnboarding(test.db, user.id, plan, now);
  const overview = await getWalletsOverview(test.db, user.id);
  const id = (type: string) => {
    const wallet = overview.wallets.find((w) => w.type === type);
    if (!wallet) throw new Error(`no ${type} wallet`);
    return wallet.id;
  };
  return { userId: user.id, card: id("card"), cash: id("cash"), d17: id("d17") };
}

const balances = async (userId: string) =>
  Object.fromEntries(
    (await getWalletsOverview(test.db, userId)).wallets.map((w) => [
      w.name ?? w.type,
      w.balanceMillimes,
    ]),
  );

const transferInput = (from: string, to: string, amountMillimes: number) => ({
  id: randomUUID(),
  fromWalletId: from,
  toWalletId: to,
  amountMillimes,
  note: null,
});

describe("getWalletsOverview", () => {
  it("lists the wallets in order with balances derived from transactions", async () => {
    const { userId } = await student();
    const overview = await getWalletsOverview(test.db, userId);
    expect(
      overview.wallets.map((w) => [w.type, w.name, w.archived, w.position, w.balanceMillimes]),
    ).toEqual([
      ["card", null, false, 0, 120_000],
      ["cash", null, false, 1, 10_000],
      ["d17", null, false, 2, 0],
    ]);
    expect(overview.recentTransfers).toEqual([]);
  });
});

describe("transfer", () => {
  it("moves money between two wallets (a cash withdrawal) and lists it", async () => {
    const { userId, card, cash } = await student();
    const input = { ...transferInput(card, cash, 50_000), note: "ATM" };

    expect(await transfer(test.db, userId, input, now)).toBe("saved");

    expect(await balances(userId)).toEqual({ card: 70_000, cash: 60_000, d17: 0 });
    const { recentTransfers } = await getWalletsOverview(test.db, userId);
    expect(recentTransfers).toEqual([
      {
        id: input.id,
        fromWalletId: card,
        toWalletId: cash,
        amountMillimes: 50_000,
        note: "ATM",
        occurredAt: now,
      },
    ]);
  });

  it("saves a retried transfer once", async () => {
    const { userId, card, cash } = await student();
    const input = transferInput(card, cash, 50_000);
    await Promise.all([
      transfer(test.db, userId, input),
      transfer(test.db, userId, input),
      transfer(test.db, userId, input),
    ]);
    expect(await transfer(test.db, userId, input)).toBe("saved");
    expect(await balances(userId)).toEqual({ card: 70_000, cash: 60_000, d17: 0 });
  });

  it("may leave the source below 0", async () => {
    const { userId, cash, d17 } = await student();
    expect(await transfer(test.db, userId, transferInput(d17, cash, 5_000))).toBe("saved");
    expect(await balances(userId)).toMatchObject({ d17: -5_000, cash: 15_000 });
  });

  it("refuses an archived wallet", async () => {
    const { userId, card, d17 } = await student();
    await archiveWallet(test.db, userId, d17, { kind: "zero" });
    expect(await transfer(test.db, userId, transferInput(card, d17, 1_000))).toBe("not-found");
    expect(await transfer(test.db, userId, transferInput(d17, card, 1_000))).toBe("not-found");
  });
});

describe("undoTransfer", () => {
  it("soft-deletes the transfer, and its balances go back", async () => {
    const { userId, card, cash } = await student();
    const input = transferInput(card, cash, 50_000);
    await transfer(test.db, userId, input);

    expect(await undoTransfer(test.db, userId, input.id, now)).toBe("undone");
    expect(await undoTransfer(test.db, userId, input.id, now)).toBe("undone");

    expect(await balances(userId)).toEqual({ card: 120_000, cash: 10_000, d17: 0 });
    expect((await getWalletsOverview(test.db, userId)).recentTransfers).toEqual([]);
    const [row] = await test.db.select().from(transactions).where(eq(transactions.id, input.id));
    expect(row?.deletedAt).toEqual(now);
  });

  it("is refused when a wallet of the transfer is archived", async () => {
    const { userId, card, cash } = await student();
    const input = transferInput(card, cash, 10_000);
    await transfer(test.db, userId, input);
    await archiveWallet(test.db, userId, cash, { kind: "move", toWalletId: card });

    expect(await undoTransfer(test.db, userId, input.id)).toBe("wallet-archived");
    expect(await balances(userId)).toEqual({ card: 130_000, cash: 0, d17: 0 });
  });

  it("only undoes transfers", async () => {
    const { userId } = await student();
    const [startingBalance] = await test.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userId, userId));
    expect(await undoTransfer(test.db, userId, startingBalance?.id ?? "")).toBe("not-found");
  });
});

describe("addWallet", () => {
  it("adds a wallet at the end with its starting balance", async () => {
    const { userId } = await student();
    const result = await addWallet(test.db, userId, {
      kind: "other",
      name: "Poste",
      balanceMillimes: 15_000,
    });
    expect(result.status).toBe("added");

    const { wallets: list } = await getWalletsOverview(test.db, userId);
    expect(list.at(-1)).toMatchObject({
      type: "other",
      name: "Poste",
      position: 3,
      balanceMillimes: 15_000,
    });
    await addWallet(test.db, userId, { kind: "other", name: "Tirelire", balanceMillimes: 0 });
    expect(await balances(userId)).toMatchObject({ Poste: 15_000, Tirelire: 0 });
  });

  it("refuses a second wallet of the same type, even archived", async () => {
    const { userId, d17 } = await student();
    expect(
      await addWallet(test.db, userId, { kind: "card", name: null, balanceMillimes: 0 }),
    ).toEqual({ status: "type-taken" });
    await archiveWallet(test.db, userId, d17, { kind: "zero" });
    expect(
      await addWallet(test.db, userId, { kind: "d17", name: null, balanceMillimes: 0 }),
    ).toEqual({ status: "type-taken" });
    expect(
      (await addWallet(test.db, userId, { kind: "flouci", name: null, balanceMillimes: 0 })).status,
    ).toBe("added");
  });

  it("never stores a name for a default wallet", async () => {
    const { userId } = await student();
    await addWallet(test.db, userId, { kind: "flouci", name: "Mon Flouci", balanceMillimes: 0 });
    const { wallets: list } = await getWalletsOverview(test.db, userId);
    expect(list.find((w) => w.type === "flouci")?.name).toBeNull();
  });
});

describe("renameWallet", () => {
  it("renames an 'other' wallet only", async () => {
    const { userId, cash } = await student();
    const added = await addWallet(test.db, userId, {
      kind: "other",
      name: "Poste",
      balanceMillimes: 0,
    });
    if (added.status !== "added") throw new Error("not added");

    expect(await renameWallet(test.db, userId, added.walletId, "Carte Poste")).toBe("renamed");
    expect(await renameWallet(test.db, userId, cash, "Espèces")).toBe("not-other");
    expect(await balances(userId)).toHaveProperty("Carte Poste", 0);
  });
});

describe("moveWallet", () => {
  it("swaps a wallet with its neighbour and keeps positions 0, 1, 2…", async () => {
    const { userId, card, cash, d17 } = await student();
    const order = async () =>
      (await getWalletsOverview(test.db, userId)).wallets.map((w) => [w.id, w.position]);

    expect(await moveWallet(test.db, userId, d17, "up")).toBe("moved");
    expect(await order()).toEqual([
      [card, 0],
      [d17, 1],
      [cash, 2],
    ]);
    expect(await moveWallet(test.db, userId, card, "up")).toBe("moved"); // already first
    expect(await moveWallet(test.db, userId, cash, "down")).toBe("moved"); // already last
    expect(await moveWallet(test.db, userId, card, "down")).toBe("moved");
    expect(await order()).toEqual([
      [d17, 0],
      [card, 1],
      [cash, 2],
    ]);
  });

  it("ignores archived wallets", async () => {
    const { userId, card, cash, d17 } = await student();
    await archiveWallet(test.db, userId, cash, { kind: "move", toWalletId: card });
    expect(await moveWallet(test.db, userId, cash, "up")).toBe("not-found");
    await moveWallet(test.db, userId, d17, "up");
    const { wallets: list } = await getWalletsOverview(test.db, userId);
    expect(list.filter((w) => !w.archived).map((w) => [w.id, w.position])).toEqual([
      [d17, 0],
      [card, 1],
    ]);
  });
});

describe("archiveWallet and restoreWallet", () => {
  it("moves the balance to another wallet, then archives", async () => {
    const { userId, card, cash } = await student();
    expect(
      await archiveWallet(test.db, userId, cash, { kind: "move", toWalletId: card }, now),
    ).toBe("archived");

    const { wallets: list, recentTransfers } = await getWalletsOverview(test.db, userId);
    expect(list.map((w) => [w.type, w.archived, w.balanceMillimes])).toEqual([
      ["card", false, 130_000],
      ["d17", false, 0],
      ["cash", true, 0],
    ]);
    expect(recentTransfers).toMatchObject([
      { fromWalletId: cash, toWalletId: card, amountMillimes: 10_000 },
    ]);
  });

  it("moves a negative balance in from the other wallet", async () => {
    const { userId, card, cash, d17 } = await student();
    await transfer(test.db, userId, transferInput(d17, cash, 4_000));
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: card });
    expect(await balances(userId)).toEqual({ card: 116_000, cash: 14_000, d17: 0 });
  });

  it("zeroes the balance with an adjustment, then archives", async () => {
    const { userId, cash } = await student();
    expect(await archiveWallet(test.db, userId, cash, { kind: "zero" })).toBe("archived");
    expect(await balances(userId)).toEqual({ card: 120_000, d17: 0, cash: 0 });
    const adjustments = await test.db
      .select({ amount: transactions.amountMillimes, source: transactions.source })
      .from(transactions)
      .where(and(eq(transactions.walletId, cash), eq(transactions.type, "adjustment")));
    expect(adjustments).toEqual(expect.arrayContaining([{ amount: -10_000, source: "manual" }]));
  });

  it("adds no transaction when the wallet is already at 0", async () => {
    const { userId, card, d17 } = await student();
    const before = await test.db.$count(transactions, eq(transactions.userId, userId));
    await archiveWallet(test.db, userId, d17, { kind: "move", toWalletId: card });
    expect(await test.db.$count(transactions, eq(transactions.userId, userId))).toBe(before);
  });

  it("keeps the last active wallet, and refuses to move money to an archived one", async () => {
    const { userId, card, cash, d17 } = await student();
    await archiveWallet(test.db, userId, d17, { kind: "zero" });
    expect(await archiveWallet(test.db, userId, cash, { kind: "move", toWalletId: d17 })).toBe(
      "not-found",
    );
    await archiveWallet(test.db, userId, cash, { kind: "move", toWalletId: card });
    expect(await archiveWallet(test.db, userId, card, { kind: "zero" })).toBe("last-wallet");
    expect(await archiveWallet(test.db, userId, cash, { kind: "zero" })).toBe("not-found");
  });

  it("restores an archived wallet at the end of the list, at 0", async () => {
    const { userId, card, cash } = await student();
    await archiveWallet(test.db, userId, card, { kind: "move", toWalletId: cash });
    expect(await restoreWallet(test.db, userId, card)).toBe("restored");
    expect(await restoreWallet(test.db, userId, card)).toBe("not-found");

    const { wallets: list } = await getWalletsOverview(test.db, userId);
    expect(list.map((w) => [w.type, w.archived, w.position, w.balanceMillimes])).toEqual([
      ["cash", false, 1, 130_000],
      ["d17", false, 2, 0],
      ["card", false, 3, 0],
    ]);
  });
});

// Required (CLAUDE.md): user B can't see or change anything of user A's.
describe("isolation between users", () => {
  it("B never sees A's wallets, balances or transfers", async () => {
    const a = await student();
    const b = await student();
    await transfer(test.db, a.userId, transferInput(a.card, a.cash, 50_000));

    const overview = await getWalletsOverview(test.db, b.userId);
    const aIds = [a.card, a.cash, a.d17];
    expect(overview.wallets.some((w) => aIds.includes(w.id))).toBe(false);
    expect(overview.wallets.map((w) => w.balanceMillimes)).toEqual([120_000, 10_000, 0]);
    expect(overview.recentTransfers).toEqual([]);
  });

  it("B can't rename, reorder, archive, restore or move money with A's wallets", async () => {
    const a = await student();
    const b = await student();
    const otherOfA = await addWallet(test.db, a.userId, {
      kind: "other",
      name: "Tirelire",
      balanceMillimes: 5_000,
    });
    if (otherOfA.status !== "added") throw new Error("not added");
    await archiveWallet(test.db, a.userId, a.d17, { kind: "zero" });
    const snapshot = async () => ({
      wallets: await test.db.select().from(wallets).where(eq(wallets.userId, a.userId)),
      transactions: await test.db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, a.userId)),
    });
    const before = await snapshot();

    expect(await renameWallet(test.db, b.userId, otherOfA.walletId, "Mine")).toBe("not-found");
    expect(await moveWallet(test.db, b.userId, a.cash, "up")).toBe("not-found");
    expect(await archiveWallet(test.db, b.userId, a.cash, { kind: "zero" })).toBe("not-found");
    // B archives their own wallet but tries to send its money to A.
    expect(
      await archiveWallet(test.db, b.userId, b.cash, { kind: "move", toWalletId: a.card }),
    ).toBe("not-found");
    expect(await restoreWallet(test.db, b.userId, a.d17)).toBe("not-found");
    expect(await transfer(test.db, b.userId, transferInput(a.card, a.cash, 1_000))).toBe(
      "not-found",
    );
    expect(await transfer(test.db, b.userId, transferInput(a.card, b.cash, 1_000))).toBe(
      "not-found",
    );
    expect(await transfer(test.db, b.userId, transferInput(b.card, a.cash, 1_000))).toBe(
      "not-found",
    );

    expect(await snapshot()).toEqual(before);
    expect(await balances(b.userId)).toEqual({ card: 120_000, cash: 10_000, d17: 0 });
  });

  it("B can't undo A's transfer or reuse its ID", async () => {
    const a = await student();
    const b = await student();
    const input = transferInput(a.card, a.cash, 50_000);
    await transfer(test.db, a.userId, input);

    expect(await undoTransfer(test.db, b.userId, input.id)).toBe("not-found");
    expect(
      await transfer(test.db, b.userId, { ...transferInput(b.card, b.cash, 1_000), id: input.id }),
    ).toBe("not-found");

    expect(await balances(a.userId)).toEqual({ card: 70_000, cash: 60_000, d17: 0 });
    expect(await balances(b.userId)).toEqual({ card: 120_000, cash: 10_000, d17: 0 });
  });
});
