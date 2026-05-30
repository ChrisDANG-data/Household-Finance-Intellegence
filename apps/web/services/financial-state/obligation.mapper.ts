import type { DbFinancialObligation } from "@/lib/prisma-types";

import type { FinancialEvent, FinancialEventFrequency } from "./types";

const FREQUENCIES: FinancialEventFrequency[] = [
  "monthly",
  "weekly",
  "yearly",
  "quarterly",
  "one_time",
];

export function isValidFrequency(
  value: string,
): value is FinancialEventFrequency {
  return FREQUENCIES.includes(value as FinancialEventFrequency);
}

export function obligationToFinancialEvent(
  obligation: DbFinancialObligation,
): FinancialEvent {
  return {
    id: obligation.id,
    type: "recurring_expense",
    category: obligation.category,
    amount: Number(obligation.amount),
    currency: obligation.currency,
    frequency: obligation.frequency as FinancialEventFrequency,
    start_date: obligation.startDate,
    end_date: obligation.endDate,
    confidence: 1,
    source_document_id: obligation.sourceDocumentId,
    metadata: {
      contract_name: obligation.name,
      is_fixed: true,
    },
  };
}
