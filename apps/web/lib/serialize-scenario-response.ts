import type { ScenarioChatResponse } from "@/services/scenario-chat/types";
import type { FinancialTimelineState } from "@/services/financial-state/state.types";
import type {
  FinancialEvent,
  FinancialEventOwner,
} from "@/services/financial-state/types";

export interface SerializedEventLine {
  category: string;
  amount: number;
  owner: FinancialEventOwner;
}

export interface SerializedTimelineMonth {
  month: string;
  income_total: number;
  expense_total: number;
  investment_total: number;
  net_cash_flow: number;
  opening_balance: number;
  closing_balance: number;
  active_event_ids: string[];
  active_event_categories: string[];
  income_by_category: Record<string, number>;
  expense_by_category: Record<string, number>;
  investment_by_category: Record<string, number>;
  income_lines: SerializedEventLine[];
  expense_lines: SerializedEventLine[];
  investment_lines: SerializedEventLine[];
}

export interface SerializedScenarioChatResponse
  extends Omit<ScenarioChatResponse, "structured_data"> {
  structured_data: {
    timeline: SerializedTimelineMonth[];
    risk: ScenarioChatResponse["structured_data"]["risk"];
    baseline_timeline?: SerializedTimelineMonth[];
    baseline_risk?: ScenarioChatResponse["structured_data"]["risk"];
    advice?: ScenarioChatResponse["structured_data"]["advice"];
  };
}

function eventMonthlyAmount(event: FinancialEvent): number {
  if (event.frequency === "weekly") return event.amount * 4.33;
  return event.amount;
}

export function serializeTimeline(
  timeline: FinancialTimelineState[],
): SerializedTimelineMonth[] {
  return timeline.map((m) => {
    const income_by_category: Record<string, number> = {};
    const expense_by_category: Record<string, number> = {};
    const investment_by_category: Record<string, number> = {};
    const income_lines: SerializedEventLine[] = [];
    const expense_lines: SerializedEventLine[] = [];
    const investment_lines: SerializedEventLine[] = [];

    for (const event of m.active_events) {
      const amount = eventMonthlyAmount(event);
      if (amount <= 0) continue;

      const line: SerializedEventLine = {
        category: event.category,
        amount,
        owner: event.owner ?? "partner_a",
      };

      if (event.type === "income") {
        income_by_category[event.category] =
          (income_by_category[event.category] ?? 0) + amount;
        income_lines.push(line);
      } else if (event.type === "investment") {
        investment_by_category[event.category] =
          (investment_by_category[event.category] ?? 0) + amount;
        investment_lines.push(line);
      } else if (
        event.type === "recurring_expense" ||
        event.type === "one_time_expense" ||
        event.type === "liability"
      ) {
        expense_by_category[event.category] =
          (expense_by_category[event.category] ?? 0) + amount;
        expense_lines.push(line);
      }
    }

    const byCategory = (a: SerializedEventLine, b: SerializedEventLine) =>
      a.category.localeCompare(b.category);

    return {
      month: m.month,
      income_total: m.income_total,
      expense_total: m.expense_total,
      investment_total: m.investment_total,
      net_cash_flow: m.net_cash_flow,
      opening_balance: m.opening_balance,
      closing_balance: m.closing_balance,
      active_event_ids: m.active_events.map((e: FinancialEvent) => e.id),
      active_event_categories: m.active_events.map((e: FinancialEvent) => e.category),
      income_by_category,
      expense_by_category,
      investment_by_category,
      income_lines: income_lines.sort(byCategory),
      expense_lines: expense_lines.sort(byCategory),
      investment_lines: investment_lines.sort(byCategory),
    };
  });
}

export function serializeScenarioChatResponse(
  response: ScenarioChatResponse,
): SerializedScenarioChatResponse {
  return {
    ...response,
    structured_data: {
      timeline: serializeTimeline(response.structured_data.timeline),
      risk: response.structured_data.risk,
      baseline_timeline: response.structured_data.baseline_timeline
        ? serializeTimeline(response.structured_data.baseline_timeline)
        : undefined,
      baseline_risk: response.structured_data.baseline_risk,
      advice: response.structured_data.advice,
    },
  };
}
