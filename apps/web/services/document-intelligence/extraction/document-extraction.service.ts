import type { FinancialEventFrequency, FinancialEventType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { llmComplete } from "@/services/ai/llm/llm.service";
import type { AiProvider } from "@/services/ai/llm/types";
import { AppError } from "@/utils/errors";
import { financialStatePersistence, DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";

import {
  parseInstallmentScheduleFromText,
  resolveObligationsFromDocumentText,
} from "./installment-schedule.parser";

export interface ExtractedObligation {
  name: string;
  category: string;
  amount: number;
  currency: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
}

export interface ExtractedDocumentPayload {
  documentId: string;
  rawText: string;
  obligations: ExtractedObligation[];
}

export function mapFrequency(freq: string | undefined): FinancialEventFrequency {
  const f = (freq || "monthly").toLowerCase();
  if (f.includes("week") || f === "bi_weekly" || f === "bi-weekly") return "weekly";
  if (f.includes("quarter") || f === "triannual") return "quarterly";
  if (f.includes("year") || f === "annual") return "yearly";
  if (f === "one_time" || f === "one-time") return "one_time";
  return "monthly";
}

const EXTRACTION_PROMPT = `You are a financial document parser. Extract all payment obligations, bills, or recurring charges from the provided document text.

For each obligation found, return a JSON array of objects with these fields:
- name: string (vendor/payee name)
- category: string (specific slug, e.g. house_insurance, car_insurance, property_tax, rent, utilities)
- amount: number (payment amount per occurrence — use Total Amount Due when a table lists premium + fees)
- currency: string (e.g. "CAD", "USD")
- frequency: string (one of: monthly, weekly, quarterly, yearly, one_time)
- startDate: string (YYYY-MM-DD — due date for that payment)
- endDate: string | null (YYYY-MM-DD if specified, null otherwise)
- notes: string | null (any relevant details)

Rules:
- Extract ONLY what is explicitly stated in the document
- Do NOT invent or assume values
- PAYMENT PLANS / INSTALLMENT TABLES (e.g. "Installment 01–06", "Scheduled Due Date", finite plan cost):
  - Do NOT use frequency "monthly" for the whole plan
  - Create ONE entry per installment row with frequency "one_time", startDate = that row's due date, amount = Total Amount Due (or premium + fees)
  - If the down payment amount differs from later installments, each row is still its own one_time entry
  - Set endDate null on each one_time row
- ONGOING subscriptions (no end date, repeats indefinitely): use monthly/weekly/quarterly/yearly with startDate = first due date
- For quarterly schedules (e.g. Aug, Nov, Feb every year), use frequency "quarterly" and startDate = first installment date
- For irregular non-plan dates (e.g. property tax Nov 1 and Feb 1), create SEPARATE one_time entries
- Return ONLY a valid JSON array, no other text`;

function normalizeObligation(raw: ExtractedObligation): ExtractedObligation {
  return {
    name: String(raw.name || "").trim() || "Unnamed",
    category: String(raw.category || "other").trim().toLowerCase().replace(/\s+/g, "_"),
    amount: Number(raw.amount) || 0,
    currency: String(raw.currency || "CAD").trim().toUpperCase(),
    frequency: String(raw.frequency || "monthly").trim().toLowerCase(),
    startDate: String(raw.startDate || new Date().toISOString().slice(0, 10)),
    endDate: raw.endDate ? String(raw.endDate) : null,
    notes: raw.notes ? String(raw.notes) : null,
  };
}

/**
 * Document Intelligence Engine — text → structured obligations.
 * Uses an LLM (Claude or Gemini) to parse extracted text into financial obligations.
 */
export class DocumentExtractionService {
  async extract(
    documentId: string,
    options?: { provider?: AiProvider },
  ): Promise<ExtractedDocumentPayload> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { extractedText: true, extractionStatus: true },
    });

    if (!doc) {
      throw new AppError("Document not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

    if (!doc.extractedText) {
      throw new AppError("Document has no extracted text yet", {
        code: "PRECONDITION_FAILED",
        statusCode: 400,
      });
    }

    const { text: responseText } = await llmComplete({
      provider: options?.provider,
      maxTokens: 2048,
      temperature: 0,
      caller: "document-extraction",
      system: EXTRACTION_PROMPT,
      user: `Document text:\n\n${doc.extractedText}`,
    });

    let llmObligations: ExtractedObligation[] = [];
    try {
      const parsed = JSON.parse(
        responseText.replace(/```json?\s*/g, "").replace(/```/g, "").trim(),
      );
      llmObligations = Array.isArray(parsed) ? parsed.map(normalizeObligation) : [];
    } catch {
      llmObligations = [];
    }

    const scheduleOnly = parseInstallmentScheduleFromText(doc.extractedText);
    if (scheduleOnly.length >= 2) {
      return {
        documentId,
        rawText: doc.extractedText,
        obligations: scheduleOnly.map(normalizeObligation),
      };
    }

    const resolved = resolveObligationsFromDocumentText(
      doc.extractedText,
      llmObligations,
    );

    return {
      documentId,
      rawText: doc.extractedText,
      obligations: resolved.map(normalizeObligation),
    };
  }

  async saveObligations(
    documentId: string,
    obligations: ExtractedObligation[],
    options?: { replaceExisting?: boolean },
  ): Promise<number> {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      throw new AppError("Document not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

    if (options?.replaceExisting) {
      await prisma.financialObligation.deleteMany({
        where: { sourceDocumentId: documentId },
      });
      await prisma.financialEvent.deleteMany({
        where: { sourceDocumentId: documentId },
      });
    }

    const saveable = obligations
      .map(normalizeObligation)
      .filter((ob) => ob.amount > 0);

    let savedCount = 0;
    for (const ob of saveable) {
      await prisma.financialObligation.create({
        data: {
          name: ob.name,
          category: ob.category,
          amount: ob.amount,
          currency: ob.currency,
          frequency: mapFrequency(ob.frequency),
          startDate: new Date(ob.startDate),
          endDate: ob.endDate ? new Date(ob.endDate) : null,
          notes: ob.notes || null,
          sourceDocumentId: documentId,
        },
      });

      const eventFrequency = mapFrequency(ob.frequency);
      const eventType: FinancialEventType =
        eventFrequency === "one_time" ? "one_time_expense" : "recurring_expense";

      await financialStatePersistence.createEvent({
        user_id: DEFAULT_USER_ID,
        type: eventType,
        category: ob.category || "other",
        amount: ob.amount,
        currency: ob.currency,
        frequency: eventFrequency,
        start_date: ob.startDate,
        end_date: ob.endDate || null,
        owner: "partner_a",
        confidence: 0.9,
        source_document_id: documentId,
        metadata: {
          contract_name: ob.name,
          is_fixed: true,
        },
      });

      savedCount++;
    }

    return savedCount;
  }

  /**
   * Extract obligations and save them without user review (legacy / scripts).
   */
  async extractAndSave(
    documentId: string,
    options?: { provider?: AiProvider },
  ): Promise<{
    payload: ExtractedDocumentPayload;
    savedCount: number;
  }> {
    const payload = await this.extract(documentId, options);
    const savedCount = await this.saveObligations(documentId, payload.obligations, {
      replaceExisting: true,
    });
    return { payload, savedCount };
  }
}

export const documentExtractionService = new DocumentExtractionService();
