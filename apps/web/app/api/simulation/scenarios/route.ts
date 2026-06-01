import { NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api/route-handler";
import { serializeTimeline } from "@/lib/serialize-scenario-response";
import { jsonSuccess } from "@/utils/api-response";
import {
  financialStatePersistence,
  DEFAULT_USER_ID,
} from "@/services/financial-state/financial-state.persistence";
import { simulateForecast } from "@/services/financial-state/projection";
import { computeRiskSignals } from "@/services/financial-state/risk";
import type { FinancialState } from "@/services/financial-state/state.types";
import type { FinancialEvent } from "@/services/financial-state/types";

export const runtime = "nodejs";

interface Adjustment {
  type: "add_expense" | "remove_event" | "change_income";
  category?: string;
  amount?: number;
  frequency?: string;
  event_id?: string;
}

function applyAdjustments(
  state: FinancialState,
  adjustments: Adjustment[],
): FinancialState {
  let events: FinancialEvent[] = [...state.events];
  let monthlyIncome = state.monthly_income;

  for (const adj of adjustments) {
    switch (adj.type) {
      case "add_expense": {
        const syntheticEvent: FinancialEvent = {
          id: `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "recurring_expense",
          category: adj.category ?? "scenario_expense",
          amount: adj.amount ?? 0,
          currency: "CAD",
          frequency: (adj.frequency as FinancialEvent["frequency"]) ?? "monthly",
          start_date: new Date(),
          end_date: null,
          owner: "joint",
          confidence: 1,
          source_document_id: null,
          metadata: { is_fixed: false },
        };
        events = [...events, syntheticEvent];
        break;
      }
      case "remove_event": {
        if (adj.event_id) {
          events = events.filter((e) => e.id !== adj.event_id);
        }
        break;
      }
      case "change_income": {
        monthlyIncome += adj.amount ?? 0;
        const incomeEvents = events.filter((e) => e.type === "income");
        if (incomeEvents.length > 0 && adj.amount) {
          const perEvent = adj.amount / incomeEvents.length;
          events = events.map((e) =>
            e.type === "income"
              ? { ...e, amount: Math.max(0, e.amount + perEvent) }
              : e,
          );
        }
        break;
      }
    }
  }

  return {
    ...state,
    monthly_income: Math.max(0, monthlyIncome),
    events,
  };
}

export async function POST(request: NextRequest) {
  return withApiHandler(async () => {
    const body = await request.json();
    const userId = body.user_id ?? DEFAULT_USER_ID;
    const months = body.months ?? 12;
    const startMonth = body.start_month;
    const adjustments: Adjustment[] = body.adjustments ?? [];

    const state = await financialStatePersistence.loadState(userId, startMonth);

    const baselineTimeline = simulateForecast(state, months, startMonth);
    const baselineRisk = computeRiskSignals(baselineTimeline, {
      current_cash: state.current_cash,
      fixed_cost_ratio: state.computed.fixed_cost_ratio,
    });

    const modifiedState = applyAdjustments(state, adjustments);
    const scenarioTimeline = simulateForecast(modifiedState, months, startMonth);
    const scenarioRisk = computeRiskSignals(scenarioTimeline, {
      current_cash: modifiedState.current_cash,
      fixed_cost_ratio: modifiedState.computed.fixed_cost_ratio,
    });

    const baselineNet = baselineTimeline.reduce(
      (sum, m) => sum + m.net_cash_flow,
      0,
    );
    const scenarioNet = scenarioTimeline.reduce(
      (sum, m) => sum + m.net_cash_flow,
      0,
    );

    return jsonSuccess({
      baseline: {
        timeline: serializeTimeline(baselineTimeline),
        risk: baselineRisk,
      },
      scenario: {
        timeline: serializeTimeline(scenarioTimeline),
        risk: scenarioRisk,
      },
      comparison: {
        net_difference: Math.round((scenarioNet - baselineNet) * 100) / 100,
      },
    });
  });
}
