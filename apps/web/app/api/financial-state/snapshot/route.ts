import { assertMatchingUserId, resolveRequestUserId } from "@/lib/auth/request-user";
import {
  serializeFinancialState,
  serializeTimeline,
} from "@/lib/serializers/financial-state";
import { financialStateEngine } from "@/services/financial-state";
import { financialStatePersistence } from "@/services/financial-state/financial-state.persistence";
import type { RawFinancialEvent } from "@/types/financial-state";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

interface SnapshotBody {
  user_id?: string;
  current_cash?: number;
  monthly_income?: number;
  events?: RawFinancialEvent[];
  months?: number;
  /** When true, load events from DB; optional body overrides cash/income scalars */
  use_persisted?: boolean;
}

/** POST — Financial State: deterministic snapshot (in-memory or persisted events) */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SnapshotBody;
    const userId = await resolveRequestUserId();
    assertMatchingUserId(userId, body?.user_id);
    const months = body.months ?? 12;

    if (body.use_persisted) {
      const persisted = await financialStatePersistence.loadState(userId);
      const state = financialStateEngine.withComputed({
        user_id: userId,
        current_cash: body.current_cash ?? persisted.current_cash,
        monthly_income: body.monthly_income ?? persisted.monthly_income,
        events: persisted.events,
      });
      const timeline = financialStateEngine.simulateForecast(state, { months });
      const risk = financialStateEngine.analyzeRisk(state, timeline);
      return jsonSuccess({
        state: serializeFinancialState(state),
        timeline: serializeTimeline(timeline),
        risk,
      });
    }

    if (typeof body.current_cash !== "number") {
      throw new AppError("current_cash is required unless use_persisted is true", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    if (!Array.isArray(body.events)) {
      throw new AppError("events must be an array", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const snapshot = financialStateEngine.buildSnapshot(
      {
        user_id: userId,
        current_cash: body.current_cash,
        monthly_income: body.monthly_income,
        events: body.events,
      },
      { months },
    );

    return jsonSuccess(snapshot);
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
