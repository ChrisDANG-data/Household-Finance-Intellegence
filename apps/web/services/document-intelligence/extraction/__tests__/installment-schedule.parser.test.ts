import { describe, expect, it } from "vitest";

import {
  inferExpectedInstallmentCount,
  parseInstallmentScheduleFromText,
  resolveObligationsFromDocumentText,
} from "../installment-schedule.parser";

const INSURANCE_SCHEDULE = `
Payment Schedule
Installment Scheduled Due Date Premium Amount Service Fee Total Amount Due
01 May 26, 2026 160.00 0.00 160.00 Processed
02 June 26, 2026 160.00 2.00 162.00
03 July 26, 2026 160.00 2.00 162.00
04 August 26, 2026 160.00 2.00 162.00
05 September 26, 2026 160.00 2.00 162.00
06 October 26, 2026 160.00 2.00 162.00
Total Estimated Plan Cost 970.00
`;

describe("parseInstallmentScheduleFromText", () => {
  it("expands a finite installment table into one-time payments per due date", () => {
    const rows = parseInstallmentScheduleFromText(INSURANCE_SCHEDULE);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      frequency: "one_time",
      startDate: "2026-05-26",
      amount: 160,
    });
    expect(rows[1]).toMatchObject({
      startDate: "2026-06-26",
      amount: 162,
    });
    expect(rows[5]).toMatchObject({
      startDate: "2026-10-26",
      amount: 162,
    });
  });

  it("returns empty when no schedule cues", () => {
    expect(parseInstallmentScheduleFromText("Monthly rent $2000 due on the 1st")).toEqual(
      [],
    );
  });

  it("parses ISO due dates in schedule tables", () => {
    const text = `
Payment Schedule
Installment Scheduled Due Date Total Amount Due
01 2026-05-26 160.00
02 2026-06-26 162.00
03 2026-07-26 162.00
`;
    const rows = parseInstallmentScheduleFromText(text);
    expect(rows).toHaveLength(3);
    expect(rows[0].startDate).toBe("2026-05-26");
    expect(rows[0].amount).toBe(160);
  });

  it("prefers schedule rows over LLM monthly collapse", () => {
    const text = INSURANCE_SCHEDULE;
    const llm = [
      {
        name: "Insurance",
        category: "house_insurance",
        amount: 162,
        currency: "CAD",
        frequency: "monthly",
        startDate: "2026-06-01",
        endDate: null,
        notes: null,
      },
    ];
    const resolved = resolveObligationsFromDocumentText(text, llm);
    expect(resolved).toHaveLength(6);
    expect(resolved.every((r) => r.frequency === "one_time")).toBe(true);
  });
});

describe("inferExpectedInstallmentCount", () => {
  it("reads 4-step quarterly plans from contract wording", () => {
    const text = `
SECTION III: PREMIUM SUMMARY & 4-QUARTER PAYMENT SCHEDULE
The policyholder has chosen the 4-Step Quarterly Installment Plan.
01 May 26, 2026 $360.00
02 August 26, 2026 $365.00
`;
    expect(inferExpectedInstallmentCount(text)).toBe(4);
  });

  it("reads six-installment tables from schedule rows", () => {
    expect(inferExpectedInstallmentCount(INSURANCE_SCHEDULE)).toBe(6);
  });

  it("returns null when no schedule count is stated", () => {
    expect(
      inferExpectedInstallmentCount("Monthly rent $2000 due on the 1st"),
    ).toBeNull();
  });
});
