import type { FinancialRiskReport } from "@/services/financial-state/risk";
import type { FinancialState } from "@/services/financial-state/state.types";
import type { FinancialTimelineState } from "@/services/financial-state/state.types";
import type { FinancialEvent } from "@/services/financial-state/types";

import type { SerializedAdvisorPayload } from "./types";

function serializeEvent(event: FinancialEvent): Record<string, unknown> {
  return {
    ...event,
    start_date: event.start_date.toISOString().slice(0, 10),
    end_date: event.end_date
      ? event.end_date.toISOString().slice(0, 10)
      : null,
  };
}

/** JSON-safe snapshot for LLM prompts (read-only). */
export function serializeAdvisorPayload(
  state: FinancialState,
  timeline: FinancialTimelineState[],
  risk: FinancialRiskReport,
  user_query?: string,
): SerializedAdvisorPayload {
  return {
    state: {
      user_id: state.user_id,
      current_cash: state.current_cash,
      monthly_income: state.monthly_income,
      computed: state.computed,
      events: state.events.map(serializeEvent),
    },
    timeline: timeline.map((month) => ({
      month: month.month,
      income_total: month.income_total,
      expense_total: month.expense_total,
      net_cash_flow: month.net_cash_flow,
      active_event_ids: month.active_events.map((e) => e.id),
      active_event_categories: month.active_events.map((e) => e.category),
    })),
    risk,
    user_query: user_query ?? "",
  };
}
