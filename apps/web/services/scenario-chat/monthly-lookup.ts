import {
  monthlyEquivalentAmount,
  projectMonth,
} from "@/services/financial-state/projection";
import {
  DEFAULT_USER_ID,
  financialStatePersistence,
} from "@/services/financial-state/financial-state.persistence";
import type { FinancialEvent } from "@/services/financial-state/types";

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function extractTargetMonth(message: string): string | null {
  const iso = message.match(/\b(20\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const lower = message.toLowerCase();
  for (let i = 0; i < 12; i++) {
    const name = MONTH_NAMES[i];
    const patterns = [
      new RegExp(`\\b${name}\\s+(20\\d{2})\\b`, "i"),
      new RegExp(`\\b${name}\\b[^\\d]{0,20}(20\\d{2})\\b`, "i"),
    ];
    for (const re of patterns) {
      const match = lower.match(re);
      if (match) {
        return `${match[1]}-${String(i + 1).padStart(2, "0")}`;
      }
    }
  }

  // Month name only — default to current calendar year (e.g. "in June" → 2026-06)
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const defaultYear = yearMatch
    ? yearMatch[1]
    : String(new Date().getUTCFullYear());

  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b${MONTH_NAMES[i]}\\b`, "i").test(lower)) {
      return `${defaultYear}-${String(i + 1).padStart(2, "0")}`;
    }
  }

  return null;
}

export function monthLabel(month: string): string {
  const idx = parseInt(month.slice(5), 10) - 1;
  return `${MONTH_LABELS[idx] ?? month} ${month.slice(0, 4)}`;
}

function isMonthlyAggregationQuery(message: string): boolean {
  const month = extractTargetMonth(message);
  if (!month) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("total") ||
    lower.includes("expense") ||
    lower.includes("income") ||
    lower.includes("cash flow") ||
    lower.includes("net cash") ||
    lower.includes("how much") ||
    lower.includes("breakdown") ||
    lower.includes("payment")
  );
}

function eventAmountForMonth(event: FinancialEvent): number {
  if (event.frequency === "weekly") {
    return monthlyEquivalentAmount(event.amount, "weekly");
  }
  return event.amount;
}

function formatMoney(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatLine(category: string, amount: number): string {
  const label = category.padEnd(25, " ");
  const signed =
    amount >= 0 ? formatMoney(amount) : formatMoney(amount);
  return `• ${label}${signed}`;
}

type QueryKind = "net_cash_flow" | "expenses" | "income";

function detectQueryKind(message: string): QueryKind {
  const lower = message.toLowerCase();
  if (lower.includes("net cash") || lower.includes("cash flow")) {
    return "net_cash_flow";
  }
  if (lower.includes("expense")) return "expenses";
  if (lower.includes("income")) return "income";
  return "net_cash_flow";
}

/**
 * Deterministic month summary from projection engine (same logic as Forecast Simulation).
 * Returns null when the message is not a month-specific aggregation query.
 */
export async function tryDeterministicMonthAnswer(
  message: string,
): Promise<string | null> {
  if (!isMonthlyAggregationQuery(message)) return null;

  const targetMonth = extractTargetMonth(message);
  if (!targetMonth) return null;

  const state = await financialStatePersistence.loadState(
    DEFAULT_USER_ID,
    targetMonth,
  );
  const entry = projectMonth(state, targetMonth, 0);
  const kind = detectQueryKind(message);
  const label = monthLabel(targetMonth);

  const incomeLines: string[] = [];
  const expenseLines: string[] = [];
  const investmentLines: string[] = [];

  for (const event of entry.active_events) {
    const amount = eventAmountForMonth(event);
    if (amount <= 0) continue;

    if (event.type === "income") {
      incomeLines.push(formatLine(event.category, amount));
    } else if (event.type === "investment") {
      investmentLines.push(formatLine(event.category, -amount));
    } else if (
      event.type === "recurring_expense" ||
      event.type === "one_time_expense" ||
      event.type === "liability"
    ) {
      expenseLines.push(formatLine(event.category, -amount));
    }
  }

  const lines: string[] = [];

  if (kind === "income") {
    lines.push(`Total income in ${label}: ${formatMoney(entry.income_total)}`);
    lines.push(...incomeLines);
    return lines.join("\n\n");
  }

  if (kind === "expenses") {
    const totalOut =
      entry.expense_total + entry.investment_total;
    lines.push(
      `Total expenses in ${label}: ${formatMoney(totalOut)}`,
    );
    lines.push(...expenseLines, ...investmentLines);
    return lines.join("\n\n");
  }

  // net cash flow — full breakdown
  lines.push(
    `Total net cash flow in ${label}: ${formatMoney(entry.net_cash_flow)}`,
  );
  const breakdown = [
    ...incomeLines,
    ...expenseLines,
    ...investmentLines,
  ];
  if (breakdown.length > 0) {
    lines.push(breakdown.join("\n"));
  }
  return lines.join("\n\n");
}
