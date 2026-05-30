import { plaidBalanceHistoryService } from "@/services/integrations/plaid/plaid-balance-history.service";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";
import { jsonSuccess } from "@/utils/api-response";

/** GET — balance history for charts and table (separate from forecast) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id") ?? DEFAULT_USER_ID;
  const limit = Math.min(
    200,
    Math.max(1, Number(searchParams.get("limit") ?? "50") || 50),
  );

  const [series, recent] = await Promise.all([
    plaidBalanceHistoryService.getChartSeries(userId),
    plaidBalanceHistoryService.listRecent(userId, limit),
  ]);

  return jsonSuccess({ series, recent });
}
