import { buildFinancialState } from "../projection";
import type { FinancialState } from "../state.types";
import type { FinancialEvent } from "../types";

/** Fixed forecast window for deterministic tests (not tied to runtime clock). */
export const FORECAST_START_MONTH = "2026-01";

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export const BASIC_SCENARIO_EVENT_IDS = {
  income: "evt-income-salary",
  rent: "evt-rent",
  insurance: "evt-insurance",
  carLease: "evt-car-lease",
  renovation: "evt-renovation",
} as const;

export const basicScenarioEvents: FinancialEvent[] = [
  {
    id: BASIC_SCENARIO_EVENT_IDS.income,
    type: "income",
    category: "salary",
    amount: 5000,
    currency: "CAD",
    frequency: "monthly",
    start_date: utcDate("2026-01-01"),
    end_date: null,
    owner: "joint",
    confidence: 1,
    source_document_id: null,
    metadata: { contract_name: "Employer", is_fixed: true },
  },
  {
    id: BASIC_SCENARIO_EVENT_IDS.rent,
    type: "recurring_expense",
    category: "rent",
    amount: 1500,
    currency: "CAD",
    frequency: "monthly",
    start_date: utcDate("2026-01-01"),
    end_date: null,
    owner: "joint",
    confidence: 1,
    source_document_id: null,
    metadata: { merchant: "Landlord", is_fixed: true },
  },
  {
    id: BASIC_SCENARIO_EVENT_IDS.insurance,
    type: "recurring_expense",
    category: "insurance",
    amount: 120,
    currency: "CAD",
    frequency: "monthly",
    start_date: utcDate("2026-01-01"),
    end_date: null,
    owner: "joint",
    confidence: 1,
    source_document_id: null,
    metadata: { is_fixed: true },
  },
  {
    id: BASIC_SCENARIO_EVENT_IDS.carLease,
    type: "recurring_expense",
    category: "car_lease",
    amount: 400,
    currency: "CAD",
    frequency: "monthly",
    start_date: utcDate("2026-01-01"),
    end_date: utcDate("2026-06-30"),
    owner: "joint",
    confidence: 1,
    source_document_id: null,
    metadata: { contract_name: "Auto Lease", is_fixed: true },
  },
  {
    id: BASIC_SCENARIO_EVENT_IDS.renovation,
    type: "one_time_expense",
    category: "renovation",
    amount: 2000,
    currency: "CAD",
    frequency: "one_time",
    start_date: utcDate("2026-03-15"),
    end_date: null,
    owner: "joint",
    confidence: 1,
    source_document_id: null,
    metadata: { merchant: "Contractor" },
  },
];

export function buildBasicScenarioState(): FinancialState {
  return buildFinancialState(
    {
      user_id: "test-user-basic",
      current_cash: 10_000,
      monthly_income: 5000,
      events: basicScenarioEvents,
    },
    FORECAST_START_MONTH,
  );
}
