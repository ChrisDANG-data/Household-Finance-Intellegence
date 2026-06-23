export interface ParsedInstallmentObligation {
  name: string;
  category: string;
  amount: number;
  currency: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
}

const MONTH_TO_NUMBER: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const SCHEDULE_CUE =
  /installment|payment\s+schedule|scheduled\s+due|total\s+amount\s+due|premium\s+amount|échéance|versement/i;

const MONTH_NAME_DATE_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2}),?\s+(20\d{2})\b/i;

const ISO_DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/;

/** US/CA style 05/26/2026 or 5-26-2026 */
const NUMERIC_DATE_RE = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/;

const MONEY_RE = /\$?\s*([\d,]+\.\d{2})/g;

export interface ParseInstallmentOptions {
  /** When true, parse rows without schedule headers (needs 3+ installment-shaped lines). */
  relaxed?: boolean;
}

function parseMonthNameDate(match: RegExpExecArray): string | null {
  const monthKey = match[1].toLowerCase();
  const month = MONTH_TO_NUMBER[monthKey];
  if (!month) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(match: RegExpExecArray): string | null {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNumericUsDate(match: RegExpExecArray): string | null {
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDueDate(line: string): string | null {
  const monthMatch = MONTH_NAME_DATE_RE.exec(line);
  MONTH_NAME_DATE_RE.lastIndex = 0;
  if (monthMatch) return parseMonthNameDate(monthMatch);

  const isoMatch = ISO_DATE_RE.exec(line);
  ISO_DATE_RE.lastIndex = 0;
  if (isoMatch) return parseIsoDate(isoMatch);

  const numericMatch = NUMERIC_DATE_RE.exec(line);
  NUMERIC_DATE_RE.lastIndex = 0;
  if (numericMatch) return parseNumericUsDate(numericMatch);

  return null;
}

/** OCR often splits amounts onto the next line — only merge lines without a new due date. */
function amountsNearLine(lines: string[], index: number): number[] {
  const onLine = amountsOnLine(lines[index]);
  if (onLine.length > 0) return onLine;

  const parts = [lines[index]];
  for (let j = index + 1; j <= index + 2 && j < lines.length; j++) {
    if (extractDueDate(lines[j])) break;
    parts.push(lines[j]);
  }
  return amountsOnLine(parts.join(" "));
}

function amountsOnLine(line: string): number[] {
  const values: number[] = [];
  for (const m of line.matchAll(MONEY_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) values.push(n);
  }
  return values;
}

function inferPlanLabel(text: string): { name: string; category: string } {
  const head = text.slice(0, 2000);
  if (/house|home|property|dwelling/i.test(head)) {
    return { name: "Home insurance payment plan", category: "house_insurance" };
  }
  if (/auto|vehicle|car\b/i.test(head)) {
    return { name: "Auto insurance payment plan", category: "car_insurance" };
  }
  if (/insurance|premium|policy/i.test(head)) {
    return { name: "Insurance payment plan", category: "house_insurance" };
  }
  return { name: "Payment plan installment", category: "other" };
}

function parseLines(
  text: string,
  label: { name: string; category: string },
): ParsedInstallmentObligation[] {
  const installments: ParsedInstallmentObligation[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startDate = extractDueDate(line);
    if (!startDate) continue;

    const amounts = amountsNearLine(lines, i);
    if (amounts.length === 0) continue;

    const amount = amounts[amounts.length - 1];
    const installmentNum =
      line.trim().match(/^0?(\d{1,2})\b/)?.[1] ??
      line.match(/\binstallment\s*0?(\d{1,2})\b/i)?.[1];

    installments.push({
      name: label.name,
      category: label.category,
      amount,
      currency: "CAD",
      frequency: "one_time",
      startDate,
      endDate: null,
      notes: installmentNum
        ? `Installment ${installmentNum} per contract schedule`
        : "Per contract installment schedule",
    });
  }

  const uniqueByDate = new Map<string, ParsedInstallmentObligation>();
  for (const row of installments) {
    uniqueByDate.set(row.startDate, row);
  }

  return [...uniqueByDate.values()].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

/**
 * Parse tabular installment schedules (e.g. insurance payment plans) into one-time
 * obligations per due date. Uses the last dollar amount on each line as total due.
 */
export function parseInstallmentScheduleFromText(
  text: string,
  options?: ParseInstallmentOptions,
): ParsedInstallmentObligation[] {
  const relaxed = options?.relaxed ?? false;
  const label = inferPlanLabel(text);
  const rows = parseLines(text, label);

  if (relaxed) {
    return rows.length >= 3 ? rows : [];
  }

  if (!SCHEDULE_CUE.test(text)) return [];
  return rows.length >= 2 ? rows : [];
}

/**
 * Read how many installments the contract claims (e.g. "4-Step Quarterly" → 4).
 * Used for review UI hints only — not persisted.
 */
export function inferExpectedInstallmentCount(text: string): number | null {
  const head = text.slice(0, 6000);

  const stepPlan = head.match(/\b(\d{1,2})[\s-]*step\b/i);
  if (stepPlan) {
    const n = Number(stepPlan[1]);
    if (n >= 2 && n <= 24) return n;
  }

  const quarterPlan = head.match(/\b(\d{1,2})[\s-]*quarter(?:ly)?\b/i);
  if (quarterPlan) {
    const n = Number(quarterPlan[1]);
    if (n >= 2 && n <= 24) return n;
  }

  const countLabel = head.match(/\b(\d{1,2})\s*installments?\b/i);
  if (countLabel) {
    const n = Number(countLabel[1]);
    if (n >= 2 && n <= 24) return n;
  }

  const range = head.match(
    /installments?\s*0?(\d{1,2})\s*[–\-—]\s*0?(\d{1,2})\b/i,
  );
  if (range) {
    const hi = Math.max(Number(range[1]), Number(range[2]));
    if (hi >= 2 && hi <= 24) return hi;
  }

  if (SCHEDULE_CUE.test(head)) {
    const nums = new Set<number>();
    for (const line of head.split(/\r?\n/)) {
      const leading = line.trim().match(/^0?(\d{1,2})\b/);
      if (leading && extractDueDate(line)) {
        nums.add(Number(leading[1]));
      }
    }
    if (nums.size >= 2) return Math.max(...nums);
  }

  return null;
}

/** Prefer deterministic schedule rows over LLM output when the document has an installment table. */
export function resolveObligationsFromDocumentText(
  text: string,
  llmObligations: ParsedInstallmentObligation[],
): ParsedInstallmentObligation[] {
  const strict = parseInstallmentScheduleFromText(text);
  if (strict.length >= 2) return strict;

  const relaxed = parseInstallmentScheduleFromText(text, { relaxed: true });
  if (relaxed.length >= 2) return relaxed;

  return llmObligations;
}
