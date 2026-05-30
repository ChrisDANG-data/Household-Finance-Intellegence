import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

import {
  balanceGetResponseToSnapshot,
  type PlaidBalanceSnapshot,
} from "./plaid-balance.types";

export type PlaidEnvironment = "sandbox" | "production";

export interface PlaidLinkTokenRequest {
  client_user_id?: string;
  phone_number?: string;
  /** e.g. ["transactions"] — do not include "balance" as a product */
  products?: string[];
  transactions_days_requested?: number;
  country_codes?: string[];
  language?: string;
  webhook?: string;
  redirect_uri?: string;
  account_filters?: Record<string, unknown>;
}

export interface PlaidLinkTokenResponse {
  link_token: string;
  expiration: string;
  request_id: string;
}

export interface PlaidExchangeResult {
  item_id: string;
  access_token: string;
  request_id: string;
}

function plaidHost(plaidEnv: PlaidEnvironment): string {
  return plaidEnv === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";
}

function requirePlaidCredentials(): {
  clientId: string;
  secret: string;
  plaidEnv: PlaidEnvironment;
} {
  const clientId = env.plaid.clientId();
  const secret = env.plaid.secret();
  const plaidEnv = env.plaid.environment();

  if (!clientId || !secret) {
    throw new AppError(
      "PLAID_CLIENT_ID and PLAID_SECRET are required",
      { code: "INTEGRATION_NOT_CONFIGURED", statusCode: 503 },
    );
  }

  return { clientId, secret, plaidEnv };
}

async function plaidPost<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { clientId, secret, plaidEnv } = requirePlaidCredentials();

  const response = await fetch(`${plaidHost(plaidEnv)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof payload.error_message === "string"
        ? payload.error_message
        : `Plaid ${path} failed (${response.status})`;
    throw new AppError(message, {
      code: "INTEGRATION_ERROR",
      statusCode:
        response.status >= 400 && response.status < 600 ? response.status : 502,
      details: payload,
    });
  }

  return payload as T;
}

export class PlaidApiService {
  isConfigured(): boolean {
    return Boolean(env.plaid.clientId() && env.plaid.secret());
  }

  /** Step 1 — Link token (products must not include "balance"). */
  async createLinkToken(
    options: PlaidLinkTokenRequest = {},
  ): Promise<PlaidLinkTokenResponse> {
    const products = options.products ?? ["transactions"];
    if (products.includes("balance")) {
      throw new AppError(
        'Do not include "balance" in Link products; call /accounts/balance/get after exchange',
        { code: "VALIDATION_ERROR", statusCode: 400 },
      );
    }

    const body: Record<string, unknown> = {
      user: {
        client_user_id: options.client_user_id ?? "default",
        ...(options.phone_number ? { phone_number: options.phone_number } : {}),
      },
      client_name: "Household Financial Intelligence",
      products,
      country_codes: options.country_codes ?? ["US"],
      language: options.language ?? "en",
    };

    if (products.includes("transactions")) {
      body.transactions = {
        days_requested: options.transactions_days_requested ?? 730,
      };
    }

    if (options.webhook) body.webhook = options.webhook;
    const redirectUri = options.redirect_uri ?? env.plaid.redirectUri();
    if (redirectUri) body.redirect_uri = redirectUri;
    if (options.account_filters) body.account_filters = options.account_filters;

    const payload = await plaidPost<Record<string, unknown>>(
      "/link/token/create",
      body,
    );

    const linkToken = payload.link_token;
    if (typeof linkToken !== "string") {
      throw new AppError("Invalid Plaid link token response", {
        code: "INTEGRATION_ERROR",
        statusCode: 502,
        details: payload,
      });
    }

    return {
      link_token: linkToken,
      expiration: String(payload.expiration ?? ""),
      request_id: String(payload.request_id ?? ""),
    };
  }

  /** Step 3 — Exchange public_token from Link onSuccess. */
  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeResult> {
    if (!publicToken.trim()) {
      throw new AppError("public_token is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const payload = await plaidPost<Record<string, unknown>>(
      "/item/public_token/exchange",
      { public_token: publicToken },
    );

    const accessToken = payload.access_token;
    const itemId = payload.item_id;
    if (typeof accessToken !== "string" || typeof itemId !== "string") {
      throw new AppError("Invalid Plaid exchange response", {
        code: "INTEGRATION_ERROR",
        statusCode: 502,
        details: payload,
      });
    }

    return {
      access_token: accessToken,
      item_id: itemId,
      request_id: String(payload.request_id ?? ""),
    };
  }

  /** Step 4 — /accounts/balance/get (no "balance" Link product required). */
  async getAccountBalances(accessToken: string): Promise<PlaidBalanceSnapshot> {
    if (!accessToken.trim()) {
      throw new AppError("access_token is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const payload = await plaidPost<Record<string, unknown>>(
      "/accounts/balance/get",
      { access_token: accessToken },
    );

    const snapshot = balanceGetResponseToSnapshot(payload);
    if (!snapshot.item_id) {
      throw new AppError("Plaid balance response missing item_id", {
        code: "INTEGRATION_ERROR",
        statusCode: 502,
        details: payload,
      });
    }

    return snapshot;
  }
}

export const plaidApiService = new PlaidApiService();
