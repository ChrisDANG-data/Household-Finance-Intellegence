import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AiProvider, LlmTokenUsage } from "./types";

/** ~4 characters per token (English prose heuristic). */
const CHARS_PER_TOKEN = 4;

export type LlmCallStatus = "success" | "fail";

export interface LlmCallLogEntry {
  id: string;
  provider: AiProvider;
  model: string;
  caller: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: LlmCallStatus;
  input: {
    system: string;
    user: string;
  };
  response: string | null;
  error: string | null;
  usage: LlmTokenUsage | null;
  estimated_cost_usd: number;
  cost_note: string;
}

function isLoggingEnabled(): boolean {
  const flag = process.env.LLM_LOG_ENABLED?.toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function resolveLogFilePath(): string {
  const configured = process.env.LLM_LOG_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "logs", "llm-calls.jsonl");
}

function maxLogChars(): number {
  const n = Number(process.env.LLM_LOG_MAX_CHARS ?? "32000");
  return Number.isFinite(n) && n > 0 ? n : 32000;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function buildTokenUsage(
  system: string,
  user: string,
  responseText: string | null,
  apiUsage?: LlmTokenUsage,
): LlmTokenUsage {
  if (apiUsage && !apiUsage.estimated) {
    return apiUsage;
  }
  const input_tokens =
    apiUsage?.input_tokens ??
    estimateTokensFromText(system) + estimateTokensFromText(user);
  const output_tokens =
    apiUsage?.output_tokens ?? estimateTokensFromText(responseText ?? "");
  return {
    input_tokens,
    output_tokens,
    estimated: apiUsage?.estimated ?? true,
  };
}

function claudeRatesPerMillion(): { input: number; output: number } {
  return {
    input: Number(process.env.CLAUDE_INPUT_USD_PER_MTOK ?? "3"),
    output: Number(process.env.CLAUDE_OUTPUT_USD_PER_MTOK ?? "15"),
  };
}

export function estimateCostUsd(
  provider: AiProvider,
  usage: LlmTokenUsage,
): { usd: number; note: string } {
  if (provider === "gemini") {
    return {
      usd: 0,
      note:
        "Gemini: $0.00 USD (free tier; no charge applied in this app)",
    };
  }

  const { input, output } = claudeRatesPerMillion();
  const usd =
    (usage.input_tokens / 1_000_000) * input +
    (usage.output_tokens / 1_000_000) * output;
  const estLabel = usage.estimated ? "est." : "actual";
  return {
    usd: Math.round(usd * 1_000_000) / 1_000_000,
    note: `Claude (${estLabel}): ${usage.input_tokens} in + ${usage.output_tokens} out tokens @ $${input}/M in, $${output}/M out`,
  };
}

export async function appendLlmCallLog(entry: LlmCallLogEntry): Promise<void> {
  if (!isLoggingEnabled()) return;

  const logPath = resolveLogFilePath();
  const max = maxLogChars();

  const record: LlmCallLogEntry = {
    ...entry,
    input: {
      system: truncate(entry.input.system, max),
      user: truncate(entry.input.user, max),
    },
    response: entry.response ? truncate(entry.response, max) : null,
  };

  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    console.error(
      "[llm-call-logger] Failed to write log:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function createLogId(): string {
  return `llm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
