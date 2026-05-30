import type { FinancialRiskReport } from "@/services/financial-state/risk";
import type { CashFlowRiskLevel } from "@/services/financial-state/state.types";

import {
  isProviderConfigured,
  llmComplete,
  resolveProvider,
} from "@/services/ai/llm/llm.service";
import {
  buildUserPrompt,
  FINANCIAL_ADVISOR_SYSTEM_PROMPT,
} from "./prompt";
import { serializeAdvisorPayload } from "./serialize";
import type {
  FinancialAdviceResponse,
  FinancialAdviceTone,
  GenerateFinancialAdviceInput,
} from "./types";

const VALID_TONES: FinancialAdviceTone[] = [
  "neutral",
  "supportive",
  "cautious",
  "urgent",
];

function defaultTone(riskLevel: CashFlowRiskLevel): FinancialAdviceTone {
  switch (riskLevel) {
    case "high":
      return "urgent";
    case "medium":
      return "cautious";
    case "low":
      return "supportive";
  }
}

function clampConfidence(value: unknown, fallback: number): number {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

function parseAdviceResponse(
  raw: unknown,
  risk: FinancialRiskReport,
): FinancialAdviceResponse {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const avgEventConfidence =
    risk.warning_events.length > 0
      ? 0.75
      : risk.risk_level === "low"
        ? 0.9
        : 0.8;

  const tone = VALID_TONES.includes(obj.tone as FinancialAdviceTone)
    ? (obj.tone as FinancialAdviceTone)
    : defaultTone(risk.risk_level);

  return {
    summary:
      typeof obj.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : risk.insights[0] ?? "Financial outlook based on provided simulation.",
    key_insights: asStringArray(obj.key_insights).length
      ? asStringArray(obj.key_insights)
      : [...risk.insights],
    warnings: asStringArray(obj.warnings).length
      ? asStringArray(obj.warnings)
      : risk.stress_months.map((m) => `Cash flow stress detected in ${m}`),
    recommendations: asStringArray(obj.recommendations),
    explanation:
      typeof obj.explanation === "string" && obj.explanation.trim()
        ? obj.explanation.trim()
        : risk.insights.join(" "),
    confidence: clampConfidence(obj.confidence, avgEventConfidence),
    tone,
    scenario_interpretation:
      typeof obj.scenario_interpretation === "string"
        ? obj.scenario_interpretation.trim() || undefined
        : undefined,
  };
}

/**
 * Deterministic fallback when LLM is unavailable (structure only; text from risk engine).
 */
export function buildDeterministicAdvice(
  input: GenerateFinancialAdviceInput,
): FinancialAdviceResponse {
  const { risk, user_query } = input;

  const recommendations: string[] = [];
  if (risk.risk_level === "high") {
    recommendations.push(
      "Review recurring expenses in stress months and defer non-essential spending.",
      "Build or replenish an emergency buffer using months with positive net cash flow.",
    );
  } else if (risk.risk_level === "medium") {
    recommendations.push(
      "Track variable expenses and align payment timing with stronger cash flow months.",
    );
  } else {
    recommendations.push(
      "Maintain current stability and allocate surplus to savings or planned goals.",
    );
  }

  return {
    summary: risk.insights[0] ?? "Your forecast has been analyzed.",
    key_insights: [...risk.insights],
    warnings:
      risk.stress_months.length > 0
        ? risk.stress_months.map(
            (m) => `Stress month: ${m} (negative or depleted cash flow in simulation).`,
          )
        : ["No stress months detected in the forecast horizon."],
    recommendations,
    explanation: [
      ...risk.insights,
      `Average monthly savings (simulated): ${risk.metrics.average_monthly_savings} CAD.`,
      `Worst month cash flow: ${risk.metrics.worst_month_cash_flow} CAD.`,
    ].join(" "),
    confidence: risk.risk_level === "low" ? 0.88 : 0.75,
    tone: defaultTone(risk.risk_level),
    scenario_interpretation: user_query
      ? `Scenario question noted: "${user_query}". Interpret using the provided timeline only; no new simulation was run.`
      : undefined,
  };
}

/**
 * AI Financial Advisor — natural language layer over deterministic engines.
 * Does NOT compute financial math; interprets state, timeline, and risk report only.
 */
export async function generateFinancialAdvice(
  input: GenerateFinancialAdviceInput,
  options?: { useLlm?: boolean; ai_provider?: GenerateFinancialAdviceInput["ai_provider"] },
): Promise<FinancialAdviceResponse> {
  const payload = serializeAdvisorPayload(
    input.state,
    input.timeline,
    input.risk,
    input.user_query,
  );

  const useLlm = options?.useLlm ?? true;
  const provider = resolveProvider(
    options?.ai_provider ?? input.ai_provider,
  );

  if (!useLlm || !isProviderConfigured(provider)) {
    return buildDeterministicAdvice(input);
  }

  try {
    const { text } = await llmComplete({
      system: FINANCIAL_ADVISOR_SYSTEM_PROMPT,
      user: buildUserPrompt(payload),
      maxTokens: 500,
      provider,
      caller: "financial-advisor",
    });

    const parsed = parseJsonFromLlm(text);
    return parseAdviceResponse(parsed, input.risk);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      error instanceof Error &&
      (message.includes("API_KEY") ||
        message.includes("not configured") ||
        message.includes("429") ||
        message.includes("rate limit") ||
        message.includes("LLM_REQUEST_FAILED") ||
        message.includes("Gemini API") ||
        error.name === "SyntaxError")
    ) {
      return buildDeterministicAdvice(input);
    }
    throw error;
  }
}
