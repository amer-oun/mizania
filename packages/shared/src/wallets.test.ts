import { describe, expect, it } from "vitest";

import {
  addWalletSchema,
  archiveWalletSchema,
  moveWalletSchema,
  renameWalletSchema,
  restoreWalletSchema,
  transferSchema,
  undoTransferSchema,
} from "./wallets";

const a = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a01";
const b = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a02";
const c = "6b1f1c1e-6a8e-4c43-9a55-0c1f0f8f1a03";

describe("addWalletSchema", () => {
  it("keeps the trimmed name of an 'other' wallet and drops it for the rest", () => {
    expect(addWalletSchema.parse({ kind: "other", name: " Poste ", balanceMillimes: 0 })).toEqual({
      kind: "other",
      name: "Poste",
      balanceMillimes: 0,
    });
    expect(addWalletSchema.parse({ kind: "card", name: "BIAT", balanceMillimes: 5_000 })).toEqual({
      kind: "card",
      name: null,
      balanceMillimes: 5_000,
    });
  });

  it.each<[string, unknown]>([
    ["an 'other' wallet without a name", { kind: "other", balanceMillimes: 0 }],
    ["an 'other' wallet with a blank name", { kind: "other", name: "  ", balanceMillimes: 0 }],
    ["a name too long", { kind: "other", name: "x".repeat(41), balanceMillimes: 0 }],
    ["an unknown type", { kind: "bank", balanceMillimes: 0 }],
    ["a negative balance", { kind: "cash", balanceMillimes: -1 }],
    ["a balance with decimals", { kind: "cash", balanceMillimes: 1.5 }],
    ["an extra field", { kind: "cash", balanceMillimes: 0, userId: a }],
  ])("refuses %s", (_, value) => {
    expect(addWalletSchema.safeParse(value).success).toBe(false);
  });
});

describe("renameWalletSchema", () => {
  it("trims the name", () => {
    expect(renameWalletSchema.parse({ walletId: a, name: " Tirelire " }).name).toBe("Tirelire");
  });

  it.each<[string, unknown]>([
    ["a blank name", { walletId: a, name: " " }],
    ["a name too long", { walletId: a, name: "x".repeat(41) }],
    ["a wallet ID that isn't a UUID", { walletId: "1", name: "Tirelire" }],
  ])("refuses %s", (_, value) => {
    expect(renameWalletSchema.safeParse(value).success).toBe(false);
  });
});

describe("moveWalletSchema and restoreWalletSchema", () => {
  it("take a wallet ID (and a direction)", () => {
    expect(moveWalletSchema.safeParse({ walletId: a, direction: "up" }).success).toBe(true);
    expect(moveWalletSchema.safeParse({ walletId: a, direction: "left" }).success).toBe(false);
    expect(restoreWalletSchema.safeParse({ walletId: a }).success).toBe(true);
    expect(restoreWalletSchema.safeParse({ walletId: "x" }).success).toBe(false);
  });
});

describe("archiveWalletSchema", () => {
  it("accepts moving the balance to another wallet, or zeroing it", () => {
    expect(
      archiveWalletSchema.safeParse({ walletId: a, choice: { kind: "move", toWalletId: b } })
        .success,
    ).toBe(true);
    expect(archiveWalletSchema.safeParse({ walletId: a, choice: { kind: "zero" } }).success).toBe(
      true,
    );
  });

  it.each<[string, unknown]>([
    ["moving to the same wallet", { walletId: a, choice: { kind: "move", toWalletId: a } }],
    ["moving without a target", { walletId: a, choice: { kind: "move" } }],
    ["an unknown choice", { walletId: a, choice: { kind: "keep" } }],
    ["no choice", { walletId: a }],
  ])("refuses %s", (_, value) => {
    expect(archiveWalletSchema.safeParse(value).success).toBe(false);
  });
});

describe("transferSchema", () => {
  const valid = { id: c, fromWalletId: a, toWalletId: b, amountMillimes: 50_000 };

  it("accepts a transfer and turns an empty note into null", () => {
    expect(transferSchema.parse(valid)).toEqual({ ...valid, note: null });
    expect(transferSchema.parse({ ...valid, note: "  " }).note).toBeNull();
    expect(transferSchema.parse({ ...valid, note: " ATM " }).note).toBe("ATM");
  });

  it.each<[string, unknown]>([
    ["the same wallet twice", { ...valid, toWalletId: a }],
    ["an amount of 0", { ...valid, amountMillimes: 0 }],
    ["a negative amount", { ...valid, amountMillimes: -5 }],
    ["an amount with decimals", { ...valid, amountMillimes: 0.5 }],
    ["a note too long", { ...valid, note: "x".repeat(201) }],
    ["no client ID", { ...valid, id: undefined }],
    ["an extra field", { ...valid, userId: a }],
  ])("refuses %s", (_, value) => {
    expect(transferSchema.safeParse(value).success).toBe(false);
  });
});

describe("undoTransferSchema", () => {
  it("takes a transfer ID", () => {
    expect(undoTransferSchema.safeParse({ transferId: a }).success).toBe(true);
    expect(undoTransferSchema.safeParse({ transferId: 1 }).success).toBe(false);
  });
});
