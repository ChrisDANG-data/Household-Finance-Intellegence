import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { plaidBalanceHistoryService } from "@/services/integrations/plaid/plaid-balance-history.service";

/** GET — Plaid balance history chart series + recent snapshots */
export async function GET(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "30");

    const [series, recent] = await Promise.all([
      plaidBalanceHistoryService.getChartSeries(userId),
      plaidBalanceHistoryService.listRecent(userId, limit),
    ]);

    return jsonSuccess({ series, recent });
  });
}
