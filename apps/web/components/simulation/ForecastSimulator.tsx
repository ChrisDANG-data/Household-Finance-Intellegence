"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Loader2,
  SendHorizonal,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { useAiProvider } from "@/hooks/use-ai-provider";
import { GoogleVoiceAskButton } from "@/components/ai/GoogleVoiceAskButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type {
  SerializedEventLine,
  SerializedTimelineMonth,
} from "@/lib/serialize-scenario-response";
import {
  type FinancialEventOwner,
} from "@/services/financial-state/types";

interface RiskReport {
  risk_level: "low" | "medium" | "high";
  insights: string[];
  stress_months: string[];
  warning_events: Array<{ id: string; category: string }>;
  metrics: {
    average_monthly_savings: number;
    worst_month_cash_flow: number;
    cash_flow_volatility: number;
    fixed_cost_ratio: number;
  };
}

interface ForecastResult {
  timeline: SerializedTimelineMonth[];
  risk: RiskReport;
}

interface ScenarioResult {
  baseline: ForecastResult;
  scenario: ForecastResult;
  comparison: { net_difference: number };
}

type AdjustmentType = "add_expense" | "change_income";

interface AdjustmentForm {
  type: AdjustmentType;
  amount: number;
  category: string;
  frequency: "monthly" | "weekly" | "yearly" | "one_time";
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function formatCad(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Percentage of a base total; returns em dash when base is zero. */
function formatPct(amount: number, base: number): string {
  if (base <= 0 || amount === 0) return "—";
  return `${((Math.abs(amount) / base) * 100).toFixed(1)}%`;
}

function pctOfIncome(amount: number, incomeTotal: number): string {
  return formatPct(amount, incomeTotal);
}

function pctWithinCategory(amount: number, categoryTotal: number): string {
  return formatPct(amount, categoryTotal);
}

function partnerSplit(owner: FinancialEventOwner, amount: number): {
  partnerA: number;
  partnerB: number;
} {
  if (owner === "partner_b") return { partnerA: 0, partnerB: amount };
  if (owner === "joint") return { partnerA: amount / 2, partnerB: amount / 2 };
  return { partnerA: amount, partnerB: 0 };
}

interface PartnerAmountRow {
  category: string;
  partnerA: number;
  partnerB: number;
}

function lineTotal(row: PartnerAmountRow): number {
  return row.partnerA + row.partnerB;
}

function partnerCell(amount: number): string {
  return amount > 0 ? formatCad(amount) : "—";
}

function aggregateLinesByCategory(lines: SerializedEventLine[]): PartnerAmountRow[] {
  const map = new Map<string, { partnerA: number; partnerB: number }>();

  for (const line of lines) {
    const split = partnerSplit(line.owner, line.amount);
    const current = map.get(line.category) ?? { partnerA: 0, partnerB: 0 };
    current.partnerA += split.partnerA;
    current.partnerB += split.partnerB;
    map.set(line.category, current);
  }

  return Array.from(map.entries())
    .map(([category, { partnerA, partnerB }]) => ({
      category,
      partnerA,
      partnerB,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function sumPartnerRows(rows: PartnerAmountRow[]): {
  partnerA: number;
  partnerB: number;
} {
  return rows.reduce(
    (acc, row) => ({
      partnerA: acc.partnerA + row.partnerA,
      partnerB: acc.partnerB + row.partnerB,
    }),
    { partnerA: 0, partnerB: 0 },
  );
}

function linesFromCategoryMap(
  byCategory: Record<string, number> | undefined,
  lines: SerializedEventLine[] | undefined,
): SerializedEventLine[] {
  if (lines && lines.length > 0) return lines;
  return Object.entries(byCategory ?? {}).map(([category, amount]) => ({
    category,
    amount,
    owner: "partner_a" as const,
  }));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FORECAST_MONTHS = 6;

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function generateMonthOptions(): { label: string; value: string }[] {
  const now = new Date();
  const options: { label: string; value: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const value = `${year}-${String(month + 1).padStart(2, "0")}`;
    options.push({ label: `${MONTH_NAMES[month]} ${year}`, value });
  }
  return options;
}

const CHART_HEIGHT = 220;

const CATEGORY_COLOR_MAP: Record<string, string> = {
  car_lease: "#ef4444",
  car: "#ef4444",
  vehicle: "#ef4444",
  rent: "#f97316",
  housing: "#f97316",
  mortgage: "#f97316",
  insurance: "#eab308",
  utilities: "#a855f7",
  electricity: "#a855f7",
  hydro: "#a855f7",
  gas: "#7c3aed",
  water: "#06b6d4",
  internet: "#0ea5e9",
  phone: "#0284c7",
  groceries: "#ec4899",
  grocery: "#ec4899",
  food: "#f472b6",
  restaurant: "#f472b6",
  transport: "#f43f5e",
  health: "#14b8a6",
  medical: "#14b8a6",
  entertainment: "#6366f1",
  subscription: "#818cf8",
  education: "#8b5cf6",
  clothing: "#d946ef",
  travel: "#0891b2",
  investment: "#2563eb",
  rrsp: "#2563eb",
  tfsa: "#1d4ed8",
  savings: "#3b82f6",
  retirement: "#1e40af",
};

const DISTINCT_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e", "#0ea5e9", "#84cc16",
];

const dynamicColorCache: Record<string, string> = {};
let paletteIndex = 0;

function getExpenseColor(category: string): string {
  const key = category.toLowerCase().replace(/[_\s-]/g, "");

  if (CATEGORY_COLOR_MAP[key]) return CATEGORY_COLOR_MAP[key];

  for (const [k, color] of Object.entries(CATEGORY_COLOR_MAP)) {
    if (key.includes(k) || k.includes(key)) return color;
  }

  if (!dynamicColorCache[key]) {
    dynamicColorCache[key] = DISTINCT_PALETTE[paletteIndex % DISTINCT_PALETTE.length];
    paletteIndex++;
  }
  return dynamicColorCache[key];
}

function formatCategory(category: string): string {
  return category.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ClusteredColumnChart({
  timeline,
  highlightMonth,
  title,
}: {
  timeline: SerializedTimelineMonth[];
  highlightMonth?: string;
  title?: string;
}) {
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No forecast data yet.</p>;
  }

  const maxVal = Math.max(
    ...timeline.map((m) =>
      Math.max(m.income_total, m.expense_total + (m.investment_total ?? 0)),
    ),
    1,
  );

  const allExpenseCategories = Array.from(
    new Set(timeline.flatMap((m) => Object.keys(m.expense_by_category ?? {}))),
  );
  const allInvestmentCategories = Array.from(
    new Set(timeline.flatMap((m) => Object.keys(m.investment_by_category ?? {}))),
  );

  return (
    <div className="space-y-3">
      {title && <p className="text-sm font-medium">{title}</p>}
      <div
        className="relative flex items-end gap-3 border-b-2 border-border px-2"
        style={{ height: `${CHART_HEIGHT}px` }}
      >
        {timeline.map((month) => {
          const incomePx = Math.max(6, Math.round((month.income_total / maxVal) * (CHART_HEIGHT - 30)));
          const outflowTotal =
            month.expense_total + (month.investment_total ?? 0);
          const expensePx = Math.max(
            6,
            Math.round((outflowTotal / maxVal) * (CHART_HEIGHT - 30)),
          );
          const monthLabel = MONTH_NAMES[parseInt(month.month.slice(5)) - 1]?.slice(0, 3) ?? month.month.slice(5);
          const isHighlighted = month.month === highlightMonth;

          const expenseSegments = [
            ...Object.entries(month.expense_by_category ?? {}).map(([cat, amt]) => ({
              category: cat,
              height: Math.max(2, Math.round((amt / maxVal) * (CHART_HEIGHT - 30))),
              color: getExpenseColor(cat),
              amount: amt,
            })),
            ...Object.entries(month.investment_by_category ?? {}).map(([cat, amt]) => ({
              category: cat,
              height: Math.max(2, Math.round((amt / maxVal) * (CHART_HEIGHT - 30))),
              color: getExpenseColor(cat),
              amount: amt,
            })),
          ];

          return (
            <div
              key={month.month}
              className={`flex flex-1 flex-col items-center justify-end rounded-t-md pb-6 ${
                isHighlighted ? "bg-blue-50 dark:bg-blue-950/40" : ""
              }`}
              style={{ height: "100%" }}
            >
              <div className="flex items-end gap-1">
                <div
                  className="w-5 rounded-t bg-emerald-500 transition-all"
                  style={{ height: `${incomePx}px` }}
                  title={`Income: ${formatCad(month.income_total)}`}
                />
                <div className="flex w-5 flex-col-reverse" style={{ height: `${expensePx}px` }}>
                  {expenseSegments.map((seg) => (
                    <div
                      key={seg.category}
                      className="w-full first:rounded-t transition-all"
                      style={{
                        height: `${seg.height}px`,
                        backgroundColor: seg.color,
                      }}
                      title={`${formatCategory(seg.category)}: ${formatCad(seg.amount)}`}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-2 flex flex-col items-center">
                <span className={`text-xs font-medium ${isHighlighted ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                  {monthLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-emerald-500" />
          Income
        </span>
        {allExpenseCategories.map((cat) => (
          <span key={cat} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-5 rounded-sm"
              style={{ backgroundColor: getExpenseColor(cat) }}
            />
            {formatCategory(cat)}
          </span>
        ))}
        {allInvestmentCategories.map((cat) => (
          <span key={`inv-${cat}`} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-5 rounded-sm"
              style={{ backgroundColor: getExpenseColor(cat) }}
            />
            {formatCategory(cat)} (investment)
          </span>
        ))}
      </div>
    </div>
  );
}

export function ForecastSimulator() {
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const [adjustment, setAdjustment] = useState<AdjustmentForm>({
    type: "add_expense",
    amount: 500,
    category: "new_expense",
    frequency: "monthly",
  });
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const runForecast = useCallback(async () => {
    setForecastLoading(true);
    setForecastError(null);
    try {
      const res = await fetch("/api/simulation/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: FORECAST_MONTHS }),
      });
      const json = await res.json();
      if (!json.success) {
        setForecastError(json.error?.message ?? "Forecast failed");
        return;
      }
      setForecastResult(json.data);
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : "Network error");
    } finally {
      setForecastLoading(false);
    }
  }, []);

  useEffect(() => {
    runForecast();
  }, [runForecast]);

  const selectedMonthData = forecastResult?.timeline.find(
    (m) => m.month === selectedMonth,
  );

  const incomePartnerRows = useMemo(
    () =>
      selectedMonthData
        ? aggregateLinesByCategory(
            linesFromCategoryMap(
              selectedMonthData.income_by_category,
              selectedMonthData.income_lines,
            ),
          )
        : [],
    [selectedMonthData],
  );

  const expensePartnerRows = useMemo(
    () =>
      selectedMonthData
        ? aggregateLinesByCategory(
            linesFromCategoryMap(
              selectedMonthData.expense_by_category,
              selectedMonthData.expense_lines,
            ),
          )
        : [],
    [selectedMonthData],
  );

  const investmentPartnerRows = useMemo(
    () =>
      selectedMonthData
        ? aggregateLinesByCategory(
            linesFromCategoryMap(
              selectedMonthData.investment_by_category,
              selectedMonthData.investment_lines,
            ),
          )
        : [],
    [selectedMonthData],
  );

  const incomePartnerTotals = useMemo(
    () => sumPartnerRows(incomePartnerRows),
    [incomePartnerRows],
  );
  const expensePartnerTotals = useMemo(
    () => sumPartnerRows(expensePartnerRows),
    [expensePartnerRows],
  );
  const investmentPartnerTotals = useMemo(
    () => sumPartnerRows(investmentPartnerRows),
    [investmentPartnerRows],
  );

  async function runScenario() {
    setScenarioLoading(true);
    setScenarioError(null);
    try {
      const res = await fetch("/api/simulation/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          months: FORECAST_MONTHS,
          adjustments: [
            {
              type: adjustment.type,
              amount: adjustment.amount,
              category: adjustment.category,
              frequency: adjustment.frequency,
            },
          ],
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setScenarioError(json.error?.message ?? "Scenario failed");
        return;
      }
      setScenarioResult(json.data);
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : "Network error");
    } finally {
      setScenarioLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <ChatInput />

      {/* Forecast Section */}
      <Card id="fi-cash-flow" className="scroll-mt-32">
        <CardHeader>
          <CardTitle className="text-base">Cash-Flow Forecast (Next 6 Months)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="forecast-month" className="text-xs text-muted-foreground">
                Select month
              </label>
              <select
                id="forecast-month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedMonthData && (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Opening Balance</span>
                  <span className="text-lg font-semibold font-mono text-blue-700 dark:text-blue-400">
                    {formatCad(selectedMonthData.opening_balance)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Closing Balance</span>
                  <span className={`text-lg font-semibold font-mono ${
                    selectedMonthData.closing_balance >= 0
                      ? "text-blue-700 dark:text-blue-400"
                      : "text-red-600 dark:text-red-400"
                  }`}>
                    {formatCad(selectedMonthData.closing_balance)}
                  </span>
                </div>
              </>
            )}
            <Button onClick={runForecast} disabled={forecastLoading} variant="outline" size="sm" className="self-end">
              {forecastLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {forecastError && (
            <p className="text-sm text-destructive">{forecastError}</p>
          )}

          {forecastResult && (
            <div className="space-y-4">
              <ClusteredColumnChart
                timeline={forecastResult.timeline}
                highlightMonth={selectedMonth}
              />

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Risk Level:</span>
                <Badge className={RISK_COLORS[forecastResult.risk.risk_level]}>
                  {forecastResult.risk.risk_level.toUpperCase()}
                </Badge>
              </div>

              {selectedMonthData ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">
                          {MONTH_NAMES[parseInt(selectedMonth.slice(5)) - 1]} {selectedMonth.slice(0, 4)}
                        </th>
                        <th className="px-3 py-2 text-right font-medium w-28">Partner A</th>
                        <th className="px-3 py-2 text-right font-medium w-28">Partner B</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 text-right font-medium w-24">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening Balance */}
                      <tr className="border-b border-border bg-blue-50/50 dark:bg-blue-950/10">
                        <td className="px-3 py-2 font-medium text-blue-700 dark:text-blue-400">Opening Balance</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-blue-700 dark:text-blue-400">
                          {formatCad(selectedMonthData.opening_balance)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                      </tr>

                      {/* Income */}
                      <tr className="border-b border-border bg-emerald-50/50 dark:bg-emerald-950/10">
                        <td className="px-3 py-2 font-medium text-emerald-700 dark:text-emerald-400">Income</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {partnerCell(incomePartnerTotals.partnerA)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {partnerCell(incomePartnerTotals.partnerB)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-emerald-700 dark:text-emerald-400">
                          + {formatCad(incomePartnerTotals.partnerA + incomePartnerTotals.partnerB)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400">
                          {pctOfIncome(
                            incomePartnerTotals.partnerA + incomePartnerTotals.partnerB,
                            selectedMonthData.income_total,
                          )}
                        </td>
                      </tr>
                      {incomePartnerRows.map((row, idx) => (
                        <tr key={`inc-${row.category}-${idx}`} className="border-b border-border">
                          <td className="px-3 py-1.5 pl-6 text-xs text-muted-foreground">
                            {formatCategory(row.category)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                            {partnerCell(row.partnerA)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                            {partnerCell(row.partnerB)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs">
                            {formatCad(lineTotal(row))}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                            {pctWithinCategory(lineTotal(row), selectedMonthData.income_total)}
                          </td>
                        </tr>
                      ))}

                      {/* Expenses (excluding investment) */}
                      <tr className="border-b border-border bg-red-50/50 dark:bg-red-950/10">
                        <td className="px-3 py-2 font-medium text-red-700 dark:text-red-400">Expenses</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-medium text-red-700 dark:text-red-400">
                          {partnerCell(expensePartnerTotals.partnerA)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-medium text-red-700 dark:text-red-400">
                          {partnerCell(expensePartnerTotals.partnerB)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-red-700 dark:text-red-400">
                          − {formatCad(expensePartnerTotals.partnerA + expensePartnerTotals.partnerB)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-red-700 dark:text-red-400">
                          {pctOfIncome(
                            expensePartnerTotals.partnerA + expensePartnerTotals.partnerB,
                            selectedMonthData.income_total,
                          )}
                        </td>
                      </tr>
                      {expensePartnerRows.map((row, idx) => (
                        <tr key={`exp-${row.category}-${idx}`} className="border-b border-border">
                          <td className="px-3 py-1.5 pl-6 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: getExpenseColor(row.category) }}
                              />
                              {formatCategory(row.category)}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                            {partnerCell(row.partnerA)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                            {partnerCell(row.partnerB)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs">
                            {formatCad(lineTotal(row))}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                            {pctWithinCategory(lineTotal(row), selectedMonthData.expense_total)}
                          </td>
                        </tr>
                      ))}

                      {/* Investment */}
                      {(selectedMonthData.investment_total ?? 0) > 0 && (
                        <>
                          <tr className="border-b border-border bg-blue-50/50 dark:bg-blue-950/10">
                            <td className="px-3 py-2 font-medium text-blue-700 dark:text-blue-400">Investment</td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-medium text-blue-700 dark:text-blue-400">
                              {partnerCell(investmentPartnerTotals.partnerA)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-medium text-blue-700 dark:text-blue-400">
                              {partnerCell(investmentPartnerTotals.partnerB)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-medium text-blue-700 dark:text-blue-400">
                              − {formatCad(investmentPartnerTotals.partnerA + investmentPartnerTotals.partnerB)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-blue-700 dark:text-blue-400">
                              {pctOfIncome(
                                investmentPartnerTotals.partnerA + investmentPartnerTotals.partnerB,
                                selectedMonthData.income_total,
                              )}
                            </td>
                          </tr>
                          {investmentPartnerRows.map((row, idx) => (
                            <tr
                              key={`inv-${row.category}-${idx}`}
                              className="border-b border-border"
                            >
                              <td className="px-3 py-1.5 pl-6 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: getExpenseColor(row.category) }}
                                  />
                                  {formatCategory(row.category)}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                                {partnerCell(row.partnerA)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                                {partnerCell(row.partnerB)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">
                                {formatCad(lineTotal(row))}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                                {pctWithinCategory(
                                  lineTotal(row),
                                  selectedMonthData.investment_total ?? 0,
                                )}
                              </td>
                            </tr>
                          ))}
                        </>
                      )}

                      {/* Closing Balance */}
                      <tr className="border-b border-border bg-blue-50/50 dark:bg-blue-950/10">
                        <td className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-400">Closing Balance</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${
                          selectedMonthData.closing_balance >= 0
                            ? "text-blue-700 dark:text-blue-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {formatCad(selectedMonthData.closing_balance)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                      </tr>

                      {/* Net Cash Flow */}
                      <tr className="border-b border-border bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">Net Cash Flow</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className={`px-3 py-2 text-right font-mono ${
                          selectedMonthData.net_cash_flow >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {selectedMonthData.net_cash_flow >= 0 ? "+" : ""}
                          {formatCad(selectedMonthData.net_cash_flow)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${
                          selectedMonthData.net_cash_flow >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {pctOfIncome(selectedMonthData.net_cash_flow, selectedMonthData.income_total)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Stress Months (total)</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {forecastResult.risk.stress_months.length}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selected month is outside the 6-month forecast window. Choose a month within the range shown in the chart.
                </p>
              )}

              {forecastResult.risk.insights.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Insights</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {forecastResult.risk.insights.map((insight, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground/60">•</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <WhatIfScenarioPanel
        adjustment={adjustment}
        onAdjustmentChange={setAdjustment}
        loading={scenarioLoading}
        error={scenarioError}
        result={scenarioResult}
        onSimulate={runScenario}
      />

    </div>
  );
}

const FORECAST_SECTIONS = [
  { id: "fi-cash-flow", label: "Cash-flow projection", Icon: BarChart3 },
  { id: "fi-what-if", label: "What-if scenarios", Icon: SlidersHorizontal },
  { id: "fi-ai-qa", label: "AI Q&A", Icon: Sparkles },
] as const;

export function ForecastSectionNav() {
  return (
    <nav
      className="flex flex-wrap items-center gap-2"
      aria-label="Jump to forecast sections"
    >
      {FORECAST_SECTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() =>
            document.getElementById(id)?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          }
          className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/60 px-4 py-2 text-sm text-muted-foreground shadow-sm transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-foreground hover:shadow"
        >
          <Icon className="size-3.5 shrink-0" />
          {label}
        </button>
      ))}
    </nav>
  );
}

const WHAT_IF_PRESETS: Array<{ label: string; adjustment: AdjustmentForm }> = [
  {
    label: "$500/mo car payment",
    adjustment: {
      type: "add_expense",
      amount: 500,
      category: "car_payment",
      frequency: "monthly",
    },
  },
  {
    label: "+$200/mo income",
    adjustment: {
      type: "change_income",
      amount: 200,
      category: "side_income",
      frequency: "monthly",
    },
  },
  {
    label: "$3k one-time expense",
    adjustment: {
      type: "add_expense",
      amount: 3000,
      category: "one_time_expense",
      frequency: "one_time",
    },
  },
];

interface WhatIfScenarioPanelProps {
  adjustment: AdjustmentForm;
  onAdjustmentChange: React.Dispatch<React.SetStateAction<AdjustmentForm>>;
  loading: boolean;
  error: string | null;
  result: ScenarioResult | null;
  onSimulate: () => void;
}

function WhatIfScenarioPanel({
  adjustment,
  onAdjustmentChange,
  loading,
  error,
  result,
  onSimulate,
}: WhatIfScenarioPanelProps) {
  return (
    <div
      id="fi-what-if"
      className="glass-card glow-border scroll-mt-32 overflow-hidden rounded-2xl border-emerald-500/25"
    >
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent px-5 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
          <SlidersHorizontal className="size-3.5" />
        </span>
        <h2 className="font-semibold tracking-tight">What-If Scenario</h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1">
            <label htmlFor="adj-type" className="text-xs text-muted-foreground">
              Adjustment
            </label>
            <select
              id="adj-type"
              value={adjustment.type}
              onChange={(e) =>
                onAdjustmentChange((a) => ({
                  ...a,
                  type: e.target.value as AdjustmentType,
                }))
              }
              className="h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
            >
              <option value="add_expense">Add expense</option>
              <option value="change_income">Change income</option>
            </select>
          </div>

          <div className="flex min-w-[6rem] flex-1 flex-col gap-1">
            <label htmlFor="adj-amount" className="text-xs text-muted-foreground">
              Amount (CAD)
            </label>
            <input
              id="adj-amount"
              type="number"
              value={adjustment.amount}
              onChange={(e) =>
                onAdjustmentChange((a) => ({
                  ...a,
                  amount: Number(e.target.value),
                }))
              }
              className="h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
            />
          </div>

          <div className="flex min-w-[7rem] flex-1 flex-col gap-1">
            <label htmlFor="adj-category" className="text-xs text-muted-foreground">
              Category
            </label>
            <input
              id="adj-category"
              type="text"
              value={adjustment.category}
              onChange={(e) =>
                onAdjustmentChange((a) => ({ ...a, category: e.target.value }))
              }
              className="h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
            />
          </div>

          <div className="flex min-w-[7rem] flex-1 flex-col gap-1">
            <label htmlFor="adj-frequency" className="text-xs text-muted-foreground">
              Frequency
            </label>
            <select
              id="adj-frequency"
              value={adjustment.frequency}
              onChange={(e) =>
                onAdjustmentChange((a) => ({
                  ...a,
                  frequency: e.target.value as AdjustmentForm["frequency"],
                }))
              }
              className="h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
              <option value="one_time">One-time</option>
            </select>
          </div>

          <Button
            onClick={onSimulate}
            disabled={loading}
            className="h-10 shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md shadow-emerald-500/20"
          >
            {loading ? "Simulating…" : "Simulate"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {WHAT_IF_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={loading}
              onClick={() => onAdjustmentChange(preset.adjustment)}
              className="rounded-full border border-border/80 bg-background/60 px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-foreground hover:shadow disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {result ? (
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">Baseline</h4>
                  <Badge className={RISK_COLORS[result.baseline.risk.risk_level]}>
                    {result.baseline.risk.risk_level}
                  </Badge>
                </div>
                <ClusteredColumnChart timeline={result.baseline.timeline} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">Scenario</h4>
                  <Badge className={RISK_COLORS[result.scenario.risk.risk_level]}>
                    {result.scenario.risk.risk_level}
                  </Badge>
                </div>
                <ClusteredColumnChart timeline={result.scenario.timeline} />
              </div>
            </div>

            <div className="rounded-md border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Net Difference (Scenario vs Baseline)</span>
                <span
                  className={`font-mono text-sm font-semibold ${
                    result.comparison.net_difference >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {result.comparison.net_difference >= 0 ? "+" : ""}
                  {formatCad(result.comparison.net_difference)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Baseline Net</th>
                    <th className="px-3 py-2 text-right font-medium">Scenario Net</th>
                    <th className="px-3 py-2 text-right font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {result.baseline.timeline.map((bMonth, i) => {
                    const sMonth = result.scenario.timeline[i];
                    const diff = (sMonth?.net_cash_flow ?? 0) - bMonth.net_cash_flow;
                    return (
                      <tr key={bMonth.month} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{bMonth.month}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">
                          {formatCad(bMonth.net_cash_flow)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">
                          {formatCad(sMonth?.net_cash_flow ?? 0)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono text-xs ${
                            diff >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {diff >= 0 ? "+" : ""}
                          {formatCad(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatInput() {
  const router = useRouter();
  const { provider, cloudSttAvailable } = useAiProvider();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/scenario-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          user_id: "default",
          current_cash: 0,
          events: [],
          months: 6,
          use_llm: true,
          ai_provider: provider,
        }),
      });
      const raw = await res.text();
      let json: {
        success?: boolean;
        data?: unknown;
        error?: { message?: string };
      };
      try {
        json = JSON.parse(raw) as typeof json;
      } catch {
        const hint =
          raw.trimStart().startsWith("<!DOCTYPE") ||
          raw.trimStart().startsWith("<html")
            ? `Server returned HTML (${res.status}). The scenario-chat API may be unavailable on this deployment.`
            : `Invalid JSON response (${res.status}).`;
        setError(hint);
        return;
      }
      if (json.success && json.data) {
        sessionStorage.setItem("chat_result", JSON.stringify({
          question: trimmed,
          data: json.data,
        }));
        router.push(`/simulation/chat-result?t=${Date.now()}`);
        return;
      }
      setError(
        json.error?.message ??
          `Request failed (${res.status}). Check your API keys and try again.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reach the server",
      );
    } finally {
      setSending(false);
    }
  }

  const suggestions = [
    "What's my balance trend?",
    "Can I afford a $500/month car payment?",
    "Average increase % over next 3 months?",
  ];

  return (
    <div
      id="fi-ai-qa"
      className="glass-card glow-border scroll-mt-32 overflow-hidden rounded-2xl border-emerald-500/25"
    >
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent px-5 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
          <Sparkles className="size-3.5" />
        </span>
        <h2 className="font-semibold tracking-tight">Ask AI about your finances</h2>
      </div>
      <div className="p-5">
        <form onSubmit={handleAsk} className="flex items-center gap-2.5">
          <GoogleVoiceAskButton
            disabled={sending}
            onTranscript={(text) => {
              setQuestion(text);
              setVoiceError(null);
            }}
            onError={setVoiceError}
          />
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Total expenses in June 2026? Can I afford a $3000 vacation?"
            className="min-h-[44px] flex-1 resize-none border-border/80 bg-background/50 py-2.5"
            rows={1}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md shadow-emerald-500/20"
            disabled={sending || !question.trim()}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizonal className="size-4" />
            )}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {provider === "gemini"
            ? "Voice (Gemini): uses Google speech. Free tier has daily quotas."
            : cloudSttAvailable
              ? "Voice (Claude): cloud Whisper via OpenAI (~$0.006/min). Set a real OPENAI_API_KEY in apps/web/.env if you see quota errors."
              : "Voice (Claude): local Whisper on your PC. Click mic, speak 3+ seconds, click again. Add OPENAI_API_KEY in apps/web/.env for reliable paid cloud voice."}
        </p>
        {voiceError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {voiceError}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={sending}
              onClick={() => setQuestion(s)}
              className="rounded-full border border-border/80 bg-background/60 px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-foreground hover:shadow disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
