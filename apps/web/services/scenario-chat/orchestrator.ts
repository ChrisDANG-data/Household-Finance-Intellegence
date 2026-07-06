import { generateFinancialAdvice } from "@/services/ai/advisor";
import { llmComplete } from "@/services/ai/llm/llm.service";
import type { AiProvider } from "@/services/ai/llm/types";
import { prisma } from "@/lib/prisma";
import { orchestrateWithLangGraph } from "@/services/langgraph/orchestrator-client";
import { narrateSpecialistReport } from "@/services/langgraph/writer.service";
import { env } from "@/lib/env";
import { currentUtcMonth } from "@/services/financial-state/dates";
import { computeRiskSignals } from "@/services/financial-state/risk";
import { simulateForecast } from "@/services/financial-state/projection";
import type { FinancialState } from "@/services/financial-state/state.types";

import { ensureAffordabilitySummary } from "./affordability-summary";
import { tryDeterministicLedgerAnswer } from "./deterministic-ledger";
import {
  isLedgerLookupQuestion,
  shouldPreferDocumentRag,
} from "./document-rag-query";
import { tryForecastTrendAnswer } from "./forecast-trend-lookup";
import { parseScenarioMessage } from "./intent-parser";
import { tryCategoryPaymentAnswer } from "./category-lookup";
import { resolveUseLangGraph } from "./route-classifier";
import { applyScenarioToState } from "./scenario-builder";
import type {
  HandleScenarioMessageInput,
  ScenarioChatResponse,
  ScenarioIntent,
  ScenarioParameters,
} from "./types";

const FORECAST_MONTHS_DEFAULT = 12;

async function loadDocumentRagService() {
  const mod = await import(
    "@/services/document-intelligence/indexing/rag.service"
  );
  return mod.documentRagService;
}

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
async function getFinancialContext(userId: string): Promise<string> {
  try {
    const [events, obligations] = await Promise.all([
      prisma.financialEvent.findMany({
        where: { userId },
        orderBy: { startDate: "asc" },
      }),
      prisma.financialObligation.findMany({
        where: { userId },
        orderBy: { startDate: "asc" },
      }),
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

async function tryRagDocumentAnswer(
  message: string,
  userId: string,
  provider?: AiProvider,
): Promise<string | null> {
  const rag = await loadDocumentRagService();
  const ragAnswer = await rag.ask(message, { topK: 5, provider, userId });
  if (ragAnswer.answer.toLowerCase().includes("not found")) {
    return null;
  }
  return ragAnswer.answer;
}

/**
 * Attempt RAG + DB lookup: retrieve relevant document chunks and obligation data.
 * Returns the answer if relevant info found, otherwise null.
 */
async function tryDocumentAnswer(
  message: string,
  userId: string,
  provider?: AiProvider,
): Promise<DocumentAnswer | null> {
  try {
    const deterministic = await tryDeterministicLedgerAnswer(message, { userId });
    if (deterministic) {
      return { answer: deterministic, hasDocumentContext: true };
    }

    const ragService = await loadDocumentRagService();
    const [ragResult, financialContext] = await Promise.all([
      ragService.retrieve({ query: message, topK: 5, userId }),
      getFinancialContext(userId),
    ]);

    const relevant = ragResult.chunks.filter((c) => c.score > 0.2);
    const topChunkScore =
      relevant.length > 0
        ? Math.max(...relevant.map((c) => c.score))
        : 0;

    // Document RAG runs even when ledger data exists (policy text, coverage, etc.)
    if (
      relevant.length > 0 &&
      shouldPreferDocumentRag(message, topChunkScore)
    ) {
      const ragAnswer = await tryRagDocumentAnswer(message, userId, provider);
      if (ragAnswer) {
        return { answer: ragAnswer, hasDocumentContext: true };
      }
    }

    if (relevant.length === 0 && !financialContext) return null;

    if (financialContext && isLedgerLookupQuestion(message)) {
      const docContext =
        relevant.length > 0
          ? relevant.map((c, i) => `[Doc ${i + 1}]\n${c.content}`).join("\n\n")
          : "";

      try {
        const { text } = await llmComplete({
          provider,
          maxTokens: 200,
          temperature: 0,
          caller: "scenario-chat-document",
          system: `You are a concise financial assistant. Answer from the provided data.

SCOPE (strict):
- Only answer direct ledger lookups: totals, category payments, or month breakdowns for income/expenses/investments already recorded.
- If the question is about document policy text, coverage terms, or affordability/what-if, reply with exactly: NOT_A_LEDGER_LOOKUP

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

        const trimmed = text.trim();
        if (/NOT_A_LEDGER/i.test(trimmed)) {
          if (relevant.length > 0) {
            const ragAnswer = await tryRagDocumentAnswer(message, userId, provider);
            if (ragAnswer) {
              return { answer: ragAnswer, hasDocumentContext: true };
            }
          }
          return null;
        }
        return { answer: trimmed || "Not found.", hasDocumentContext: true };
      } catch (err) {
        const fallback = await tryCategoryPaymentAnswer(message, userId);
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

    if (relevant.length > 0) {
      const ragAnswer = await tryRagDocumentAnswer(message, userId, provider);
      if (ragAnswer) {
        return { answer: ragAnswer, hasDocumentContext: true };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Orchestrates intent parsing, deterministic engines, RAG retrieval,
 * and AI advisor explanations.
 */
function buildLedgerResponse(
  parsed: ReturnType<typeof parseScenarioMessage>,
  baseline: ReturnType<typeof runEngines>,
  answer: string,
  route: "deterministic_ledger" | "ledger_llm",
): ScenarioChatResponse {
  const { timeline, risk } = baseline;
  return {
    intent: parsed.intent,
    interpretation:
      route === "deterministic_ledger"
        ? "Answer from deterministic ledger lookup (no LLM)."
        : "Answer based on your ledger and documents.",
    financial_summary: "From your household ledger:",
    risk_level: risk.risk_level,
    explanation: answer,
    recommendation: "",
    orchestrator_route: route,
    structured_data: {
      timeline,
      risk,
      advice: {
        summary: "From your household ledger:",
        key_insights: [answer],
        warnings: [],
        recommendations: [
          "You can ask follow-up questions about your documents or try a financial scenario.",
        ],
        explanation: answer,
        confidence: route === "deterministic_ledger" ? 0.95 : 0.85,
        tone: "neutral",
      },
    },
  };
}

export async function handleScenarioMessage(
  input: HandleScenarioMessageInput,
): Promise<ScenarioChatResponse> {
  const parsed = parseScenarioMessage(input.message);
  const months = input.months ?? FORECAST_MONTHS_DEFAULT;
  const startMonth = input.forecast_start_month;

  const baseline = runEngines(input.financial_state, months, startMonth);

  const forecastTrendAnswer = tryForecastTrendAnswer(
    input.message,
    input.financial_state,
    months,
    startMonth,
  );
  if (forecastTrendAnswer) {
    return buildLedgerResponse(
      parsed,
      baseline,
      forecastTrendAnswer,
      "deterministic_ledger",
    );
  }

  // Always try deterministic ledger first (accurate month totals beat LLM/LangGraph)
  const deterministicAnswer = await tryDeterministicLedgerAnswer(
    input.message,
    {
      state: input.financial_state,
      startMonth,
      forecastMonths: months,
      userId: input.user_id,
    },
  );
  if (deterministicAnswer) {
    return buildLedgerResponse(
      parsed,
      baseline,
      deterministicAnswer,
      "deterministic_ledger",
    );
  }

  const useLangGraphRoute = resolveUseLangGraph(
    input.message,
    input.analyst_mode,
    input.langgraph_enabled,
  );

  // Hybrid step 2: LangGraph multi-agent for complex / forced specialist mode
  if (useLangGraphRoute) {
    const langGraphResult = await orchestrateWithLangGraph({
      message: input.message,
      user_id: input.user_id,
      financial_state: input.financial_state,
      months: input.months,
      forecast_start_month: input.forecast_start_month,
      ai_provider: input.ai_provider,
      analyst_mode: input.analyst_mode ?? "auto",
    });
    if (langGraphResult) {
      const scenarioState = applyScenarioToState(
        input.financial_state,
        parsed.parameters,
        parsed.intent,
      );
      const useScenario =
        scenarioState !== null && parsed.intent !== "explanation_request";
      const { timeline, risk } = useScenario
        ? runEngines(scenarioState!, months, startMonth)
        : baseline;

      const detailAnswer = ensureAffordabilitySummary(
        input.message,
        input.financial_state,
        baseline.risk,
        langGraphResult.answer,
      );

      const writerSummary =
        env.langgraph.writerEnabled() && input.use_llm !== false
          ? await narrateSpecialistReport({
              message: input.message,
              detailAnswer,
              ai_provider: input.ai_provider,
            })
          : null;

      const explanation = writerSummary ?? detailAnswer;

      return {
        intent: langGraphResult.intent,
        interpretation: writerSummary
          ? writerSummary.includes("household ledger forecast")
            ? "Specialist data from LangGraph; summary from computed metrics (LLM fallback when needed)."
            : "Specialist data from LangGraph; summary narrated by LLM (numbers unchanged)."
          : "Answer generated by LangGraph multi-agent orchestration over read-only snapshots.",
        financial_summary: explanation,
        risk_level: risk.risk_level,
        explanation,
        recommendation: langGraphResult.recommendation,
        orchestrator_route: "langgraph",
        agents_used: langGraphResult.agents_used,
        writer_summary: writerSummary ?? undefined,
        detail_answer: detailAnswer,
        structured_data: {
          timeline,
          risk,
          baseline_timeline: useScenario ? baseline.timeline : undefined,
          baseline_risk: useScenario ? baseline.risk : undefined,
        },
      };
    }
  }

  // Hybrid step 3: ledger + RAG LLM for non-complex questions only
  if (!useLangGraphRoute) {
    const docAnswer = await tryDocumentAnswer(
      input.message,
      input.user_id,
      input.ai_provider,
    );

    if (docAnswer?.hasDocumentContext) {
      return buildLedgerResponse(
        parsed,
        baseline,
        docAnswer.answer,
        "ledger_llm",
      );
    }
  }

  // Hybrid step 4: forecast scenario + advisor
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
    orchestrator_route: "advisor",
    structured_data: {
      timeline,
      risk,
      baseline_timeline: useScenario ? baseline.timeline : undefined,
      baseline_risk: useScenario ? baseline.risk : undefined,
      advice,
    },
  };
}
