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
  state: {
    user_id: string;
    current_cash: number;
    monthly_income: number;
    computed: FinancialState["computed"];
    events: Record<string, unknown>[];
  };
  timeline: {
    month: string;
    income_total: number;
    expense_total: number;
    net_cash_flow: number;
    active_event_ids: string[];
    active_event_categories: string[];
  }[];
  risk: FinancialRiskReport;
  user_query: string;
}
