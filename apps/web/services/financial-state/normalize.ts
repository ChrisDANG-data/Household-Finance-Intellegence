import { randomUUID } from "node:crypto";

import {
  DEFAULT_CURRENCY,
  type FinancialEvent,
  type FinancialEventFrequency,
  type FinancialEventMetadata,
  type FinancialEventOwner,
  type FinancialEventType,
  type RawFinancialEvent,
} from "./types";

const VALID_TYPES: FinancialEventType[] = [
  "income",
  "recurring_expense",
  "one_time_expense",
  "liability",
  "asset",
  "investment",
];

const VALID_FREQUENCIES: FinancialEventFrequency[] = [
  "monthly",
  "weekly",
  "yearly",
  "quarterly",
  "one_time",
];

const VALID_OWNERS: FinancialEventOwner[] = [
  "partner_a",
  "partner_b",
  "joint",
];

const TYPE_ALIASES: Record<string, FinancialEventType> = {
  income: "income",
  salary: "income",
  recurring_expense: "recurring_expense",
  expense: "recurring_expense",
  recurring: "recurring_expense",
  one_time_expense: "one_time_expense",
  one_time: "one_time_expense",
  onetime: "one_time_expense",
  liability: "liability",
  debt: "liability",
  loan: "liability",
  asset: "asset",
  investment: "investment",
};

const FREQUENCY_ALIASES: Record<string, FinancialEventFrequency> = {
  monthly: "monthly",
  month: "monthly",
  weekly: "weekly",
  week: "weekly",
  yearly: "yearly",
  annual: "yearly",
  year: "yearly",
  quarterly: "quarterly",
  quarter: "quarterly",
  one_time: "one_time",
  once: "one_time",
  onetime: "one_time",
};

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function normalizeType(raw: unknown): FinancialEventType {
  if (typeof raw !== "string" || !raw.trim()) {
    return "one_time_expense";
  }
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = TYPE_ALIASES[key];
  if (mapped) return mapped;
  if (VALID_TYPES.includes(key as FinancialEventType)) {
    return key as FinancialEventType;
  }
  return "one_time_expense";
}

function normalizeFrequency(raw: unknown): FinancialEventFrequency {
  if (typeof raw !== "string" || !raw.trim()) {
    return "one_time";
  }
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = FREQUENCY_ALIASES[key];
  if (mapped) return mapped;
  if (VALID_FREQUENCIES.includes(key as FinancialEventFrequency)) {
    return key as FinancialEventFrequency;
  }
  return "one_time";
}

function utcDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/**
 * Parses string or Date into UTC midnight Date. Returns null if invalid.
 */
export function parseToDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return utcDateOnly(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    );
  }

  if (typeof value !== "string" || !value.trim()) return null;

  const trimmed = value.trim();

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMonth = /^(\d{4})-(\d{2})$/;

  let match = isoDate.exec(trimmed);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    const d = Number(match[3]);
    const date = utcDateOnly(y, m, d);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  match = isoMonth.exec(trimmed);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    const date = utcDateOnly(y, m, 1);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;

  const d = new Date(parsed);
  return utcDateOnly(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return "uncategorized";
  }
  return raw.trim().toLowerCase();
}

function normalizeMetadata(raw: unknown): FinancialEventMetadata {
  if (!raw || typeof raw !== "object") {
    return { is_fixed: false };
  }
  const base = raw as Record<string, unknown>;
  return {
    merchant: typeof base.merchant === "string" ? base.merchant : undefined,
    contract_name:
      typeof base.contract_name === "string" ? base.contract_name : undefined,
    is_fixed: typeof base.is_fixed === "boolean" ? base.is_fixed : false,
  };
}

function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function normalizeOwner(raw: unknown): FinancialEventOwner {
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
    if (VALID_OWNERS.includes(v as FinancialEventOwner)) {
      return v as FinancialEventOwner;
    }
    if (v === "partnera" || v === "a") return "partner_a";
    if (v === "partnerb" || v === "b") return "partner_b";
  }
  return "partner_a";
}

function normalizeCurrency(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toUpperCase();
  }
  return DEFAULT_CURRENCY;
}

function normalizeSingleEvent(raw: RawFinancialEvent): FinancialEvent | null {
  const amount = parseAmount(raw.amount);
  if (amount === null) return null;

  const start_date = parseToDate(raw.start_date);
  if (!start_date) return null;

  let end_date: Date | null = parseToDate(raw.end_date);
  if (end_date && end_date.getTime() < start_date.getTime()) {
    end_date = null;
  }

  const type = normalizeType(raw.type);
  const frequency = normalizeFrequency(raw.frequency);

  const source_document_id =
    typeof raw.source_document_id === "string" && raw.source_document_id.trim()
      ? raw.source_document_id.trim()
      : raw.source_document_id === null
        ? null
        : undefined;

  return {
    id:
      typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : randomUUID(),
    type,
    category: normalizeCategory(raw.category),
    amount,
    currency: normalizeCurrency(raw.currency),
    frequency,
    start_date,
    end_date: end_date ?? undefined,
    owner: normalizeOwner(raw.owner),
    confidence: clampConfidence(raw.confidence),
    source_document_id: source_document_id ?? undefined,
    metadata: normalizeMetadata(raw.metadata),
  };
}

/**
 * Converts raw AI/import rows into canonical FinancialEvent records.
 * Drops malformed rows instead of throwing — deterministic and pure.
 */
export function normalizeFinancialEvents(
  input: RawFinancialEvent[],
): FinancialEvent[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: FinancialEvent[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const event = normalizeSingleEvent(raw);
    if (event) normalized.push(event);
  }

  return normalized;
}

/** @deprecated Use normalizeFinancialEvents */
export const normalizeEvents = normalizeFinancialEvents;
