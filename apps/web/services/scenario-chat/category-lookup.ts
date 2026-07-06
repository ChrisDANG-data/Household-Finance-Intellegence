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

const RECURRING_FREQUENCIES = new Set([
  "monthly",
  "weekly",
  "quarterly",
  "yearly",
]);

/** Last scheduled payment: contract end for recurring streams, payment date for one-time. */
function lastPaymentDateForEvent(event: FinancialEvent): Date | null {
  if (RECURRING_FREQUENCIES.has(event.frequency)) {
    return event.end_date ?? null;
  }
  return event.start_date;
}

function latestLastPaymentDate(events: FinancialEvent[]): Date | null {
  let latest: Date | null = null;
  for (const event of events) {
    const paymentDate = lastPaymentDateForEvent(event);
    if (!paymentDate) continue;
    if (!latest || paymentDate > latest) latest = paymentDate;
  }
  return latest;
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
  for (const phrase of KNOWN_CATEGORY_PHRASES) {
    if (normalized.includes(phrase)) return phrase;
  }
  if (normalized.includes("house insurance")) return "house insurance";
  const match = normalized.match(
    /\b(?:my|the)\s+([a-z][\w\s]{0,30}?)(?:\s+payment|\s+in\s)/i,
  );
  if (match?.[1]) return match[1].trim();
  return "matching";
}

function isCoveragePeriodQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\bwhat(?:'s| is) the last month\b/.test(lower) ||
    /\b(last|final|end)\s+month\b/.test(lower) ||
    /\btermination date\b/.test(lower) ||
    /\bwhen does\b.*\b(end|expire|finish)\b/.test(lower)
  );
}

function isLastPaymentDateQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  if (/\bhow much\b/.test(lower) && !/\bwhen\b/.test(lower)) return false;
  return (
    /\b(last|final)\s+payment\b/.test(lower) ||
    /\bwhen\b.*\b(last|final)\b.*\bpayment\b/.test(lower) ||
    (/\bwhen will\b/.test(lower) &&
      /\bpayment\b/.test(lower) &&
      /\b(last|final)\b/.test(lower))
  );
}

function monthKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Answer "last month of car insurance" style questions from event end dates (no LLM).
 */
export async function tryCategoryCoverageAnswer(
  message: string,
  userId: string = DEFAULT_USER_ID,
): Promise<string | null> {
  if (!isCoveragePeriodQuestion(message)) return null;

  const state = await financialStatePersistence.loadState(userId);
  let matches = state.events.filter((e) => eventMatchesQuery(e, message));
  matches = dedupeEvents(matches);

  if (matches.length === 0) return null;

  const withEnd = matches.filter((e) => e.end_date);

  if (withEnd.length === 0) {
    const latestStart = matches.reduce((current, candidate) =>
      candidate.start_date > current.start_date ? candidate : current,
    );
    const category = latestStart.category.replace(/_/g, " ");
    return (
      `The last month of ${category} coverage is ${monthLabel(monthKeyFromDate(latestStart.start_date))} ` +
      `(last recorded payment ${formatDate(latestStart.start_date)}).`
    );
  }

  const latest = withEnd.reduce((current, candidate) =>
    candidate.end_date! > current.end_date! ? candidate : current,
  );
  const endDate = latest.end_date!;
  const category = latest.category.replace(/_/g, " ");

  return (
    `The last month of ${category} coverage is ${monthLabel(monthKeyFromDate(endDate))} ` +
    `(contract ends ${formatDate(endDate)}).`
  );
}

/**
 * Answer "when is the last house insurance payment" with the latest payment date only.
 */
export async function tryLastPaymentDateAnswer(
  message: string,
  userId: string = DEFAULT_USER_ID,
): Promise<string | null> {
  if (!isLastPaymentDateQuestion(message)) return null;

  const state = await financialStatePersistence.loadState(userId);
  let matches = state.events.filter((e) => eventMatchesQuery(e, message));
  matches = dedupeEvents(matches);

  if (matches.length === 0) return null;

  const latestDate = latestLastPaymentDate(matches);
  if (!latestDate) {
    const label = categoryLabelFromMessage(message);
    return `No end date scheduled — ${label} payments are ongoing.`;
  }

  return formatDate(latestDate);
}

/**
 * Answer category-specific payment questions from ledger events (no LLM).
 * Respects month + frequency (quarterly, one-time, etc.) like the forecast engine.
 */
export async function tryCategoryPaymentAnswer(
  message: string,
  userId: string = DEFAULT_USER_ID,
): Promise<string | null> {
  if (
    /\b(can i afford|could i afford|afford another|do i have enough|what if)\b/i.test(
      message,
    )
  ) {
    return null;
  }

  if (isLastPaymentDateQuestion(message)) return null;

  if (!PAYMENT_QUERY.test(message)) return null;

  const targetMonth = extractTargetMonth(message);
  const state = await financialStatePersistence.loadState(
    userId,
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
