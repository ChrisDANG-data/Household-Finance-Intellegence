import { randomUUID } from "node:crypto";

import {
  DEFAULT_USER_ID,
  financialStatePersistence,
} from "@/services/financial-state/financial-state.persistence";
import { AppError } from "@/utils/errors";

import { plaidApiService } from "./plaid-api.service";
import {
  sumAvailableBalances,
  type PlaidBalanceSnapshot,
} from "./plaid-balance.types";
import {
  plaidBalanceHistoryService,
  type PlaidSyncSource,
  type RecordedBalanceRow,
} from "./plaid-balance-history.service";
import { plaidItemService } from "./plaid-item.service";

async function saveBalanceCursor(input: {
  item_id: string;
  correlation_id: string;
  metadata?: unknown;
}): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO plaid_sync_cursors
       (id, item_id, cursor, last_run_at, last_correlation, metadata, created_at, updated_at)
       VALUES ($1, $2, NULL, NOW(), $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (item_id)
       DO UPDATE SET
         last_run_at = NOW(),
         last_correlation = EXCLUDED.last_correlation,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      randomUUID(),
      input.item_id,
      input.correlation_id,
      JSON.stringify(input.metadata ?? {}),
    );
  } catch {
    // Non-fatal if cursor table unavailable
  }
}

export interface PlaidSyncOptions {
  force?: boolean;
  scheduled?: boolean;
  sync_source?: PlaidSyncSource;
}

export class PlaidDirectSyncService {
  summarizeCurrentCash(snapshot: PlaidBalanceSnapshot): number {
    return Number(sumAvailableBalances(snapshot.accounts).toFixed(2));
  }

  async syncBalancesForUser(
    userId: string = DEFAULT_USER_ID,
    correlationId?: string,
    options: PlaidSyncOptions = {},
  ): Promise<{
    correlation_id: string;
    user_id: string;
    item_id: string;
    account_count: number;
    current_cash: number;
    as_of: string;
    skipped: boolean;
    history: RecordedBalanceRow[];
  }> {
    if (!plaidApiService.isConfigured()) {
      throw new AppError("PLAID_CLIENT_ID and PLAID_SECRET are required", {
        code: "INTEGRATION_NOT_CONFIGURED",
        statusCode: 503,
      });
    }

    const syncSource = options.sync_source ?? (options.scheduled ? "scheduled" : "manual");

    if (options.scheduled && !options.force) {
      const already = await plaidBalanceHistoryService.hasSnapshotForMonth(userId);
      if (already) {
        return {
          correlation_id: correlationId ?? randomUUID(),
          user_id: userId,
          item_id: "",
          account_count: 0,
          current_cash: 0,
          as_of: new Date().toISOString(),
          skipped: true,
          history: [],
        };
      }
    }

    const { item_id, access_token } =
      await plaidItemService.requireAccessToken(userId);
    const correlation = correlationId ?? randomUUID();

    const snapshot = await plaidApiService.getAccountBalances(access_token);
    const currentCash = this.summarizeCurrentCash(snapshot);

    const state = await financialStatePersistence.upsertStateScalars({
      user_id: userId,
      current_cash: currentCash,
    });

    const history = await plaidBalanceHistoryService.recordFromSnapshot({
      user_id: userId,
      item_id: snapshot.item_id || item_id,
      snapshot,
      sync_source: syncSource,
      correlation_id: correlation,
    });

    await saveBalanceCursor({
      item_id: snapshot.item_id || item_id,
      correlation_id: correlation,
      metadata: {
        source: "accounts/balance/get",
        request_id: snapshot.request_id,
        as_of: snapshot.as_of,
        account_count: snapshot.accounts.length,
        history_rows: history.length,
      },
    });

    return {
      correlation_id: correlation,
      user_id: userId,
      item_id: snapshot.item_id || item_id,
      account_count: snapshot.accounts.length,
      current_cash: state.current_cash,
      as_of: snapshot.as_of,
      skipped: false,
      history,
    };
  }
}

export const plaidDirectSyncService = new PlaidDirectSyncService();
