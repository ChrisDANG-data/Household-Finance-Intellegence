import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { obligationService } from "@/services/financial-state/obligation.service";
import { currentUtcMonth } from "@/services/financial-state/dates";

/** GET — household obligations ledger (MVP) */
export async function GET(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? currentUtcMonth();

    const [obligations, summary] = await Promise.all([
      obligationService.list(userId),
      obligationService.getMonthlySummary(userId, month),
    ]);

    return jsonSuccess({
      household_id: userId,
      obligations,
      summary,
    });
  });
}
