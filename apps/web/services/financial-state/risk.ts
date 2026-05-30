import type { FinancialEvent } from "./types";
import type { CashFlowRiskLevel, FinancialTimelineState } from "./state.types";

const LOW_BUFFER_THRESHOLD = 500;
const FIXED_COST_RATIO_THRESHOLD = 0.7;
const VOLATILITY_RATIO_THRESHOLD = 0.35;
const CRITICAL_CASH_FLOW_INCOME_RATIO = -0.2;
const RUNWAY_HIGH_RISK_MONTHS = 3;

export interface FinancialRiskMetrics {
  average_monthly_savings: number;
  worst_month_cash_flow: number;
  cash_flow_volatility: number;
  fixed_cost_ratio: number;
}

export interface FinancialRiskReport {
  risk_level: CashFlowRiskLevel;
  stress_months: string[];
  warning_events: FinancialEvent[];
  insights: string[];
  metrics: FinancialRiskMetrics;
}

/** Optional context for runway and cross-timeline event analysis. */
export interface RiskAnalysisContext {
  current_cash?: number;
  /** Pre-computed from FinancialState.computed when available */
  fixed_cost_ratio?: number;
}

/** @deprecated Use FinancialRiskReport */
export interface FinancialRiskSignals {
  cash_flow_risk_level: CashFlowRiskLevel;
  stress_months: string[];
  warning_events: FinancialEvent[];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function bumpRiskTier(tier: number): number {
  return Math.min(2, tier + 1);
}

function tierToLevel(tier: number): CashFlowRiskLevel {
  if (tier >= 2) return "high";
  if (tier === 1) return "medium";
  return "low";
}

function isExpenseEvent(event: FinancialEvent): boolean {
  return (
    event.type === "recurring_expense" ||
    event.type === "one_time_expense" ||
    event.type === "liability"
  );
}

function computeFixedCostRatio(timeline: FinancialTimelineState[]): number {
  let fixedExpenses = 0;
  let totalIncome = 0;

  for (const month of timeline) {
    totalIncome += month.income_total;
    for (const event of month.active_events) {
      if (isExpenseEvent(event) && event.metadata.is_fixed) {
        if (event.frequency === "weekly") {
          fixedExpenses += (event.amount * 52) / 12;
        } else if (event.frequency === "yearly") {
          fixedExpenses += event.amount / 12;
        } else if (event.frequency === "monthly") {
          fixedExpenses += event.amount;
        } else if (event.frequency === "one_time") {
          fixedExpenses += event.amount;
        }
      }
    }
  }

  const avgIncome = timeline.length > 0 ? totalIncome / timeline.length : 0;
  return avgIncome > 0 ? fixedExpenses / timeline.length / avgIncome : 0;
}

function monthlyEventImpact(event: FinancialEvent): number {
  switch (event.frequency) {
    case "weekly":
      return (event.amount * 52) / 12;
    case "yearly":
      return event.amount / 12;
    default:
      return event.amount;
  }
}

function extractWarningEvents(
  timeline: FinancialTimelineState[],
  stressMonths: Set<string>,
): FinancialEvent[] {
  const byId = new Map<string, { event: FinancialEvent; impact: number }>();

  for (const month of timeline) {
    const inStress = stressMonths.has(month.month);
    for (const event of month.active_events) {
      if (!isExpenseEvent(event)) continue;

      const impact = monthlyEventImpact(event);
      const score = impact * (inStress ? 2 : 1);

      const existing = byId.get(event.id);
      if (!existing || score > existing.impact) {
        byId.set(event.id, { event, impact: score });
      }
    }
  }

  const liabilitiesPerStressMonth = timeline
    .filter((m) => stressMonths.has(m.month))
    .map(
      (m) =>
        m.active_events.filter((e) => e.type === "liability").length,
    );

  if (liabilitiesPerStressMonth.some((c) => c >= 2)) {
    for (const month of timeline) {
      if (!stressMonths.has(month.month)) continue;
      for (const event of month.active_events) {
        if (event.type === "liability") {
          const impact = monthlyEventImpact(event) * 1.5;
          const existing = byId.get(event.id);
          if (!existing || impact > existing.impact) {
            byId.set(event.id, { event, impact });
          }
        }
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.impact - a.impact)
    .map((x) => x.event);
}

function detectMidYearInstability(timeline: FinancialTimelineState[]): boolean {
  if (timeline.length < 6) return false;
  const mid = timeline.slice(3, 9);
  const negativeInMid = mid.filter((m) => m.net_cash_flow < 0).length;
  return negativeInMid >= 2;
}

function computeRunwayMonths(
  currentCash: number,
  timeline: FinancialTimelineState[],
): number | null {
  if (currentCash <= 0) return 0;
  let cash = currentCash;
  let months = 0;
  for (const month of timeline) {
    cash += month.net_cash_flow;
    months++;
    if (cash <= 0) return months;
  }
  const avgBurn =
    mean(timeline.filter((m) => m.net_cash_flow < 0).map((m) => m.net_cash_flow)) ||
    mean(timeline.map((m) => m.net_cash_flow));
  if (avgBurn >= 0) return null;
  return roundMoney(currentCash / Math.abs(avgBurn));
}

/**
 * Deterministic risk analysis over a forecast timeline (no AI, no DB).
 */
export function computeRiskSignals(
  timeline: FinancialTimelineState[],
  context?: RiskAnalysisContext,
): FinancialRiskReport {
  if (timeline.length === 0) {
    return {
      risk_level: "low",
      stress_months: [],
      warning_events: [],
      insights: ["No forecast timeline available for risk analysis"],
      metrics: {
        average_monthly_savings: 0,
        worst_month_cash_flow: 0,
        cash_flow_volatility: 0,
        fixed_cost_ratio: 0,
      },
    };
  }

  const cashFlows = timeline.map((m) => m.net_cash_flow);
  const incomes = timeline.map((m) => m.income_total);

  const average_monthly_savings = roundMoney(mean(cashFlows));
  const worst_month_cash_flow = roundMoney(Math.min(...cashFlows));
  const cash_flow_volatility = roundMoney(standardDeviation(cashFlows));

  const fixed_cost_ratio = roundMoney(
    context?.fixed_cost_ratio ?? computeFixedCostRatio(timeline),
  );

  const metrics: FinancialRiskMetrics = {
    average_monthly_savings,
    worst_month_cash_flow,
    cash_flow_volatility,
    fixed_cost_ratio,
  };

  const stress_monthsSet = new Set<string>();
  const insights: string[] = [];
  let riskTier = 0;

  // Rule A — negative cash flow stress months
  const negativeFlowMonths = timeline.filter((m) => m.net_cash_flow < 0);
  for (const m of negativeFlowMonths) {
    stress_monthsSet.add(m.month);
  }

  if (negativeFlowMonths.length > 2) {
    riskTier = 2;
    insights.push(
      `Negative cash flow detected in ${negativeFlowMonths.length} months`,
    );
  } else if (negativeFlowMonths.length === 1) {
    riskTier = 1;
    insights.push("Negative cash flow detected in 1 month");
  }

  // Liquidity depletion stress (cumulative)
  if (context?.current_cash != null && context.current_cash >= 0) {
    let cumulative = context.current_cash;
    for (const month of timeline) {
      cumulative += month.net_cash_flow;
      if (cumulative < 0) {
        stress_monthsSet.add(month.month);
        insights.push(
          `Projected cash balance falls below zero in ${month.month}`,
        );
        riskTier = Math.max(riskTier, 2);
      }
    }
  }

  // Rule B — low average buffer
  if (average_monthly_savings < LOW_BUFFER_THRESHOLD) {
    riskTier = bumpRiskTier(riskTier);
    insights.push(
      `Average monthly savings (${average_monthly_savings} CAD) is below a safe buffer threshold`,
    );
  }

  // Rule C — expense concentration
  const avgIncome = mean(incomes);
  if (avgIncome > 0 && fixed_cost_ratio > FIXED_COST_RATIO_THRESHOLD) {
    riskTier = bumpRiskTier(riskTier);
    insights.push("High fixed cost ratio reduces financial flexibility");
  }

  // Rule D — volatility (relative spread only; avoids false positives from one-off expenses)
  const absMean = Math.abs(average_monthly_savings) || 1;
  if (
    timeline.length >= 3 &&
    cash_flow_volatility / absMean > VOLATILITY_RATIO_THRESHOLD
  ) {
    insights.push("Income/expense instability detected");
    riskTier = bumpRiskTier(riskTier);
  }

  // Rule E — worst month critical stress
  const worstMonth = timeline.reduce((a, b) =>
    a.net_cash_flow < b.net_cash_flow ? a : b,
  );
  if (worstMonth.income_total > 0) {
    const ratio = worstMonth.net_cash_flow / worstMonth.income_total;
    if (ratio < CRITICAL_CASH_FLOW_INCOME_RATIO) {
      stress_monthsSet.add(worstMonth.month);
      riskTier = 2;
      insights.push(
        `Expenses exceed income in peak stress period (${worstMonth.month})`,
      );
    }
  }

  if (worst_month_cash_flow < 0 && !insights.some((i) => i.includes("peak"))) {
    insights.push(
      `Worst month cash flow is ${worst_month_cash_flow} CAD in ${worstMonth.month}`,
    );
  }

  // Mid-year instability pattern
  if (detectMidYearInstability(timeline)) {
    insights.push("Financial stability decreases in mid-year period");
    riskTier = bumpRiskTier(riskTier);
  }

  // Overcommitment: expenses exceed income in any month
  const overcommitted = timeline.filter(
    (m) => m.expense_total + m.investment_total > m.income_total,
  );
  if (overcommitted.length > 0 && negativeFlowMonths.length === 0) {
    insights.push(
      `Expenses exceed income in ${overcommitted.length} month(s) before net adjustments`,
    );
  }

  // Rule F — runway
  if (context?.current_cash != null) {
    const runway = computeRunwayMonths(context.current_cash, timeline);
    if (runway !== null && runway < RUNWAY_HIGH_RISK_MONTHS) {
      riskTier = 2;
      insights.push(
        `Low liquidity: projected runway is approximately ${runway} month(s)`,
      );
    }
  }

  const stress_months = [...stress_monthsSet].sort();
  const warning_events = extractWarningEvents(timeline, stress_monthsSet);

  if (insights.length === 0) {
    insights.push("Cash flow remains stable across the forecast horizon");
  }

  return {
    risk_level: tierToLevel(riskTier),
    stress_months,
    warning_events,
    insights: [...new Set(insights)],
    metrics,
  };
}

/** Maps to legacy API shape for backward compatibility. */
export function toFinancialRiskSignals(
  report: FinancialRiskReport,
): FinancialRiskSignals {
  return {
    cash_flow_risk_level: report.risk_level,
    stress_months: report.stress_months,
    warning_events: report.warning_events,
  };
}
