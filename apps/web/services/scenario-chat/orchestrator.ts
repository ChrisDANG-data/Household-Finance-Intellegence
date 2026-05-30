import { generateFinancialAdvice } from "@/services/ai/advisor";
import { llmComplete } from "@/services/ai/llm/llm.service";
import type { AiProvider } from "@/services/ai/llm/types";
import { documentRagService } from "@/services/document-intelligence/indexing/rag.service";
import { prisma } from "@/lib/prisma";
import { orchestrateWithLangGraph } from "@/services/langgraph/orchestrator-client";
import { currentUtcMonth } from "@/services/financial-state/dates";
import { computeRiskSignals } from "@/services/financial-state/risk";
import { simulateForecast } from "@/services/financial-state/projection";
import type { FinancialState } from "@/services/financial-state/state.types";

import { parseScenarioMessage } from "./intent-parser";
import { tryCategoryPaymentAnswer } from "./category-lookup";
import { tryDeterministicMonthAnswer } from "./monthly-lookup";
import { tryPartnerLedgerAnswer } from "./partner-ledger-lookup";
import { applyScenarioToState } from "./scenario-builder";
import type {
  HandleScenarioMessageInput,
  ScenarioChatResponse,
  ScenarioIntent,
  ScenarioParameters,
} from "./types";

const FORECAST_MONTHS_DEFAULT = 12;

function buildInterpretation(
  intent: ScenarioIntent,
  hasScenario: boolean,
  params: ScenarioParameters,
): string {
  switch (intent) {
    case "affordability_check":
      return params.amount
        ? `Affordability check: one-time expense of ${params.amount} CAD${
            params.target_month ? ` in ${params.target_month}` : ""
          } was simulated against your forecast.`
        : "Affordability check requested; add an amount for a precise simulation.";
    case "what_if_simulation":
      return hasScenario
        ? "What-if scenario applied to your financial model; forecast and risk were recomputed."
        : "What-if question received; baseline forecast used (no parameter changes detected).";
    case "explanation_request":
      return "Explanation based on existing forecast and risk analysis (no re-simulation required).";
    case "general_finance_question":
    default:
      return hasScenario
        ? "General financial question with scenario adjustments applied."
        : "General financial overview from your current forecast and risk profile.";
  }
}

function runEngines(
  state: FinancialState,
  months: number,
  startMonth?: string,
) {
  const start = startMonth ?? currentUtcMonth();
  const timeline = simulateForecast(state, months, start);
  const risk = computeRiskSignals(timeline, {
    current_cash: state.current_cash,
    fixed_cost_ratio: state.computed.fixed_cost_ratio,
  });
  return { timeline, risk };
}

interface DocumentAnswer {
  answer: string;
  hasDocumentContext: boolean;
}

/**
 * Query FinancialEvent and FinancialObligation tables for all financial data.
 * Deduplicates obligations that already have a corresponding event.
 */
async function getFinancialContext(): Promise<string> {
  try {
    const [events, obligations] = await Promise.all([
      prisma.financialEvent.findMany({ orderBy: { startDate: "asc" } }),
      prisma.financialObligation.findMany({ orderBy: { startDate: "asc" } }),
    ]);

    if (events.length === 0 && obligations.length === 0) return "";

    const parts: string[] = [];

    if (events.length > 0) {
      const eventLines = events.map((e) => {
        const amt = Number(e.amount);
        const ownerLabel =
          e.owner === "partner_a"
            ? "Partner A"
            : e.owner === "partner_b"
              ? "Partner B"
              : "Joint";
        return `- [${e.type}] ${e.category} | owner: ${ownerLabel} | $${amt.toFixed(2)} ${e.currency} | ${e.frequency} | ${e.startDate.toISOString().slice(0, 10)} to ${e.endDate?.toISOString().slice(0, 10) ?? "ongoing"}`;
      });
      parts.push(`FINANCIAL EVENTS (authoritative - used for forecasts):\n${eventLines.join("\n")}`);
    }

    if (obligations.length > 0) {
      const eventCategories = new Set(
        events.map((e) => e.category.toLowerCase().replace(/[_\s-]/g, "")),
      );
      const eventSourceDocIds = new Set(
        events.filter((e) => e.sourceDocumentId).map((e) => e.sourceDocumentId),
      );

      const uniqueObligations = obligations.filter((ob) => {
        if (ob.sourceDocumentId && eventSourceDocIds.has(ob.sourceDocumentId)) {
          return false;
        }
        const obCat = ob.category.toLowerCase().replace(/[_\s-]/g, "");
        const obName = ob.name.toLowerCase().replace(/[_\s-]/g, "");
        for (const evCat of eventCategories) {
          if (
            obCat.includes(evCat) || evCat.includes(obCat) ||
            obName.includes(evCat) || evCat.includes(obName)
          ) {
            return false;
          }
        }
        return true;
      });

      if (uniqueObligations.length > 0) {
        const obLines = uniqueObligations.map((ob) => {
          const amt = Number(ob.amount);
          return `- ${ob.name} | ${ob.category} | $${amt.toFixed(2)} ${ob.currency} | ${ob.frequency} | ${ob.startDate.toISOString().slice(0, 10)} to ${ob.endDate?.toISOString().slice(0, 10) ?? "ongoing"}`;
        });
        parts.push(`FINANCIAL OBLIGATIONS (additional, from documents):\n${obLines.join("\n")}`);
      }
    }

    return "\n\n" + parts.join("\n\n");
  } catch {
    return "";
  }
}

/**
 * Attempt RAG + DB lookup: retrieve relevant document chunks and obligation data.
 * Returns the answer if relevant info found, otherwise null.
 */
async function tryDocumentAnswer(
  message: string,
  provider?: AiProvider,
): Promise<DocumentAnswer | null> {
  try {
    const partnerAnswer = await tryPartnerLedgerAnswer(message);
    if (partnerAnswer) {
      return { answer: partnerAnswer, hasDocumentContext: true };
    }

    const categoryAnswer = await tryCategoryPaymentAnswer(message);
    if (categoryAnswer) {
      return { answer: categoryAnswer, hasDocumentContext: true };
    }

    const deterministic = await tryDeterministicMonthAnswer(message);
    if (deterministic) {
      return { answer: deterministic, hasDocumentContext: true };
    }

    const [ragResult, financialContext] = await Promise.all([
      documentRagService.retrieve({ query: message, topK: 5 }),
      getFinancialContext(),
    ]);

    const relevant = ragResult.chunks.filter((c) => c.score > 0.2);

    if (relevant.length === 0 && !financialContext) return null;

    // If we have financial data from DB, build context and ask the selected LLM
    if (financialContext) {
      const docContext = relevant.length > 0
        ? relevant.map((c, i) => `[Doc ${i + 1}]\n${c.content}`).join("\n\n")
        : "";

      try {
        const { text } = await llmComplete({
          provider,
          maxTokens: 200,
          temperature: 0,
          caller: "scenario-chat-document",
          system: `You are a concise financial assistant. Answer from the provided data.

DATE FILTERING (strict):
- An event is active in month YYYY-MM ONLY if start_date <= last day of that month AND (end_date is null OR end_date >= first day of that month)
- Example: start_date 2026-06-26 is NOT active in May 2026. start_date 2026-05-26 IS active in May 2026.
- Only include events that pass the date filter in totals

DATA RULES:
- FINANCIAL EVENTS are the authoritative source
- Do NOT double-count obligations already in FINANCIAL EVENTS
- Use the monthly amount directly (already converted)

OUTPUT FORMAT:
- Start with a one-line summary: "Total [type] in [period]: $X,XXX.XX"
- Then list each item as a bullet, padding category names with spaces to exactly 25 characters, then the dollar amount right-aligned:
  • car_lease                $647.72
  • electricity              $150.00
  • grocery                $1,000.00
- All dollar signs MUST start at the same column position (column 28)
- Do NOT add disclaimers or explanations
- Keep response concise`,
          user: `${financialContext}${docContext ? `\n\nDocument excerpts:\n${docContext}` : ""}\n\nQuestion: ${message}`,
        });

        return { answer: text.trim() || "Not found.", hasDocumentContext: true };
      } catch (err) {
        const fallback = await tryCategoryPaymentAnswer(message);
        if (fallback) {
          return { answer: fallback, hasDocumentContext: true };
        }
        const msg =
          err instanceof Error ? err.message : "AI request failed";
        if (msg.includes("429") || msg.includes("rate limit")) {
          return {
            answer:
              "Gemini rate limit reached. Switch to Claude in the header, or wait a minute and try again.",
            hasDocumentContext: true,
          };
        }
        return null;
      }
    }

    // Only document chunks, no DB obligations
    const ragAnswer = await documentRagService.ask(message, {
      topK: 5,
      provider,
    });

    if (ragAnswer.answer.toLowerCase().includes("not found")) {
      return null;
    }

    return { answer: ragAnswer.answer, hasDocumentContext: true };
  } catch {
    return null;
  }
}

/**
 * Orchestrates intent parsing, deterministic engines, RAG retrieval,
 * and AI advisor explanations.
 */
export async function handleScenarioMessage(
  input: HandleScenarioMessageInput,
): Promise<ScenarioChatResponse> {
  const langGraphResult = await orchestrateWithLangGraph({
    message: input.message,
    user_id: input.user_id,
    financial_state: input.financial_state,
    months: input.months,
    forecast_start_month: input.forecast_start_month,
    ai_provider: input.ai_provider,
  });
  if (langGraphResult) {
    const baseline = runEngines(
      input.financial_state,
      input.months ?? FORECAST_MONTHS_DEFAULT,
      input.forecast_start_month,
    );
    return {
      intent: langGraphResult.intent,
      interpretation: "Answer generated by LangGraph orchestration over read-only snapshots.",
      financial_summary: langGraphResult.answer,
      risk_level: baseline.risk.risk_level,
      explanation: langGraphResult.answer,
      recommendation: langGraphResult.recommendation,
      structured_data: {
        timeline: baseline.timeline,
        risk: baseline.risk,
      },
    };
  }

  const parsed = parseScenarioMessage(input.message);
  const months = input.months ?? FORECAST_MONTHS_DEFAULT;
  const startMonth = input.forecast_start_month;

  const baseline = runEngines(input.financial_state, months, startMonth);

  // Try to answer from uploaded documents first
  const docAnswer = await tryDocumentAnswer(input.message, input.ai_provider);

  if (docAnswer?.hasDocumentContext) {
    const { risk } = baseline;
    return {
      intent: parsed.intent,
      interpretation: "Answer based on your ledger and documents.",
      financial_summary: "From your household ledger:",
      risk_level: risk.risk_level,
      explanation: docAnswer.answer,
      recommendation: "",
      structured_data: {
        timeline: baseline.timeline,
        risk,
        advice: {
          summary: "From your uploaded documents:",
          key_insights: [docAnswer.answer],
          warnings: [],
          recommendations: [
            "You can ask follow-up questions about your documents or try a financial scenario.",
          ],
          explanation: docAnswer.answer,
          confidence: 0.85,
          tone: "neutral",
        },
      },
    };
  }

  // No document match — run normal financial scenario flow
  const scenarioState = applyScenarioToState(
    input.financial_state,
    parsed.parameters,
    parsed.intent,
  );

  const useScenario =
    scenarioState !== null &&
    parsed.intent !== "explanation_request";

  const activeState = useScenario ? scenarioState : input.financial_state;
  const { timeline, risk } = useScenario
    ? runEngines(scenarioState!, months, startMonth)
    : baseline;

  const advice = await generateFinancialAdvice(
    {
      state: activeState,
      timeline,
      risk,
      user_query: input.message,
      ai_provider: input.ai_provider,
    },
    {
      useLlm: input.use_llm !== false,
      ai_provider: input.ai_provider,
    },
  );

  const interpretation = buildInterpretation(
    parsed.intent,
    useScenario,
    parsed.parameters,
  );

  return {
    intent: parsed.intent,
    interpretation,
    financial_summary: advice.summary,
    risk_level: risk.risk_level,
    explanation: advice.explanation,
    recommendation:
      advice.recommendations[0] ??
      advice.key_insights[0] ??
      "Review your forecast timeline for month-by-month details.",
    structured_data: {
      timeline,
      risk,
      baseline_timeline: useScenario ? baseline.timeline : undefined,
      baseline_risk: useScenario ? baseline.risk : undefined,
      advice,
    },
  };
}
