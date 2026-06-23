import { describe, expect, it } from "vitest";

import { isLastUtcDayOfMonth } from "../dates";

describe("isLastUtcDayOfMonth", () => {
  it("returns true on last day of month", () => {
    expect(isLastUtcDayOfMonth(new Date("2026-01-31T12:00:00.000Z"))).toBe(true);
    expect(isLastUtcDayOfMonth(new Date("2026-02-28T23:00:00.000Z"))).toBe(true);
    expect(isLastUtcDayOfMonth(new Date("2024-02-29T00:00:00.000Z"))).toBe(true);
  });

  it("returns false on other days", () => {
    expect(isLastUtcDayOfMonth(new Date("2026-01-30T12:00:00.000Z"))).toBe(false);
    expect(isLastUtcDayOfMonth(new Date("2026-02-27T12:00:00.000Z"))).toBe(false);
  });
});
