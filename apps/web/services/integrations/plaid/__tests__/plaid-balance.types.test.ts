import { describe, expect, it } from "vitest";

import {
  filterCheckingAccounts,
  isCheckingAccount,
  sumAvailableBalances,
  sumCashManagementBalances,
  sumCheckingBalances,
  sumCreditOwed,
  sumInvestmentBalances,
  sumLiquidBalances,
  sumPlaidDisposableAssets,
  sumSavingsBalances,
} from "../plaid-balance.types";

describe("plaid balance account filters", () => {
  const accounts = [
    {
      account_id: "chk",
      type: "depository",
      subtype: "checking",
      available: 5000,
      current: 5000,
    },
    {
      account_id: "sav",
      type: "depository",
      subtype: "savings",
      available: 10000,
      current: 10000,
    },
    {
      account_id: "cash",
      type: "depository",
      subtype: "cash management",
      available: 3000,
      current: 3000,
    },
    {
      account_id: "inv",
      type: "investment",
      subtype: "brokerage",
      available: 7000,
      current: 7000,
    },
    {
      account_id: "cc",
      type: "credit",
      subtype: "credit card",
      available: null,
      current: 1200,
    },
  ];

  it("identifies checking accounts by subtype", () => {
    expect(isCheckingAccount(accounts[0])).toBe(true);
    expect(isCheckingAccount(accounts[1])).toBe(false);
    expect(isCheckingAccount(accounts[2])).toBe(false);
  });

  it("sums checking balances only for current_cash", () => {
    expect(sumCheckingBalances(accounts)).toBe(5000);
    expect(sumSavingsBalances(accounts)).toBe(10000);
    expect(sumCashManagementBalances(accounts)).toBe(3000);
    expect(sumInvestmentBalances(accounts)).toBe(7000);
    expect(sumLiquidBalances(accounts)).toBe(18000);
    expect(sumPlaidDisposableAssets(accounts)).toBe(25000);
    expect(sumCreditOwed(accounts)).toBe(1200);
    expect(sumAvailableBalances(accounts)).toBe(26200);
    expect(filterCheckingAccounts(accounts)).toHaveLength(1);
  });
});
