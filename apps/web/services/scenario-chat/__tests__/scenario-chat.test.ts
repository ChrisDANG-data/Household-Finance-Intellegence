import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  buildBasicScenarioState,
  FORECAST_START_MONTH,
} from "@/services/financial-state/test-fixtures/basicScenario";

import { classifyIntent, parseScenarioMessage } from "../intent-parser";
import { applyScenarioToState } from "../scenario-builder";
import { handleScenarioMessage } from "../orchestrator";

vi.mock("@/services/langgraph/orchestrator-client", () => ({
  orchestrateWithLangGraph: vi.fn().mockResolvedValue(null),
}));

const mockLoadState = vi.fn();

vi.mock("@/services/financial-state/financial-state.persistence", () => ({
  DEFAULT_USER_ID: "default",
  financialStatePersistence: {
    loadState: (...args: unknown[]) => mockLoadState(...args),
  },
}));

describe("Scenario Chat — intent parser", () => {
  it("classifies affordability questions", () => {
    expect(classifyIntent("Can I afford a vacation in August?")).toBe(
      "affordability_check",
    );
  });

  it("classifies what-if simulations", () => {
    expect(classifyIntent("What if I buy a car next month?")).toBe(
      "what_if_simulation",
    );
  });

  it("classifies explanation requests", () => {
    expect(classifyIntent("Why is my cash flow negative in October?")).toBe(
      "explanation_request",
    );
  });

  it("extracts amount and month from affordability message", () => {
    const parsed = parseScenarioMessage(
      "Can I afford a $3000 vacation in August?",
    );
    expect(parsed.intent).toBe("affordability_check");
    expect(parsed.parameters.amount).toBe(3000);
    expect(parsed.parameters.target_month).toMatch(/-08$/);
  });

  it("parses investment increase as what-if with one-time investment", () => {
    const parsed = parseScenarioMessage(
      "Can I increase my investment 10000$ in August?",
    );
    expect(parsed.intent).toBe("what_if_simulation");
    expect(parsed.parameters.amount).toBe(10000);
    expect(parsed.parameters.target_month).toMatch(/-08$/);
    expect(parsed.parameters.modification).toBe("add_one_time_investment");
  });

  it("extracts income percent change", () => {
    const parsed = parseScenarioMessage("What if my income drops by 20%?");
    expect(parsed.intent).toBe("what_if_simulation");
    expect(parsed.parameters.percent_change).toBe(-20);
  });
});

describe("Scenario Chat — orchestrator", () => {
  const state = buildBasicScenarioState();

  beforeEach(() => {
    mockLoadState.mockResolvedValue(state);
  });

  it("runs full pipeline without LLM", async () => {
    const response = await handleScenarioMessage({
      message: "Why is my cash flow negative in March?",
      user_id: state.user_id,
      financial_state: state,
      months: 12,
      forecast_start_month: FORECAST_START_MONTH,
      use_llm: false,
    });

    expect(response.intent).toBe("explanation_request");
    expect(response.structured_data.timeline).toHaveLength(12);
    expect(response.risk_level).toBeDefined();
    expect(response.explanation).toBeTruthy();
  });

  it("applies one-time expense for affordability check", async () => {
    const modified = applyScenarioToState(
      state,
      {
        amount: 5000,
        target_month: "2026-08",
        modification: "add_one_time_expense",
        event_type: "vacation",
      },
      "affordability_check",
    );

    expect(modified).not.toBeNull();
    expect(modified!.events.length).toBe(state.events.length + 1);

    const response = await handleScenarioMessage({
      message: "Can I afford a $5000 vacation in August?",
      user_id: state.user_id,
      financial_state: state,
      months: 12,
      forecast_start_month: FORECAST_START_MONTH,
      use_llm: false,
    });

    expect(response.intent).toBe("affordability_check");
    expect(response.structured_data.baseline_timeline).toBeDefined();
    expect(response.structured_data.timeline).toHaveLength(12);
  });

  it("is deterministic for identical inputs", async () => {
    const input = {
      message: "What if my income drops by 20%?",
      user_id: state.user_id,
      financial_state: state,
      months: 12 as const,
      forecast_start_month: FORECAST_START_MONTH,
      use_llm: false,
    };

    const a = await handleScenarioMessage(input);
    const b = await handleScenarioMessage(input);

    expect(a.intent).toBe(b.intent);
    expect(a.structured_data.timeline).toEqual(b.structured_data.timeline);
    expect(a.structured_data.risk).toEqual(b.structured_data.risk);
  });
});
