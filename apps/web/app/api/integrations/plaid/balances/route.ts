import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { plaidDirectSyncService } from "@/services/integrations/plaid/plaid-direct-sync.service";

interface BalancesBody {
  correlation_id?: string;
  /** When true, sync even if this month already has a scheduled snapshot */
  force?: boolean;
  /** Monthly automation — skips if current UTC month already recorded */
  scheduled?: boolean;
}

/** POST — /accounts/balance/get, persist history, update current_cash (checking accounts only) */
export async function POST(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const body = (await request.json().catch(() => ({}))) as BalancesBody;
    const result = await plaidDirectSyncService.syncBalancesForUser(
      userId,
      body.correlation_id,
      {
        force: body.force,
        scheduled: body.scheduled,
        sync_source: body.scheduled ? "scheduled" : "manual",
      },
    );
    return jsonSuccess(result);
  });
}
