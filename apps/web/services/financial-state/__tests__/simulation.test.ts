import { describe, expect, it } from "vitest";

import { addMonths } from "../dates";
import { projectMonth, simulateForecast } from "../projection";
import type { FinancialTimelineState } from "../state.types";
import type { FinancialEvent } from "../types";
import {
  BASIC_SCENARIO_EVENT_IDS,
  buildBasicScenarioState,
  FORECAST_START_MONTH,
} from "../test-fixtures/basicScenario";

const FORECAST_MONTHS = 12;

function monthAt(index: number): string {
  return addMonths(FORECAST_START_MONTH, index);
}

function getTimelineMonth(
  timeline: FinancialTimelineState[],
  month: string,
): FinancialTimelineState {
  const entry = timeline.find((t) => t.month === month);
  if (!entry) {
    throw new Error(`Month ${month} not found in timeline`);
  }
  return entry;
}

function activeEventIds(month: FinancialTimelineState): string[] {
  return month.active_events.map((e) => e.id);
}

function hasActiveEvent(
  timeline: FinancialTimelineState[],
  month: string,
  eventId: string,
): boolean {
  return activeEventIds(getTimelineMonth(timeline, month)).includes(eventId);
}

function findEventInActive(
  month: FinancialTimelineState,
  eventId: string,
): FinancialEvent | undefined {
  return month.active_events.find((e) => e.id === eventId);
}

describe("Financial State Engine — deterministic simulation harness", () => {
  const state = buildBasicScenarioState();

  describe("Test A — multiple month simulation correctness", () => {
    const timeline = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);

    it("returns exactly 12 months", () => {
      expect(timeline).toHaveLength(12);
    });

    it("months are sequential and continuous from 2026-01", () => {
      for (let i = 0; i < FORECAST_MONTHS; i++) {
        expect(timeline[i].month).toBe(monthAt(i));
      }
    });

    it("each month has the required FinancialTimelineState structure", () => {
      for (const entry of timeline) {
        expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof entry.income_total).toBe("number");
        expect(typeof entry.expense_total).toBe("number");
        expect(typeof entry.net_cash_flow).toBe("number");
        expect(Array.isArray(entry.active_events)).toBe(true);
        expect(Number.isFinite(entry.income_total)).toBe(true);
        expect(Number.isFinite(entry.expense_total)).toBe(true);
        expect(Number.isFinite(entry.net_cash_flow)).toBe(true);
      }
    });
  });

  describe("Test B — recurring expense correctness", () => {
    const timeline = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);

    it("rent appears in ALL months", () => {
      for (let i = 0; i < FORECAST_MONTHS; i++) {
        expect(hasActiveEvent(timeline, monthAt(i), BASIC_SCENARIO_EVENT_IDS.rent)).toBe(
          true,
        );
      }
    });

    it("insurance appears in ALL months", () => {
      for (let i = 0; i < FORECAST_MONTHS; i++) {
        expect(
          hasActiveEvent(timeline, monthAt(i), BASIC_SCENARIO_EVENT_IDS.insurance),
        ).toBe(true);
      }
    });

    it("car lease appears only from Jan–Jun 2026", () => {
      const janToJun = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
      const julToDec = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];

      for (const month of janToJun) {
        expect(hasActiveEvent(timeline, month, BASIC_SCENARIO_EVENT_IDS.carLease)).toBe(
          true,
        );
        const entry = getTimelineMonth(timeline, month);
        expect(findEventInActive(entry, BASIC_SCENARIO_EVENT_IDS.carLease)?.amount).toBe(
          400,
        );
      }

      for (const month of julToDec) {
        expect(hasActiveEvent(timeline, month, BASIC_SCENARIO_EVENT_IDS.carLease)).toBe(
          false,
        );
      }
    });
  });

  describe("Test C — one-time expense correctness", () => {
    const timeline = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);

    it("renovation appears ONLY in March 2026", () => {
      expect(hasActiveEvent(timeline, "2026-03", BASIC_SCENARIO_EVENT_IDS.renovation)).toBe(
        true,
      );

      const otherMonths = timeline
        .map((t) => t.month)
        .filter((m) => m !== "2026-03");

      for (const month of otherMonths) {
        expect(hasActiveEvent(timeline, month, BASIC_SCENARIO_EVENT_IDS.renovation)).toBe(
          false,
        );
      }
    });

    it("renovation expense is applied only in March 2026", () => {
      const march = getTimelineMonth(timeline, "2026-03");
      expect(march.expense_total).toBe(1500 + 120 + 400 + 2000);

      const february = getTimelineMonth(timeline, "2026-02");
      expect(february.expense_total).toBe(1500 + 120 + 400);
    });
  });

  describe("Test D — income correctness", () => {
    const timeline = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);

    it("income is constant at 5000 CAD across all months", () => {
      for (const entry of timeline) {
        expect(entry.income_total).toBe(5000);
      }
    });
  });

  describe("Test E — net cash flow sanity check", () => {
    const timeline = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);

    it("net_cash_flow equals income minus expenses and investments for every month", () => {
      for (const entry of timeline) {
        expect(entry.net_cash_flow).toBe(
          Math.round(
            (entry.income_total - entry.expense_total - entry.investment_total) *
              100,
          ) / 100,
        );
      }
    });

    it("has no NaN or missing numeric values", () => {
      for (const entry of timeline) {
        expect(entry.income_total).not.toBeNaN();
        expect(entry.expense_total).not.toBeNaN();
        expect(entry.investment_total).not.toBeNaN();
        expect(entry.net_cash_flow).not.toBeNaN();
        expect(entry.income_total).toBeGreaterThanOrEqual(0);
        expect(entry.expense_total).toBeGreaterThanOrEqual(0);
        expect(entry.investment_total).toBeGreaterThanOrEqual(0);
      }
    });

    it("matches known baseline months (deterministic expectations)", () => {
      expect(getTimelineMonth(timeline, "2026-01").net_cash_flow).toBe(2980);
      expect(getTimelineMonth(timeline, "2026-03").net_cash_flow).toBe(980);
      expect(getTimelineMonth(timeline, "2026-07").net_cash_flow).toBe(3380);
    });
  });

  describe("Test F — stability test (determinism)", () => {
    it("simulateForecast produces identical output on repeated runs", () => {
      const run1 = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);
      const run2 = simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH);

      expect(run1).toEqual(run2);
    });

    it("projectMonth is stable for the same inputs", () => {
      const a = projectMonth(state, "2026-06");
      const b = projectMonth(state, "2026-06");
      expect(a).toEqual(b);
    });

    it("serialized timeline is byte-stable across runs", () => {
      const json1 = JSON.stringify(
        simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH),
      );
      const json2 = JSON.stringify(
        simulateForecast(state, FORECAST_MONTHS, FORECAST_START_MONTH),
      );
      expect(json1).toBe(json2);
    });
  });
});
