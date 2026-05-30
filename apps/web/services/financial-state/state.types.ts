import type { FinancialEvent } from "./types";

/** Derived metrics attached to a FinancialState (computed, not stored). */
export interface FinancialStateComputed {
  monthly_net_cash_flow: number;
  burn_rate: number;
  runway_months: number | null;
  fixed_cost_ratio: number;
}

export interface FinancialState {
  user_id: string;
  current_cash: number;
  monthly_income: number;
  events: FinancialEvent[];
  computed: FinancialStateComputed;
}

export interface FinancialTimelineState {
  month: string;
  income_total: number;
  expense_total: number;
  investment_total: number;
  net_cash_flow: number;
  opening_balance: number;
  closing_balance: number;
  active_events: FinancialEvent[];
}

export type CashFlowRiskLevel = "low" | "medium" | "high";

export interface SimulateForecastOptions {
  months?: number;
  startMonth?: string;
}
