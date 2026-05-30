import { randomUUID } from "node:crypto";

import { assertAutomationBearer } from "@/services/automation/webhook-auth";
import { automationRunService } from "@/services/automation/automation-run.service";
import { plaidDirectSyncService } from "@/services/integrations/plaid/plaid-direct-sync.service";
import { plaidItemService } from "@/services/integrations/plaid/plaid-item.service";
import { plaidMcpService } from "@/services/integrations/plaid/plaid-mcp.service";
import { financialStatePersistence } from "@/services/financial-state/financial-state.persistence";
import { env } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

interface PlaidSyncBody {
  user_id?: string;
  correlation_id?: string;
}

/** POST — sync balances (direct /accounts/balance/get if linked, else MCP) */
export async function POST(request: Request) {
  const correlationId = randomUUID();
  try {
    assertAutomationBearer(request);
    const body = (await request.json().catch(() => ({}))) as PlaidSyncBody;
    const userId = body.user_id ?? "default";
    const correlation = body.correlation_id ?? correlationId;

    await automationRunService.record({
      workflow: "plaid-sync",
      source: "api",
      status: "queued",
      correlationId: correlation,
      payload: { user_id: userId },
    });

    const linked = await plaidItemService.getAccessTokenForUser(userId);

    if (linked) {
      const result = await plaidDirectSyncService.syncBalancesForUser(
        userId,
        correlation,
        { scheduled: false, force: true, sync_source: "manual" },
      );

      await automationRunService.record({
        workflow: "plaid-sync",
        source: "api",
        status: result.skipped ? "skipped" : "success",
        correlationId: correlation,
        payload: { user_id: userId, item_id: result.item_id, mode: "direct" },
        result: result.skipped
          ? { skipped: true }
          : {
              current_cash: result.current_cash,
              account_count: result.account_count,
              history_rows: result.history.length,
            },
      });

      return jsonSuccess({ ...result, mode: "direct" });
    }

    if (!env.plaid.mcpBaseUrl()) {
      return jsonError({
        code: "INTEGRATION_NOT_CONFIGURED",
        message:
          "No Plaid item linked and PLAID_MCP_BASE_URL is not configured. Complete Link flow or set MCP URL.",
        statusCode: 503,
      });
    }

    const snapshot = await plaidMcpService.fetchBalances();
    const currentCash = plaidMcpService.summarizeCurrentCash(snapshot);

    const state = await financialStatePersistence.upsertStateScalars({
      user_id: userId,
      current_cash: currentCash,
    });

    await plaidMcpService.saveCursor({
      item_id: snapshot.item_id,
      cursor: snapshot.cursor,
      correlation_id: correlation,
      metadata: {
        request_id: snapshot.request_id,
        as_of: snapshot.as_of,
        account_count: snapshot.accounts.length,
      },
    });

    await automationRunService.record({
      workflow: "plaid-sync",
      source: "api",
      status: "success",
      correlationId: correlation,
      payload: { user_id: userId, item_id: snapshot.item_id, mode: "mcp" },
      result: {
        current_cash: state.current_cash,
        account_count: snapshot.accounts.length,
      },
    });

    return jsonSuccess({
      correlation_id: correlation,
      user_id: userId,
      item_id: snapshot.item_id,
      account_count: snapshot.accounts.length,
      current_cash: state.current_cash,
      as_of: snapshot.as_of,
      mode: "mcp",
    });
  } catch (error) {
    await automationRunService.record({
      workflow: "plaid-sync",
      source: "api",
      status: "failed",
      correlationId,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    return jsonError(toAppError(error));
  }
}
