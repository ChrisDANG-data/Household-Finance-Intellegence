import { randomUUID } from "node:crypto";

import { assertAutomationBearer } from "@/services/automation/webhook-auth";
import { automationRunService } from "@/services/automation/automation-run.service";
import { plaidDirectSyncService } from "@/services/integrations/plaid/plaid-direct-sync.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

interface ScheduledSyncBody {
  user_id?: string;
  force?: boolean;
}

/** POST — last UTC day of month: /accounts/balance/get, persist history, update current_cash (checking only) */
export async function POST(request: Request) {
  const correlationId = randomUUID();
  try {
    assertAutomationBearer(request);
    const body = (await request.json().catch(() => ({}))) as ScheduledSyncBody;
    const userId = body.user_id ?? "default";

    await automationRunService.record({
      workflow: "plaid-monthly-balance",
      source: "scheduler",
      status: "queued",
      correlationId,
      payload: { user_id: userId },
    });

    const result = await plaidDirectSyncService.syncBalancesForUser(
      userId,
      correlationId,
      { scheduled: true, force: body.force, sync_source: "scheduled" },
    );

    const status = result.skipped ? "skipped" : "success";
    await automationRunService.record({
      workflow: "plaid-monthly-balance",
      source: "scheduler",
      status,
      correlationId,
      payload: { user_id: userId },
      result: result.skipped
        ? { skipped: true, reason: result.skip_reason ?? "skipped" }
        : {
            account_count: result.account_count,
            checking_account_count: result.checking_account_count,
            current_cash: result.current_cash,
            history_rows: result.history.length,
          },
    });

    return jsonSuccess({ ...result, mode: "scheduled" });
  } catch (error) {
    await automationRunService.record({
      workflow: "plaid-monthly-balance",
      source: "scheduler",
      status: "failed",
      correlationId,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    return jsonError(toAppError(error));
  }
}
