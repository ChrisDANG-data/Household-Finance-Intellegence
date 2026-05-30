import type { LlmCompleteRequest, LlmCompleteResponse } from "./types";
import {
  appendLlmCallLog,
  buildTokenUsage,
  createLogId,
  estimateCostUsd,
  type LlmCallLogEntry,
} from "./llm-call-logger";

export async function logLlmCallSuccess(
  request: LlmCompleteRequest,
  response: LlmCompleteResponse,
  startedAt: Date,
  provider: LlmCompleteResponse["provider"],
): Promise<void> {
  const endedAt = new Date();
  const usage = buildTokenUsage(
    request.system,
    request.user,
    response.text,
    response.usage,
  );
  const { usd, note } = estimateCostUsd(provider, usage);

  const entry: LlmCallLogEntry = {
    id: createLogId(),
    provider,
    model: response.model,
    caller: request.caller ?? null,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    status: "success",
    input: { system: request.system, user: request.user },
    response: response.text,
    error: null,
    usage,
    estimated_cost_usd: usd,
    cost_note: note,
  };

  await appendLlmCallLog(entry);
}

export async function logLlmCallFailure(
  request: LlmCompleteRequest,
  startedAt: Date,
  provider: LlmCompleteResponse["provider"] | "claude" | "gemini",
  error: unknown,
  model?: string,
): Promise<void> {
  const endedAt = new Date();
  const usage = buildTokenUsage(request.system, request.user, null);
  const { usd, note } = estimateCostUsd(
    provider === "claude" || provider === "gemini" ? provider : "claude",
    usage,
  );

  const entry: LlmCallLogEntry = {
    id: createLogId(),
    provider: provider === "claude" || provider === "gemini" ? provider : "claude",
    model: model ?? request.model ?? "unknown",
    caller: request.caller ?? null,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt.getTime() - startedAt.getTime(),
    status: "fail",
    input: { system: request.system, user: request.user },
    response: null,
    error: error instanceof Error ? error.message : String(error),
    usage,
    estimated_cost_usd: usd,
    cost_note: `${note} (request failed; output tokens = 0)`,
  };

  await appendLlmCallLog(entry);
}
