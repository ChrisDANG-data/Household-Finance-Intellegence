import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

import {
  mcpResponseToSnapshot,
  sumAvailableBalances,
  type PlaidBalanceSnapshot,
} from "./plaid-balance.types";

export type { PlaidAccountBalance, PlaidBalanceSnapshot } from "./plaid-balance.types";

export class PlaidMcpService {
  async fetchBalances(): Promise<PlaidBalanceSnapshot> {
    const baseUrl = env.plaid.mcpBaseUrl();
    if (!baseUrl) {
      throw new AppError("PLAID_MCP_BASE_URL is not configured", {
        code: "INTEGRATION_NOT_CONFIGURED",
        statusCode: 503,
      });
    }

    const token = env.plaid.mcpToken();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/balances`, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new AppError(`Plaid MCP request failed (${response.status})`, {
        code: "INTEGRATION_ERROR",
        statusCode: 502,
      });
    }

    try {
      return mcpResponseToSnapshot(await response.json());
    } catch {
      throw new AppError("Invalid Plaid MCP response", {
        code: "INTEGRATION_ERROR",
        statusCode: 502,
      });
    }
  }

  async saveCursor(input: {
    item_id: string;
    cursor?: string;
    correlation_id: string;
    metadata?: unknown;
  }): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO plaid_sync_cursors
         (id, item_id, cursor, last_run_at, last_correlation, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), $4, $5::jsonb, NOW(), NOW())
         ON CONFLICT (item_id)
         DO UPDATE SET
           cursor = EXCLUDED.cursor,
           last_run_at = NOW(),
           last_correlation = EXCLUDED.last_correlation,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        randomUUID(),
        input.item_id,
        input.cursor ?? null,
        input.correlation_id,
        JSON.stringify(input.metadata ?? {}),
      );
    } catch {
      // Cursor persistence requires migration; sync can still proceed safely without it.
    }
  }

  summarizeCurrentCash(snapshot: PlaidBalanceSnapshot): number {
    return Number(sumAvailableBalances(snapshot.accounts).toFixed(2));
  }
}

export const plaidMcpService = new PlaidMcpService();
