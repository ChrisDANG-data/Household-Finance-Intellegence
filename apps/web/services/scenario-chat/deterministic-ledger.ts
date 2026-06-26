import type { FinancialState } from "@/services/financial-state/state.types";

import { tryCategoryCoverageAnswer, tryCategoryPaymentAnswer, tryLastPaymentDateAnswer } from "./category-lookup";
import { tryDeterministicMonthAnswer } from "./monthly-lookup";
import { tryPartnerLedgerAnswer } from "./partner-ledger-lookup";
import { tryPlaidBalanceAnswer } from "./plaid-balance-lookup";

export interface DeterministicLedgerOptions {
  state?: FinancialState;
  startMonth?: string;
  forecastMonths?: number;
}

/**
 * Fast ledger paths with no LLM — partner, category payment, monthly totals.
 */
export async function tryDeterministicLedgerAnswer(
  message: string,
  options?: DeterministicLedgerOptions,
): Promise<string | null> {
  const coverageAnswer = await tryCategoryCoverageAnswer(message);
  if (coverageAnswer) return coverageAnswer;

  const lastPaymentAnswer = await tryLastPaymentDateAnswer(message);
  if (lastPaymentAnswer) return lastPaymentAnswer;

  const partnerAnswer = await tryPartnerLedgerAnswer(message);
  if (partnerAnswer) return partnerAnswer;

  const monthAnswer = await tryDeterministicMonthAnswer(message, options);
  if (monthAnswer) return monthAnswer;

  const plaidAnswer = await tryPlaidBalanceAnswer(message);
  if (plaidAnswer) return plaidAnswer;

  const categoryAnswer = await tryCategoryPaymentAnswer(message);
  if (categoryAnswer) return categoryAnswer;

  return null;
}
