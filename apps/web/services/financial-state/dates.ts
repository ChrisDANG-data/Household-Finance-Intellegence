const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function parseMonth(month: string): { year: number; month: number } {
  const match = MONTH_RE.exec(month);
  if (!match) {
    throw new Error(`Invalid month format (expected YYYY-MM): ${month}`);
  }
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) {
    throw new Error(`Invalid month value: ${month}`);
  }
  return { year, month: m };
}

export function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const { year, month: m } = parseMonth(month);
  const total = year * 12 + (m - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return formatMonth(nextYear, nextMonth);
}

export function currentUtcMonth(): string {
  const now = new Date();
  return formatMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function dateToMonth(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatDateIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Calendar date in the runtime local timezone (human-facing timestamps). */
export function formatLocalDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthStartDate(month: string): string {
  return `${month}-01`;
}

export function monthEndDate(month: string): string {
  const { year, month: m } = parseMonth(month);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

export function isDateInMonth(date: Date, month: string): boolean {
  return dateToMonth(date) === month;
}

/** True when `date` is the last calendar day of its UTC month. */
export function isLastUtcDayOfMonth(date: Date = new Date()): boolean {
  const tomorrow = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return tomorrow.getUTCDate() === 1;
}

export function isEventActiveInMonth(
  startDate: Date,
  endDate: Date | null | undefined,
  month: string,
): boolean {
  const start = formatDateIso(startDate);
  const monthStart = monthStartDate(month);
  const monthEnd = monthEndDate(month);
  if (start > monthEnd) return false;
  if (endDate) {
    const end = formatDateIso(endDate);
    if (end < monthStart) return false;
  }
  return true;
}
