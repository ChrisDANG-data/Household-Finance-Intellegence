import type { FinancialRiskReport } from "@/services/financial-state/risk";
import type { FinancialState } from "@/services/financial-state/state.types";
import type { FinancialTimelineState } from "@/services/financial-state/state.types";
import type { AiProvider } from "@/services/ai/llm/types";

export type FinancialAdviceTone =
  | "neutral"
  | "supportive"
  | "cautious"
  | "urgent";

export interface FinancialAdviceResponse {
  summary: string;
  key_insights: string[];
  warnings: string[];
  recommendations: string[];
  explanation: string;
  confidence: number;
  tone: FinancialAdviceTone;
  scenario_interpretation?: string;
}

export interface GenerateFinancialAdviceInput {
  state: FinancialState;
  timeline: FinancialTimelineState[];
  risk: FinancialRiskReport;
  user_query: string;
  ai_provider?: AiProvider;
}

export interface SerializedAdvisorPayload {
  user_query: string;
  current_cash: number;
  monthly_income: number;
  risk_level: string;
  timeline_summary: string;
  insights: string[];
  stress_months: string[];
  metrics: FinancialRiskReport["metrics"];
}
