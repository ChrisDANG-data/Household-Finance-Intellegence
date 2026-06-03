import { describe, expect, it } from "vitest";

import { financialStateEngine } from "@/services/financial-state";
import {
  buildBasicScenarioState,
  FORECAST_START_MONTH,
} from "@/services/financial-state/test-fixtures/basicScenario";

import {
  buildDeterministicAdvice,
  generateFinancialAdvice,
} from "../advisor.service";

describe("AI Financial Advisor", () => {
  const state = buildBasicScenarioState();
  const timeline = financialStateEngine.simulateForecast(state, {
    months: 12,
    startMonth: FORECAST_START_MONTH,
  });
  const risk = financialStateEngine.analyzeRisk(state, timeline);
  const baseInput = {
    state,
    timeline,
    risk,
    user_query: "Summarize my household finances.",
  };

  it("returns structured FinancialAdviceResponse without LLM", async () => {
    const advice = await generateFinancialAdvice(baseInput, { useLlm: false });

    expect(advice.summary).toBeTruthy();
    expect(advice.key_insights.length).toBeGreaterThan(0);
    expect(Array.isArray(advice.warnings)).toBe(true);
    expect(Array.isArray(advice.recommendations)).toBe(true);
    expect(advice.explanation).toBeTruthy();
    expect(advice.confidence).toBeGreaterThan(0);
    expect(advice.confidence).toBeLessThanOrEqual(1);
    expect(["neutral", "supportive", "cautious", "urgent"]).toContain(
      advice.tone,
    );
  });

  it("deterministic fallback is stable across runs", () => {
    const a = buildDeterministicAdvice(baseInput);
    const b = buildDeterministicAdvice(baseInput);
    expect(a).toEqual(b);
  });

  it("includes scenario interpretation when user_query is provided", async () => {
    const advice = await generateFinancialAdvice(
      {
        state,
        timeline,
        risk,
        user_query: "What if I skip the renovation in March?",
      },
      { useLlm: false },
    );

    expect(advice.scenario_interpretation).toContain("renovation");
  });
});
