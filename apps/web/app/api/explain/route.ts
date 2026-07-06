import { assertMatchingUserId, resolveRequestUserId } from "@/lib/auth/request-user";
import { generateFinancialAdvice } from "@/services/ai/advisor";
import { financialStateEngine } from "@/services/financial-state";
import type { RawFinancialEvent } from "@/types/financial-state";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

interface ExplainBody {
  user_id?: string;
  current_cash: number;
  monthly_income?: number;
  events: RawFinancialEvent[];
  months?: number;
  start_month?: string;
  user_query?: string;
  /** Set false to force deterministic text (no LLM call) */
  use_llm?: boolean;
  ai_provider?: "claude" | "gemini";
}

/** POST — AI Financial Advisor: explain deterministic engine outputs */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExplainBody;
    const userId = await resolveRequestUserId();
    assertMatchingUserId(userId, body?.user_id);

    if (typeof body.current_cash !== "number") {
      throw new AppError("current_cash is required", {
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

    const { state, timeline, risk } = financialStateEngine.buildSnapshot(
      {
        user_id: userId,
        current_cash: body.current_cash,
        monthly_income: body.monthly_income,
        events: body.events,
        referenceMonth: body.start_month,
      },
      { months: body.months ?? 12, startMonth: body.start_month },
    );

    const advice = await generateFinancialAdvice(
      {
        state,
        timeline,
        risk,
        user_query: body.user_query ?? "",
      },
      {
        useLlm: body.use_llm !== false,
        ai_provider: body.ai_provider,
      },
    );

    return jsonSuccess({
      state,
      timeline,
      risk,
      advice,
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
