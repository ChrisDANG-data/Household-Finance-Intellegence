import { currentUtcMonth } from "@/services/financial-state/dates";
import { dedupeFinancialEventsForProjection } from "@/services/financial-state/event-dedupe";
import { prismaEventToDomain } from "@/services/financial-state/event.mapper";
import {
  DEFAULT_USER_ID,
} from "@/services/financial-state/financial-state.persistence";
import { projectMonth } from "@/services/financial-state/projection";
import type { PlaidAccountBalance } from "@/services/integrations/plaid/plaid-balance.types";
import {
  accountBalanceAmount,
  isCashManagementAccount,
  isCheckingAccount,
  isCreditAccount,
  isInvestmentAccount,
  isMortgageAccount,
  isSavingsAccount,
  sumCashManagementBalances,
  sumCheckingBalances,
  sumCreditOwed,
  sumInvestmentBalances,
  sumMortgageBalances,
  sumPlaidDisposableAssets,
  sumSavingsBalances,
} from "@/services/integrations/plaid/plaid-balance.types";
import { plaidApiService } from "@/services/integrations/plaid/plaid-api.service";
import { plaidItemService } from "@/services/integrations/plaid/plaid-item.service";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/utils/errors";

export type DisposableAccountCategory =
  | "checking"
  | "savings"
  | "cash_management"
  | "investment"
  | "credit"
  | "mortgage"
  | "other";

export interface DisposableAccountLine {
  account_id: string;
  name: string;
  subtype: string | null;
  category: DisposableAccountCategory;
  balance: number;
  currency: string;
  /** When true, shown for reference only (not in disposable total). */
  informational?: boolean;
}

export interface DisposableAssetsSummary {
  as_of: string;
  month: string;
  currency: string;
  plaid_connected: boolean;
  checking_total: number;
  savings_total: number;
  cash_management_total: number;
  investment_total: number;
  /** Checking + savings + cash management + investment (all from Plaid). */
  plaid_assets_total: number;
  credit_owed: number;
  /** Ledger income active in the current month (from FinancialEvent). */
  month_income: number;
  /** Ledger expenses active in the current month (recurring, one-time, liability). */
  month_expenses: number;
  /** Ledger investment outflows active in the current month. */
  month_investment: number;
  /** Plaid assets + income − expenses − investment (current month ledger) */
  disposable_total: number;
  /** Mortgage balance owed — informational only */
  mortgage_total: number;
  mortgage_lines: DisposableAccountLine[];
  account_lines: DisposableAccountLine[];
  notes: string[];
}

function accountDisplayName(account: PlaidAccountBalance): string {
  const parts = [account.name, account.subtype].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : account.account_id;
}

function categorizeAccount(
  account: PlaidAccountBalance,
): DisposableAccountCategory {
  if (isCheckingAccount(account)) return "checking";
  if (isSavingsAccount(account)) return "savings";
  if (isCashManagementAccount(account)) return "cash_management";
  if (isInvestmentAccount(account)) return "investment";
  if (isCreditAccount(account)) return "credit";
  if (isMortgageAccount(account)) return "mortgage";
  return "other";
}

function toAccountLine(account: PlaidAccountBalance): DisposableAccountLine {
  const category = categorizeAccount(account);
  const raw = accountBalanceAmount(account);
  const isOwed = category === "credit" || category === "mortgage";
  const balance = isOwed ? Math.max(0, raw) : raw;

  return {
    account_id: account.account_id,
    name: accountDisplayName(account),
    subtype: account.subtype ?? null,
    category,
    balance: Number(balance.toFixed(2)),
    currency: "CAD",
    informational: category === "mortgage",
  };
}

export function computeDisposableAssets(input: {
  as_of: string;
  month?: string;
  currency?: string;
  plaid_connected: boolean;
  plaid_accounts: PlaidAccountBalance[];
  month_income: number;
  month_expenses: number;
  month_investment: number;
}): DisposableAssetsSummary {
  const month = input.month ?? currentUtcMonth();
  const currency = input.currency ?? "CAD";
  const notes: string[] = [];

  const checking_total = input.plaid_connected
    ? sumCheckingBalances(input.plaid_accounts)
    : 0;
  const savings_total = input.plaid_connected
    ? sumSavingsBalances(input.plaid_accounts)
    : 0;
  const cash_management_total = input.plaid_connected
    ? sumCashManagementBalances(input.plaid_accounts)
    : 0;
  const investment_total = input.plaid_connected
    ? sumInvestmentBalances(input.plaid_accounts)
    : 0;
  const plaid_assets_total = input.plaid_connected
    ? sumPlaidDisposableAssets(input.plaid_accounts)
    : 0;
  const credit_owed = input.plaid_connected
    ? sumCreditOwed(input.plaid_accounts)
    : 0;
  const mortgage_total = input.plaid_connected
    ? sumMortgageBalances(input.plaid_accounts)
    : 0;

  const month_income = Number(input.month_income.toFixed(2));
  const month_expenses = Number(input.month_expenses.toFixed(2));
  const month_investment = Number(input.month_investment.toFixed(2));

  const disposable_total = Number(
    (
      plaid_assets_total +
      month_income -
      month_expenses -
      month_investment
    ).toFixed(2),
  );

  const account_lines = input.plaid_connected
    ? input.plaid_accounts
        .map(toAccountLine)
        .filter((line) => line.category !== "mortgage")
    : [];

  const mortgage_lines = input.plaid_connected
    ? input.plaid_accounts
        .map(toAccountLine)
        .filter((line) => line.category === "mortgage")
    : [];

  if (!input.plaid_connected) {
    notes.push("Link Plaid and use Sync live to load balances from your bank.");
  } else {
    notes.push(
      "Plaid balances are live. Disposable adds this month's ledger income and subtracts expenses and investments.",
    );
    notes.push("Mortgage is shown for reference only.");
    if (investment_total === 0) {
      notes.push(
        "No investment accounts in Plaid link (requires investment product access).",
      );
    }
  }

  return {
    as_of: input.as_of,
    month,
    currency: "CAD",
    plaid_connected: input.plaid_connected,
    checking_total,
    savings_total,
    cash_management_total,
    investment_total,
    plaid_assets_total,
    credit_owed,
    month_income,
    month_expenses,
    month_investment,
    disposable_total,
    mortgage_total,
    mortgage_lines,
    account_lines,
    notes,
  };
}

export class DisposableAssetsService {
  async getSummary(
    userId: string = DEFAULT_USER_ID,
  ): Promise<DisposableAssetsSummary> {
    const month = currentUtcMonth();

    const [eventRows, linked] = await Promise.all([
      prisma.financialEvent.findMany({ orderBy: { startDate: "asc" } }),
      plaidItemService.getAccessTokenForUser(userId),
    ]);

    const events = dedupeFinancialEventsForProjection(
      eventRows.map(prismaEventToDomain),
    );
    const monthFlow = projectMonth(
      {
        user_id: userId,
        current_cash: 0,
        monthly_income: 0,
        events,
        computed: {
          monthly_net_cash_flow: 0,
          burn_rate: 0,
          runway_months: null,
          fixed_cost_ratio: 0,
        },
      },
      month,
    );

    const ledgerInput = {
      month_income: monthFlow.income_total,
      month_expenses: monthFlow.expense_total,
      month_investment: monthFlow.investment_total,
    };

    if (!linked || !plaidApiService.isConfigured()) {
      return computeDisposableAssets({
        as_of: new Date().toISOString(),
        month,
        plaid_connected: false,
        plaid_accounts: [],
        ...ledgerInput,
      });
    }

    const snapshot = await plaidApiService.getAccountBalances(
      linked.access_token,
    );

    return computeDisposableAssets({
      as_of: snapshot.as_of,
      month,
      plaid_connected: true,
      plaid_accounts: snapshot.accounts,
      ...ledgerInput,
    });
  }

  /** Live Plaid fetch + persist history + update current_cash, then return summary. */
  async syncAndGetSummary(
    userId: string = DEFAULT_USER_ID,
  ): Promise<DisposableAssetsSummary> {
    const { plaidDirectSyncService } = await import(
      "@/services/integrations/plaid/plaid-direct-sync.service"
    );

    const linked = await plaidItemService.getAccessTokenForUser(userId);
    if (!linked) {
      throw new AppError("Plaid is not linked. Connect a bank account first.", {
        code: "INTEGRATION_NOT_CONFIGURED",
        statusCode: 503,
      });
    }

    await plaidDirectSyncService.syncBalancesForUser(userId, undefined, {
      force: true,
      sync_source: "manual",
    });

    return this.getSummary(userId);
  }
}

export const disposableAssetsService = new DisposableAssetsService();
