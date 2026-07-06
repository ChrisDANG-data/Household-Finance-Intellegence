import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import {
  obligationService,
  type UpdateObligationInput,
} from "@/services/financial-state/obligation.service";

/** GET — single obligation */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuthenticatedHandler(async (userId) => {
    const { id } = await context.params;
    const obligation = await obligationService.getById(id, userId);
    return jsonSuccess({ obligation });
  });
}

/** PATCH — update obligation */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuthenticatedHandler(async (userId) => {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateObligationInput;
    const obligation = await obligationService.update(id, userId, body);
    return jsonSuccess({ obligation });
  });
}

/** DELETE — remove obligation */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuthenticatedHandler(async (userId) => {
    const { id } = await context.params;
    await obligationService.delete(id, userId);
    return jsonSuccess({ deleted: true });
  });
}
