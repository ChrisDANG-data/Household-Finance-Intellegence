import {
  frequencyAppliesInMonth,
  monthlyEquivalentAmount,
} from "@/services/financial-state/projection";
import {
  DEFAULT_USER_ID,
  financialStatePersistence,
} from "@/services/financial-state/financial-state.persistence";
import { OWNER_LABELS } from "@/services/financial-state/types";
import type {
  FinancialEvent,
  FinancialEventOwner,
} from "@/services/financial-state/types";
import { currentUtcMonth } from "@/services/financial-state/dates";

import { extractTargetMonth, monthLabel } from "./monthly-lookup";

const INCOME_QUERY =
  /\b(income|salary|salaries|earn|earnings|take.?home|paycheque|paycheck)\b/i;
const EXPENSE_QUERY =
  /\b(expense|expenses|spend|spending|cost|costs|payment|payments)\b/i;

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatLine(category: string, amount: number): string {
  const label = category.replace(/_/g, " ").padEnd(22, " ");
  return `• ${label}${formatMoney(amount)}`;
}

function parsePartner(message: string): FinancialEventOwner | null {
  const lower = message.toLowerCase();
  if (/\bpartner\s*b\b|\bpartner\s*b's\b|\bpartner_b\b/.test(lower)) {
    return "partner_b";
  }
  if (/\bpartner\s*a\b|\bpartner\s*a's\b|\bpartner_a\b/.test(lower)) {
    return "partner_a";
  }
  if (/\bjoint\b|\bboth\s+partners\b/.test(lower)) {
    return "joint";
  }
  return null;
}

function partnerShare(
  owner: FinancialEventOwner,
  target: FinancialEventOwner,
  amount: number,
): number {
  if (target === "joint") {
    if (owner === "joint") return amount;
    return 0;
  }
  if (owner === "joint") return amount / 2;
  if (owner === target) return amount;
  return 0;
}

/** Recurring monthly-equivalent for income (excludes one-time unless month-specific). */
function steadyMonthlyIncome(event: FinancialEvent, forMonth: string | null): number {
  if (event.type !== "income") return 0;

  if (forMonth) {
    if (!frequencyAppliesInMonth(event, forMonth)) return 0;
    if (event.frequency === "weekly") {
      return monthlyEquivalentAmount(event.amount, "weekly");
    }
    return event.amount;
  }

  switch (event.frequency) {
    case "monthly":
      return event.amount;
    case "weekly":
      return monthlyEquivalentAmount(event.amount, "weekly");
    case "yearly":
      return event.amount / 12;
    case "quarterly":
      return event.amount / 3;
    case "one_time":
      return 0;
    default:
      return event.amount;
  }
}

function steadyMonthlyExpense(event: FinancialEvent, forMonth: string | null): number {
  const isExpense =
    event.type === "recurring_expense" ||
    event.type === "one_time_expense" ||
    event.type === "liability" ||
    event.type === "investment";

  if (!isExpense) return 0;

  if (forMonth) {
    if (!frequencyAppliesInMonth(event, forMonth)) return 0;
    if (event.frequency === "weekly") {
      return monthlyEquivalentAmount(event.amount, "weekly");
    }
    return event.amount;
  }

  switch (event.frequency) {
    case "monthly":
      return event.amount;
    case "weekly":
      return monthlyEquivalentAmount(event.amount, "weekly");
    case "yearly":
      return event.amount / 12;
    case "quarterly":
      return event.amount / 3;
    case "one_time":
      return 0;
    default:
      return event.amount;
  }
}

function isPartnerLedgerQuery(message: string): boolean {
  const partner = parsePartner(message);
  if (!partner) return false;
  return INCOME_QUERY.test(message) || EXPENSE_QUERY.test(message);
}

/**
 * Deterministic Partner A/B income or expense from ledger (owner field).
 */
export async function tryPartnerLedgerAnswer(
  message: string,
  userId: string = DEFAULT_USER_ID,
): Promise<string | null> {
  if (!isPartnerLedgerQuery(message)) return null;

  const partner = parsePartner(message);
  if (!partner) return null;

  const targetMonth = extractTargetMonth(message);
  const refMonth = targetMonth ?? currentUtcMonth();
  const state = await financialStatePersistence.loadState(
    userId,
    refMonth,
  );

  const wantsIncome = INCOME_QUERY.test(message);
  const wantsExpense = EXPENSE_QUERY.test(message);
  const partnerLabel = OWNER_LABELS[partner];

  const lines: string[] = [];
  let total = 0;

  for (const event of state.events) {
    let base = 0;
    if (wantsIncome && !wantsExpense) {
      base = steadyMonthlyIncome(event, targetMonth);
    } else if (wantsExpense && !wantsIncome) {
      base = steadyMonthlyExpense(event, targetMonth);
    } else {
      base =
        steadyMonthlyIncome(event, targetMonth) ||
        steadyMonthlyExpense(event, targetMonth);
    }

    const share = partnerShare(event.owner, partner, base);
    if (share <= 0) continue;

    total += share;
    lines.push(formatLine(event.category, share));
  }

  const periodLabel = targetMonth
    ? monthLabel(targetMonth)
    : "monthly (recurring equivalent)";
  const kindLabel = wantsIncome && !wantsExpense ? "income" : wantsExpense && !wantsIncome ? "expenses" : "cash flows";

  if (lines.length === 0) {
    return `No ${kindLabel} recorded for ${partnerLabel} in your ledger${targetMonth ? ` for ${monthLabel(targetMonth)}` : ""}.`;
  }

  const header = `${partnerLabel} ${kindLabel} — ${periodLabel}:`;
  return `${header}\n\n${lines.join("\n")}\n\nTotal: ${formatMoney(total)}`;
}
