import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

import { plaidApiService } from "./plaid-api.service";
import type { PlaidAccountBalance } from "./plaid-balance.types";
import { plaidItemService } from "./plaid-item.service";

export interface PlaidAccountSummary {
  account_id: string;
  account_name: string;
  subtype: string | null;
  balance: number;
  currency: string;
}

function accountDisplayName(account: PlaidAccountBalance): string {
  const parts = [account.name, account.subtype].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : account.account_id;
}

function accountBalance(account: PlaidAccountBalance): number {
  return Number((account.available ?? account.current ?? 0).toFixed(2));
}

function matchesFilter(account: PlaidAccountSummary, filter: string): boolean {
  const q = filter.toLowerCase().trim();
  if (!q) return true;
  const haystack = [
    account.account_name,
    account.subtype ?? "",
    account.account_id,
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export class PlaidAccountsService {
  async listLiveAccounts(
    userId: string = DEFAULT_USER_ID,
    filter?: string,
  ): Promise<{
    item_id: string;
    as_of: string;
    accounts: PlaidAccountSummary[];
  }> {
    const { item_id, access_token } =
      await plaidItemService.requireAccessToken(userId);
    const snapshot = await plaidApiService.getAccountBalances(access_token);

    let accounts: PlaidAccountSummary[] = snapshot.accounts.map((a) => ({
      account_id: a.account_id,
      account_name: accountDisplayName(a),
      subtype: a.subtype ?? null,
      balance: accountBalance(a),
      currency: a.iso_currency_code ?? "USD",
    }));

    if (filter?.trim()) {
      accounts = accounts.filter((a) => matchesFilter(a, filter));
    }

    return {
      item_id: snapshot.item_id || item_id,
      as_of: snapshot.as_of,
      accounts,
    };
  }
}

export const plaidAccountsService = new PlaidAccountsService();
