import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSummary = vi.fn();
const mockListRecent = vi.fn();

vi.mock("@/services/financial-state/disposable-assets.service", () => ({
  disposableAssetsService: {
    getSummary: (...args: unknown[]) => mockGetSummary(...args),
  },
}));

vi.mock("@/services/integrations/plaid/plaid-balance-history.service", () => ({
  plaidBalanceHistoryService: {
    listRecent: (...args: unknown[]) => mockListRecent(...args),
  },
}));

import {
  isPlaidBalanceQuery,
  tryPlaidBalanceAnswer,
} from "../plaid-balance-lookup";

describe("isPlaidBalanceQuery", () => {
  it("matches explicit Plaid questions", () => {
    expect(isPlaidBalanceQuery("What is my Plaid balance?")).toBe(true);
  });

  it("does not steal forecast month balance questions", () => {
    expect(isPlaidBalanceQuery("What is my closing balance in July?")).toBe(false);
  });

  it("matches generic live balance without a month", () => {
    expect(isPlaidBalanceQuery("What's my checking balance?")).toBe(true);
  });
});

describe("tryPlaidBalanceAnswer", () => {
  beforeEach(() => {
    mockGetSummary.mockReset();
    mockListRecent.mockReset();
  });

  it("returns live Plaid totals when connected", async () => {
    mockGetSummary.mockResolvedValue({
      as_of: "2026-06-16T12:00:00.000Z",
      plaid_connected: true,
      checking_total: 5000,
      savings_total: 1000,
      plaid_assets_total: 6000,
      account_lines: [
        {
          name: "Checking · depository",
          balance: 5000,
          currency: "CAD",
        },
      ],
    });

    const answer = await tryPlaidBalanceAnswer("Plaid balance");

    expect(answer).toContain("Plaid balances as of 2026-06-16");
    expect(answer).toContain("Plaid assets total: $6,000.00");
  });

  it("guides user when Plaid is not linked", async () => {
    mockGetSummary.mockResolvedValue({ plaid_connected: false });
    mockListRecent.mockResolvedValue([]);

    const answer = await tryPlaidBalanceAnswer("Plaid balance");

    expect(answer).toMatch(/Plaid is not linked/i);
  });
});
