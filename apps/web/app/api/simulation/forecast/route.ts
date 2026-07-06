import { NextRequest } from "next/server";

import { withAuthenticatedHandler } from "@/lib/api/authenticated-handler";
import { serializeTimeline } from "@/lib/serialize-scenario-response";
import { jsonSuccess } from "@/utils/api-response";
import { financialStatePersistence } from "@/services/financial-state/financial-state.persistence";
import { simulateForecast } from "@/services/financial-state/projection";
import { computeRiskSignals } from "@/services/financial-state/risk";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAuthenticatedHandler(async (userId) => {
    const body = await request.json();
    const months = body.months ?? 12;
    const startMonth = body.start_month;

    const state = await financialStatePersistence.loadState(userId, startMonth);
    const timeline = simulateForecast(state, months, startMonth);
    const risk = computeRiskSignals(timeline, {
      current_cash: state.current_cash,
      fixed_cost_ratio: state.computed.fixed_cost_ratio,
    });

    return jsonSuccess({
      timeline: serializeTimeline(timeline),
      risk,
    });
  });
}
