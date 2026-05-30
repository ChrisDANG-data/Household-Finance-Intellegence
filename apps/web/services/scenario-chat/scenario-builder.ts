import { randomUUID } from "node:crypto";

import { addMonths, currentUtcMonth } from "@/services/financial-state/dates";
import { buildFinancialState } from "@/services/financial-state/projection";
import type { FinancialState } from "@/services/financial-state/state.types";
import type { FinancialEvent } from "@/services/financial-state/types";

import type { ScenarioIntent, ScenarioParameters } from "./types";

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function cloneEvent(event: FinancialEvent): FinancialEvent {
  return {
    ...event,
    metadata: { ...event.metadata },
    start_date: new Date(event.start_date.getTime()),
    end_date: event.end_date ? new Date(event.end_date.getTime()) : event.end_date,
  };
}

/** Immutable copy of financial state for temporary scenario runs. */
export function cloneFinancialState(state: FinancialState): FinancialState {
  const referenceMonth = currentUtcMonth();
  return buildFinancialState(
    {
      user_id: state.user_id,
      current_cash: state.current_cash,
      monthly_income: state.monthly_income,
      events: state.events.map(cloneEvent),
    },
    referenceMonth,
  );
}

function monthToStartDate(month: string): Date {
  return utcDate(`${month}-01`);
}

export function addOneTimeExpense(
  state: FinancialState,
  options: {
    amount: number;
    target_month: string;
    category?: string;
    label?: string;
  },
): FinancialState {
  const event: FinancialEvent = {
    id: `scenario-expense-${randomUUID()}`,
    type: "one_time_expense",
    category: options.category ?? "scenario_expense",
    amount: options.amount,
    currency: "CAD",
    frequency: "one_time",
    start_date: monthToStartDate(options.target_month),
    end_date: null,
    owner: "joint",
    confidence: 1,
    source_document_id: null,
    metadata: {
      merchant: options.label,
      is_fixed: false,
    },
  };

  return buildFinancialState(
    {
      ...state,
      events: [...state.events.map(cloneEvent), event],
    },
    options.target_month,
  );
}

export function adjustIncome(
  state: FinancialState,
  percentChange: number,
): FinancialState {
  const factor = 1 + percentChange / 100;
  const referenceMonth = currentUtcMonth();

  const updatedEvents = state.events.map((event) => {
    const copy = cloneEvent(event);
    if (copy.type === "income") {
      copy.amount = Math.round(copy.amount * factor * 100) / 100;
    }
    return copy;
  });

  return buildFinancialState(
    {
      ...state,
      monthly_income: Math.round(state.monthly_income * factor * 100) / 100,
      events: updatedEvents,
    },
    referenceMonth,
  );
}

export function applyScenarioToState(
  baseState: FinancialState,
  params: ScenarioParameters,
  intent: ScenarioIntent,
): FinancialState | null {
  let state = cloneFinancialState(baseState);

  if (intent === "explanation_request") {
    return null;
  }

  if (params.modification === "add_one_time_expense" && params.amount) {
    const month = params.target_month ?? addMonths(currentUtcMonth(), 1);
    return addOneTimeExpense(state, {
      amount: params.amount,
      target_month: month,
      category: params.event_type ?? "scenario_purchase",
      label: params.description,
    });
  }

  if (
    (params.modification === "decrease_income" ||
      params.modification === "increase_income") &&
    params.percent_change != null
  ) {
    return adjustIncome(state, params.percent_change);
  }

  if (params.percent_change != null && /\bincome\b/i.test(params.description ?? "")) {
    return adjustIncome(state, params.percent_change);
  }

  if (intent === "what_if_simulation" && params.amount && params.target_month) {
    return addOneTimeExpense(state, {
      amount: params.amount,
      target_month: params.target_month,
      category: params.event_type ?? "what_if_expense",
    });
  }

  if (intent === "affordability_check" && params.amount) {
    const month = params.target_month ?? addMonths(currentUtcMonth(), 1);
    return addOneTimeExpense(state, {
      amount: params.amount,
      target_month: month,
      category: params.event_type ?? "affordability_check",
    });
  }

  return null;
}
