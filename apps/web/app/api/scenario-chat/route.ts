import { assertMatchingUserId, resolveRequestUserId } from "@/lib/auth/request-user";
import { handleScenarioMessage } from "@/services/scenario-chat";
import { financialStateEngine } from "@/services/financial-state";
import { financialStatePersistence } from "@/services/financial-state/financial-state.persistence";
import type { RawFinancialEvent } from "@/types/financial-state";
import type { FinancialState } from "@/services/financial-state/state.types";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

import { createScenarioChatStream } from "./stream";
import { serializeScenarioChatResponse } from "./serialize";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ScenarioChatBody {
  message: string;
  user_id?: string;
  current_cash?: number;
  monthly_income?: number;
  events?: RawFinancialEvent[];
  months?: number;
  forecast_start_month?: string;
  use_llm?: boolean;
  stream?: boolean;
  ai_provider?: "claude" | "gemini";
  analyst_mode?: "auto" | "cost" | "investment" | "payments";
  langgraph_enabled?: boolean;
}

async function resolveFinancialState(
  userId: string,
  body: ScenarioChatBody,
): Promise<FinancialState> {
  const events = body.events ?? [];

  if (events.length > 0) {
    return financialStateEngine.createState({
      user_id: userId,
      current_cash: body.current_cash ?? 0,
      monthly_income: body.monthly_income,
      events,
      referenceMonth: body.forecast_start_month,
    });
  }

  const persisted = await financialStatePersistence.loadState(
    userId,
    body.forecast_start_month,
  );

  if (persisted.events.length > 0 || persisted.current_cash > 0) {
    return persisted;
  }

  return financialStateEngine.createState({
    user_id: userId,
    current_cash: body.current_cash ?? 0,
    monthly_income: body.monthly_income,
    events,
    referenceMonth: body.forecast_start_month,
  });
}

async function runScenarioChat(userId: string, body: ScenarioChatBody) {
  const financial_state = await resolveFinancialState(userId, body);

  return handleScenarioMessage({
    message: body.message,
    user_id: userId,
    financial_state,
    months: body.months,
    forecast_start_month: body.forecast_start_month,
    use_llm: body.use_llm,
    ai_provider: body.ai_provider,
    analyst_mode: body.analyst_mode,
    langgraph_enabled: body.langgraph_enabled,
  });
}

/** POST — Scenario chat: NL → engines → AI advisor (JSON or SSE stream) */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScenarioChatBody;

    if (!body?.message?.trim()) {
      throw new AppError("message is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const userId = await resolveRequestUserId();
    assertMatchingUserId(userId, body.user_id);

    if (body.events !== undefined && !Array.isArray(body.events)) {
      throw new AppError("events must be an array", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const wantsStream =
      body.stream === true ||
      request.headers.get("accept")?.includes("text/event-stream");

    const response = await runScenarioChat(userId, body);

    if (wantsStream) {
      const stream = createScenarioChatStream(response);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    return jsonSuccess(serializeScenarioChatResponse(response));
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
