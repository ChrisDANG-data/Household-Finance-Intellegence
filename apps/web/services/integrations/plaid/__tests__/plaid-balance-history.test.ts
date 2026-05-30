import { describe, expect, it } from "vitest";

import type { PlaidBalanceSnapshot } from "../plaid-balance.types";

function resolveBalance(account: {
  available?: number | null;
  current?: number | null;
}): number {
  return Number((account.available ?? account.current ?? 0).toFixed(2));
}

describe("plaid balance history helpers", () => {
  it("resolves balance from available then current", () => {
    expect(resolveBalance({ available: 100, current: 110 })).toBe(100);
    expect(resolveBalance({ available: null, current: 110 })).toBe(110);
  });

  it("snapshot shape includes accounts for recording", () => {
    const snapshot: PlaidBalanceSnapshot = {
      item_id: "item-1",
      as_of: "2026-05-28T00:00:00.000Z",
      accounts: [
        {
          account_id: "acc-1",
          name: "Checking",
          available: 500,
          current: 500,
        },
      ],
    };
    expect(snapshot.accounts[0].account_id).toBe("acc-1");
    expect(resolveBalance(snapshot.accounts[0])).toBe(500);
  });
});
