export interface PlaidAccountBalance {
  account_id: string;
  name?: string;
  subtype?: string;
  available?: number | null;
  current?: number | null;
  iso_currency_code?: string | null;
}

export interface PlaidBalanceSnapshot {
  item_id: string;
  as_of: string;
  accounts: PlaidAccountBalance[];
  cursor?: string;
  request_id?: string;
}

export function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function sumAvailableBalances(accounts: PlaidAccountBalance[]): number {
  return accounts.reduce((sum, a) => sum + (a.available ?? a.current ?? 0), 0);
}

/** Map Plaid /accounts/balance/get JSON to internal snapshot. */
export function balanceGetResponseToSnapshot(
  payload: Record<string, unknown>,
): PlaidBalanceSnapshot {
  const accountsRaw = Array.isArray(payload.accounts) ? payload.accounts : [];
  const item =
    payload.item && typeof payload.item === "object"
      ? (payload.item as Record<string, unknown>)
      : undefined;

  const accounts: PlaidAccountBalance[] = accountsRaw
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"))
    .map((a) => {
      const balances =
        a.balances && typeof a.balances === "object"
          ? (a.balances as Record<string, unknown>)
          : {};
      return {
        account_id: String(a.account_id ?? ""),
        name: a.name ? String(a.name) : undefined,
        subtype: a.subtype ? String(a.subtype) : undefined,
        available: parseNumber(balances.available),
        current: parseNumber(balances.current),
        iso_currency_code: balances.iso_currency_code
          ? String(balances.iso_currency_code)
          : null,
      };
    })
    .filter((a) => a.account_id.length > 0);

  return {
    item_id: String(item?.item_id ?? ""),
    as_of: new Date().toISOString(),
    request_id: payload.request_id ? String(payload.request_id) : undefined,
    accounts,
  };
}

/** Map MCP `/balances` JSON (legacy path). */
export function mcpResponseToSnapshot(raw: unknown): PlaidBalanceSnapshot {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Plaid MCP response");
  }
  const obj = raw as Record<string, unknown>;
  const accounts = Array.isArray(obj.accounts) ? obj.accounts : [];
  const parsedAccounts: PlaidAccountBalance[] = accounts
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"))
    .map((a) => ({
      account_id: String(a.account_id ?? ""),
      name: a.name ? String(a.name) : undefined,
      subtype: a.subtype ? String(a.subtype) : undefined,
      available: parseNumber(a.available),
      current: parseNumber(a.current),
      iso_currency_code: a.iso_currency_code ? String(a.iso_currency_code) : null,
    }))
    .filter((a) => a.account_id.length > 0);

  return {
    item_id: String(obj.item_id ?? "default-item"),
    as_of: String(obj.as_of ?? new Date().toISOString()),
    cursor: obj.cursor ? String(obj.cursor) : undefined,
    request_id: obj.request_id ? String(obj.request_id) : undefined,
    accounts: parsedAccounts,
  };
}
