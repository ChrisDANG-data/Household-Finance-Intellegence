import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import {
  obligationService,
  type CreateObligationInput,
} from "@/services/financial-state/obligation.service";
import { currentUtcMonth } from "@/services/financial-state/dates";

/** GET — list obligations and monthly summary */
export async function GET(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? currentUtcMonth();

    const [obligations, summary] = await Promise.all([
      obligationService.list(userId),
      obligationService.getMonthlySummary(userId, month),
    ]);

    return jsonSuccess({ obligations, summary });
  });
}

/** POST — create obligation */
export async function POST(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const body = (await request.json()) as CreateObligationInput;
    const obligation = await obligationService.create(userId, body);
    return jsonSuccess({ obligation }, { status: 201 });
  });
}
