/**
 * Canonical financial event model — single source of truth for normalized data.
 * Pure types only; no AI, no database, no side effects.
 */

export const DEFAULT_CURRENCY = "CAD" as const;

export type FinancialEventType =
  | "income"
  | "recurring_expense"
  | "one_time_expense"
  | "liability"
  | "asset"
  | "investment";

export type FinancialEventFrequency =
  | "monthly"
  | "weekly"
  | "yearly"
  | "quarterly"
  | "one_time";

export type FinancialEventOwner = "partner_a" | "partner_b" | "joint";

export const FINANCIAL_EVENT_OWNERS: FinancialEventOwner[] = [
  "partner_a",
  "partner_b",
  "joint",
];

export const OWNER_LABELS: Record<FinancialEventOwner, string> = {
  partner_a: "Partner A",
  partner_b: "Partner B",
  joint: "Joint",
};

export interface FinancialEventMetadata {
  merchant?: string;
  contract_name?: string;
  is_fixed?: boolean;
}

export interface FinancialEvent {
  id: string;
  type: FinancialEventType;
  category: string;
  amount: number;
  currency: string;
  frequency: FinancialEventFrequency;
  start_date: Date;
  end_date?: Date | null;
  event_date?: Date | null;
  account_in?: string | null;
  account_out?: string | null;
  owner: FinancialEventOwner;
  confidence: number;
  source_document_id?: string | null;
  metadata: FinancialEventMetadata;
}

/**
 * Imperfect input from AI extraction or imports — normalized by normalizeFinancialEvents().
 */
export interface RawFinancialEvent {
  id?: string;
  type?: string;
  category?: string;
  amount?: number;
  currency?: string;
  frequency?: string;
  start_date?: string | Date;
  end_date?: string | Date | null;
  event_date?: string | Date | null;
  account_in?: string | null;
  account_out?: string | null;
  owner?: string;
  confidence?: number;
  source_document_id?: string | null;
  metadata?: Record<string, unknown>;
}
