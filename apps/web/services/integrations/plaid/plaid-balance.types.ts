export interface PlaidAccountBalance {
  account_id: string;
  name?: string;
  /** Plaid account type, e.g. depository, credit */
  type?: string;
  /** Plaid subtype, e.g. checking, savings, credit card */
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

export function accountBalanceAmount(account: PlaidAccountBalance): number {
  return account.available ?? account.current ?? 0;
}

export function sumAvailableBalances(accounts: PlaidAccountBalance[]): number {
  return accounts.reduce((sum, a) => sum + accountBalanceAmount(a), 0);
}

/** Checking accounts only — used for financial_states.current_cash (liquid cash). */
export function isCheckingAccount(account: PlaidAccountBalance): boolean {
  const subtype = account.subtype?.trim().toLowerCase();
  if (subtype === "checking") return true;
  const type = account.type?.trim().toLowerCase();
  return type === "depository" && subtype === "checking";
}

export function filterCheckingAccounts(
  accounts: PlaidAccountBalance[],
): PlaidAccountBalance[] {
  return accounts.filter(isCheckingAccount);
}

/** Sum checking balances for forecast anchor (excludes credit, savings, investments). */
export function sumCheckingBalances(accounts: PlaidAccountBalance[]): number {
  return Number(
    filterCheckingAccounts(accounts)
      .reduce((sum, a) => sum + accountBalanceAmount(a), 0)
      .toFixed(2),
  );
}

export function isSavingsAccount(account: PlaidAccountBalance): boolean {
  const subtype = account.subtype?.trim().toLowerCase();
  return subtype === "savings";
}

export function isCashManagementAccount(account: PlaidAccountBalance): boolean {
  const subtype = account.subtype?.trim().toLowerCase();
  return subtype === "cash management" || subtype === "money market";
}

export function isInvestmentAccount(account: PlaidAccountBalance): boolean {
  const type = account.type?.trim().toLowerCase();
  return type === "investment";
}

export function isMortgageAccount(account: PlaidAccountBalance): boolean {
  const type = account.type?.trim().toLowerCase();
  const subtype = account.subtype?.trim().toLowerCase() ?? "";
  return type === "loan" && subtype.includes("mortgage");
}

export function filterCashManagementAccounts(
  accounts: PlaidAccountBalance[],
): PlaidAccountBalance[] {
  return accounts.filter(isCashManagementAccount);
}

export function filterInvestmentAccounts(
  accounts: PlaidAccountBalance[],
): PlaidAccountBalance[] {
  return accounts.filter(isInvestmentAccount);
}

export function filterMortgageAccounts(
  accounts: PlaidAccountBalance[],
): PlaidAccountBalance[] {
  return accounts.filter(isMortgageAccount);
}

export function sumAccountGroup(
  accounts: PlaidAccountBalance[],
): number {
  return Number(
    accounts.reduce((sum, a) => sum + accountBalanceAmount(a), 0).toFixed(2),
  );
}

export function sumCashManagementBalances(
  accounts: PlaidAccountBalance[],
): number {
  return sumAccountGroup(filterCashManagementAccounts(accounts));
}

export function sumInvestmentBalances(accounts: PlaidAccountBalance[]): number {
  return sumAccountGroup(filterInvestmentAccounts(accounts));
}

/** Mortgage / loan balance owed (informational only — not subtracted from disposable). */
export function sumMortgageBalances(accounts: PlaidAccountBalance[]): number {
  return Number(
    filterMortgageAccounts(accounts)
      .reduce((sum, a) => sum + Math.max(0, accountBalanceAmount(a)), 0)
      .toFixed(2),
  );
}

export function filterSavingsAccounts(
  accounts: PlaidAccountBalance[],
): PlaidAccountBalance[] {
  return accounts.filter(isSavingsAccount);
}

export function sumSavingsBalances(accounts: PlaidAccountBalance[]): number {
  return Number(
    filterSavingsAccounts(accounts)
      .reduce((sum, a) => sum + accountBalanceAmount(a), 0)
      .toFixed(2),
  );
}

export function isCreditAccount(account: PlaidAccountBalance): boolean {
  const type = account.type?.trim().toLowerCase();
  const subtype = account.subtype?.trim().toLowerCase();
  return type === "credit" || subtype === "credit card" || subtype === "paypal";
}

export function filterCreditAccounts(
  accounts: PlaidAccountBalance[],
): PlaidAccountBalance[] {
  return accounts.filter(isCreditAccount);
}

/** Amount owed on credit accounts (Plaid current balance, clamped ≥ 0). */
export function sumCreditOwed(accounts: PlaidAccountBalance[]): number {
  return Number(
    filterCreditAccounts(accounts)
      .reduce((sum, a) => sum + Math.max(0, accountBalanceAmount(a)), 0)
      .toFixed(2),
  );
}

export function sumLiquidBalances(accounts: PlaidAccountBalance[]): number {
  return Number(
    (
      sumCheckingBalances(accounts) +
      sumSavingsBalances(accounts) +
      sumCashManagementBalances(accounts)
    ).toFixed(2),
  );
}

/** Plaid assets counted toward disposable: checking + savings + cash management + investment. */
export function sumPlaidDisposableAssets(accounts: PlaidAccountBalance[]): number {
  return Number(
    (
      sumCheckingBalances(accounts) +
      sumSavingsBalances(accounts) +
      sumCashManagementBalances(accounts) +
      sumInvestmentBalances(accounts)
    ).toFixed(2),
  );
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
        type: a.type ? String(a.type) : undefined,
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
      type: a.type ? String(a.type) : undefined,
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
