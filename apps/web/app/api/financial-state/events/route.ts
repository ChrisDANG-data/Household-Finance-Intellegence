import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { serializeFinancialEvent } from "@/lib/serializers/financial-state";
import {
  financialStatePersistence,
  type CreateFinancialEventInput,
} from "@/services/financial-state/financial-state.persistence";

/** GET — list canonical FinancialEvent rows for the signed-in user */
export async function GET() {
  return withAuthenticatedHandler(async (userId) => {
    const events = await financialStatePersistence.listEvents(userId);
    return jsonSuccess({
      user_id: userId,
      events: events.map(serializeFinancialEvent),
    });
  });
}

/** POST — create canonical FinancialEvent */
export async function POST(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const body = (await request.json()) as CreateFinancialEventInput;
    const event = await financialStatePersistence.createEvent({
      ...body,
      user_id: userId,
    });
    return jsonSuccess({ event: serializeFinancialEvent(event) }, { status: 201 });
  });
}
