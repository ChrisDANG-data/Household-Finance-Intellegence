import { shouldListAsActiveEvent } from "@/services/financial-state/projection";
import {
  DEFAULT_USER_ID,
  financialStatePersistence,
} from "@/services/financial-state/financial-state.persistence";
import type { FinancialEvent } from "@/services/financial-state/types";

import { extractTargetMonth, monthLabel } from "./monthly-lookup";

const PAYMENT_QUERY =
  /\b(payment|pay|amount|cost|fee|premium|charge|how much|what is my|what's my)\b/i;

const MONTH_NAMES = new Set([
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
]);

const KNOWN_CATEGORY_PHRASES = [
  "house insurance",
  "home insurance",
  "car insurance",
  "property tax",
  "car lease",
] as const;

/** Terms the user is asking about (e.g. house + insurance), not bare "insurance". */
function queryCategoryTerms(message: string): string[] {
  const normalized = message.toLowerCase().replace(/[^\w\s]/g, " ");

  for (const phrase of KNOWN_CATEGORY_PHRASES) {
    if (normalized.includes(phrase)) {
      return phrase.split(/\s+/).filter((w) => w.length > 1);
    }
  }

  const match = normalized.match(
    /\b(?:my|the)\s+([a-z][a-z\s]*?)(?:\s+payment|\s+in\s|\?|$)/i,
  );
  if (match?.[1]) {
    return match[1]
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !MONTH_NAMES.has(w));
  }

  return [];
}

function categoryTokens(category: string): string[] {
  return category
    .toLowerCase()
    .replace(/_/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eventMatchesQuery(event: FinancialEvent, message: string): boolean {
  const terms = queryCategoryTerms(message);
  const catTokens = categoryTokens(event.category);
  const catSlug = event.category.toLowerCase();

  if (terms.length > 0) {
    return terms.every(
      (term) => catTokens.includes(term) || catSlug.includes(term),
    );
  }

  const normalized = message.toLowerCase().replace(/[^\w\s]/g, " ");
  const cat = event.category.toLowerCase().replace(/_/g, " ");

  if (cat.length > 0 && normalized.includes(cat)) {
    return true;
  }

  return (
    catTokens.length > 0 && catTokens.every((w) => normalized.includes(w))
  );
}

function dedupeEvents(events: FinancialEvent[]): FinancialEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = [
      event.category,
      event.amount,
      event.frequency,
      formatDate(event.start_date),
      event.end_date ? formatDate(event.end_date) : "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatEventLine(event: FinancialEvent): string {
  const label = event.category.replace(/_/g, " ");
  const amount = formatMoney(event.amount, event.currency);
  const start = formatDate(event.start_date);
  const end = event.end_date ? formatDate(event.end_date) : "ongoing";
  const freq =
    event.frequency === "one_time"
      ? "one-time"
      : event.frequency.replace(/_/g, " ");

  return `• ${label.padEnd(22)} ${amount} (${freq}, ${start} → ${end})`;
}

function categoryLabelFromMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("house insurance")) return "house insurance";
  const match = normalized.match(
    /\b(?:my|the)\s+([a-z][\w\s]{0,30}?)(?:\s+payment|\s+in\s)/i,
  );
  if (match?.[1]) return match[1].trim();
  return "matching";
}

/**
 * Answer category-specific payment questions from ledger events (no LLM).
 * Respects month + frequency (quarterly, one-time, etc.) like the forecast engine.
 */
export async function tryCategoryPaymentAnswer(
  message: string,
): Promise<string | null> {
  if (!PAYMENT_QUERY.test(message)) return null;

  const targetMonth = extractTargetMonth(message);
  const state = await financialStatePersistence.loadState(
    DEFAULT_USER_ID,
    targetMonth ?? undefined,
  );

  let matches = state.events.filter((e) => eventMatchesQuery(e, message));
  matches = dedupeEvents(matches);

  if (targetMonth) {
    matches = matches.filter((e) => shouldListAsActiveEvent(e, targetMonth));

    if (matches.length === 0) {
      const label = categoryLabelFromMessage(message);
      return `No ${label} payment in ${monthLabel(targetMonth)}.`;
    }

    const lines = matches.map(formatEventLine);
    const header =
      matches.length === 1
        ? `Payment in ${monthLabel(targetMonth)}:`
        : `${matches.length} payments in ${monthLabel(targetMonth)}:`;

    return `${header}\n\n${lines.join("\n")}`;
  }

  if (matches.length === 0) return null;

  const lines = matches.map(formatEventLine);
  const header =
    matches.length === 1
      ? "Payment from your ledger:"
      : `${matches.length} matching payments from your ledger:`;

  return `${header}\n\n${lines.join("\n")}`;
}
