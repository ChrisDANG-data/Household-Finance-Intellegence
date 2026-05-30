import { env } from "@/lib/env";
import type { FinancialState } from "@/services/financial-state/state.types";
import type { AiProvider } from "@/services/ai/llm/types";

export interface LangGraphOrchestrateInput {
  message: string;
  user_id: string;
  financial_state: FinancialState;
  months?: number;
  forecast_start_month?: string;
  ai_provider?: AiProvider;
}

export interface LangGraphOrchestrateOutput {
  answer: string;
  recommendation: string;
  intent:
    | "affordability_check"
    | "what_if_simulation"
    | "explanation_request"
    | "general_finance_question";
  confidence: number;
}

export async function orchestrateWithLangGraph(
  input: LangGraphOrchestrateInput,
): Promise<LangGraphOrchestrateOutput | null> {
  const baseUrl = env.langgraph.orchestratorUrl();
  if (!env.langgraph.enabled() || !baseUrl) return null;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/orchestrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as Partial<LangGraphOrchestrateOutput>;
  if (!data.answer || !data.intent) return null;
  return {
    answer: data.answer,
    recommendation:
      data.recommendation ??
      "Review your deterministic forecast and risk summary for details.",
    intent: data.intent,
    confidence:
      typeof data.confidence === "number" ? data.confidence : 0.6,
  };
}
