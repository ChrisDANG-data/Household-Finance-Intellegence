import { disposableAssetsService } from "@/services/financial-state/disposable-assets.service";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";
import { plaidBalanceHistoryService } from "@/services/integrations/plaid/plaid-balance-history.service";

import { extractTargetMonth } from "./monthly-lookup";

function formatMoney(amount: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Live linked-account balance — not forecast closing/opening balance for a month. */
export function isPlaidBalanceQuery(message: string): boolean {
  const lower = message.toLowerCase();

  if (/\bplaid\b/.test(lower)) return true;

  if (
    /\b(disposable assets?|linked account|bank account|bank balance|sync live)\b/.test(
      lower,
    )
  ) {
    return true;
  }

  const targetMonth = extractTargetMonth(message);
  if (targetMonth) {
    if (/\b(closing|opening|forecast)\b/.test(lower)) return false;
    if (!/\b(plaid|checking|savings|bank|linked)\b/.test(lower)) return false;
  }

  if (/\b(checking|savings|bank)\s+balance\b/.test(lower)) return true;
  if (/\bbalance\b/.test(lower) && /\b(checking|savings|bank|linked)\b/.test(lower)) {
    return true;
  }

  if (
    /\bwhat('s| is) my (checking|savings|bank )?balance\b/.test(lower) &&
    !targetMonth
  ) {
    return true;
  }

  return false;
}

function formatFromCachedHistory(
  rows: Awaited<ReturnType<typeof plaidBalanceHistoryService.listRecent>>,
): string {
  const latestByAccount = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const prev = latestByAccount.get(row.plaid_account_id);
    if (!prev || row.snapshot_date > prev.snapshot_date) {
      latestByAccount.set(row.plaid_account_id, row);
    }
  }

  const lines = [...latestByAccount.values()].map(
    (row) =>
      `• ${row.account_name.padEnd(22)} ${formatMoney(row.balance, row.currency)} (${row.snapshot_date})`,
  );

  return `Plaid balances (last sync):\n\n${lines.join("\n")}`;
}

/**
 * Answer linked bank / Plaid balance questions from live API or cached history.
 */
export async function tryPlaidBalanceAnswer(
  message: string,
  userId: string = DEFAULT_USER_ID,
): Promise<string | null> {
  if (!isPlaidBalanceQuery(message)) return null;

  try {
    const summary = await disposableAssetsService.getSummary(userId);

    if (!summary.plaid_connected) {
      const recent = await plaidBalanceHistoryService.listRecent(userId, 20);
      if (recent.length > 0) {
        return formatFromCachedHistory(recent);
      }
      return (
        "Plaid is not linked. Open Balances in the app, connect your bank with Plaid Link, " +
        "then click Sync live from Plaid."
      );
    }

    const asOf = summary.as_of.slice(0, 10);
    const accountLines = summary.account_lines.map(
      (account) =>
        `• ${account.name.padEnd(22)} ${formatMoney(account.balance, account.currency)}`,
    );

    return [
      `Plaid balances as of ${asOf}:`,
      "",
      ...accountLines,
      "",
      `Checking total: ${formatMoney(summary.checking_total)}`,
      `Savings total: ${formatMoney(summary.savings_total)}`,
      `Plaid assets total: ${formatMoney(summary.plaid_assets_total)}`,
    ].join("\n");
  } catch (error) {
    const recent = await plaidBalanceHistoryService.listRecent(userId, 20);
    if (recent.length > 0) {
      return formatFromCachedHistory(recent);
    }

    const detail = error instanceof Error ? error.message : String(error);
    return (
      `Could not load Plaid balances: ${detail}. ` +
      "Check PLAID_CLIENT_ID and PLAID_SECRET in .env, or use Sync live on the Balances page."
    );
  }
}
