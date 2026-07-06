import type { FinancialState } from "@/services/financial-state/state.types";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

import { tryCategoryCoverageAnswer, tryCategoryPaymentAnswer, tryLastPaymentDateAnswer } from "./category-lookup";
import { tryDeterministicMonthAnswer } from "./monthly-lookup";
import { tryPartnerLedgerAnswer } from "./partner-ledger-lookup";
import { tryPlaidBalanceAnswer } from "./plaid-balance-lookup";

export interface DeterministicLedgerOptions {
  state?: FinancialState;
  startMonth?: string;
  forecastMonths?: number;
  userId?: string;
}

function resolveUserId(options?: DeterministicLedgerOptions): string {
  return options?.state?.user_id ?? options?.userId ?? DEFAULT_USER_ID;
}

/**
 * Fast ledger paths with no LLM — partner, category payment, monthly totals.
 */
export async function tryDeterministicLedgerAnswer(
  message: string,
  options?: DeterministicLedgerOptions,
): Promise<string | null> {
  const userId = resolveUserId(options);

  const coverageAnswer = await tryCategoryCoverageAnswer(message, userId);
  if (coverageAnswer) return coverageAnswer;

  const lastPaymentAnswer = await tryLastPaymentDateAnswer(message, userId);
  if (lastPaymentAnswer) return lastPaymentAnswer;

  const partnerAnswer = await tryPartnerLedgerAnswer(message, userId);
  if (partnerAnswer) return partnerAnswer;

  const monthAnswer = await tryDeterministicMonthAnswer(message, options);
  if (monthAnswer) return monthAnswer;

  const plaidAnswer = await tryPlaidBalanceAnswer(message, userId);
  if (plaidAnswer) return plaidAnswer;

  const categoryAnswer = await tryCategoryPaymentAnswer(message, userId);
  if (categoryAnswer) return categoryAnswer;

  return null;
}
