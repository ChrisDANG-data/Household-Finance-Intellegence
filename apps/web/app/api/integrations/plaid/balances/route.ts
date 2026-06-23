import { plaidDirectSyncService } from "@/services/integrations/plaid/plaid-direct-sync.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { toAppError } from "@/utils/errors";

interface BalancesBody {
  user_id?: string;
  correlation_id?: string;
  /** When true, sync even if this month already has a scheduled snapshot */
  force?: boolean;
  /** Monthly automation — skips if current UTC month already recorded */
  scheduled?: boolean;
}

/** POST — /accounts/balance/get, persist history, update current_cash (checking accounts only) */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as BalancesBody;
    const result = await plaidDirectSyncService.syncBalancesForUser(
      body.user_id,
      body.correlation_id,
      {
        force: body.force,
        scheduled: body.scheduled,
        sync_source: body.scheduled ? "scheduled" : "manual",
      },
    );
    return jsonSuccess(result);
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
