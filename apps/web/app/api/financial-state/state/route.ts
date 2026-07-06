import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { jsonSuccess } from "@/utils/api-response";
import { AppError } from "@/utils/errors";
import {
  serializeFinancialState,
  serializeTimeline,
} from "@/lib/serializers/financial-state";
import {
  financialStatePersistence,
  type UpsertFinancialStateInput,
} from "@/services/financial-state/financial-state.persistence";

/** GET — load FinancialState (computed fields derived, not stored) + optional timeline */
export async function GET(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const { searchParams } = new URL(request.url);
    const months = Number(searchParams.get("months") ?? "0");
    const includeTimeline = searchParams.get("timeline") === "true" || months > 0;

    const state = await financialStatePersistence.loadState(userId);
    const payload: Record<string, unknown> = {
      state: serializeFinancialState(state),
    };

    if (includeTimeline) {
      const timeline = await financialStatePersistence.buildTimeline(
        userId,
        months > 0 ? months : 12,
        searchParams.get("start_month") ?? undefined,
      );
      payload.timeline = serializeTimeline(timeline);
    }

    return jsonSuccess(payload);
  });
}

/** PUT — upsert FinancialState scalars (current_cash, monthly_income) */
export async function PUT(request: Request) {
  return withAuthenticatedHandler(async (userId) => {
    const body = (await request.json()) as UpsertFinancialStateInput;
    if (typeof body.current_cash !== "number") {
      throw new AppError("current_cash is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }
    const state = await financialStatePersistence.upsertStateScalars({
      ...body,
      user_id: userId,
    });
    return jsonSuccess({ state: serializeFinancialState(state) });
  });
}
