import type {
  FinancialEventFrequency,
  FinancialEventType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { currentUtcMonth } from "./dates";
import {
  metadataToJson,
  prismaEventToDomain,
} from "./event.mapper";
import { financialStateEngine } from "./engine";
import { validateFinancialAmount } from "./amount-validation";
import {
  dedupeFinancialEventsForProjection,
  exactDedupeKey,
  findExactDuplicate,
  findRecurringStreamDuplicate,
} from "./event-dedupe";
import { normalizeFinancialEvents } from "./normalize";
import type {
  FinancialState,
  FinancialTimelineState,
} from "./state.types";
import type {
  FinancialEvent,
  FinancialEventMetadata,
  FinancialEventOwner,
  RawFinancialEvent,
} from "./types";
import { AppError } from "@/utils/errors";

export const DEFAULT_USER_ID = "default";

export interface UpsertFinancialStateInput {
  user_id?: string;
  current_cash: number;
  monthly_income?: number;
}

export interface CreateFinancialEventInput {
  user_id?: string;
  type: FinancialEventType;
  category: string;
  amount: number;
  currency?: string;
  frequency: FinancialEventFrequency;
  start_date: string;
  end_date?: string | null;
  event_date?: string | null;
  account_in?: string | null;
  account_out?: string | null;
  owner?: FinancialEventOwner;
  confidence?: number;
  source_document_id?: string | null;
  metadata?: FinancialEventMetadata;
}

export type UpdateFinancialEventInput = Partial<CreateFinancialEventInput>;

function parseDateOnly(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(`${field} must be YYYY-MM-DD`, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`Invalid ${field}`, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  }
  return date;
}

function validateConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new AppError("confidence must be between 0 and 1", {
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  }
}

async function ensureSourceDocument(documentId: string | null | undefined): Promise<void> {
  if (!documentId) return;
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) {
    throw new AppError("source_document_id not found", {
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  }
}

/**
 * Financial State persistence — canonical DB layer.
 * FinancialTimelineState and computed fields are derived at read time, never stored.
 */
export class FinancialStatePersistence {
  private assertEventAmount(event: FinancialEvent): void {
    validateFinancialAmount(event.amount, { allowZero: false });
  }

  private async assertEventWritable(
    userId: string,
    event: FinancialEvent,
    excludeId?: string,
  ): Promise<void> {
    this.assertEventAmount(event);

    const existing = await this.listEvents(userId);
    if (findExactDuplicate(event, existing, excludeId)) {
      throw new AppError(
        "An identical financial event already exists in your ledger",
        { code: "VALIDATION_ERROR", statusCode: 400 },
      );
    }

    const streamDup = findRecurringStreamDuplicate(event, existing, excludeId);
    if (streamDup) {
      throw new AppError(
        `A matching recurring ${event.category.replace(/_/g, " ")} entry already exists. Update the existing event or change amount, owner, or frequency.`,
        { code: "VALIDATION_ERROR", statusCode: 400 },
      );
    }
  }

  async ensureState(userId: string = DEFAULT_USER_ID): Promise<void> {
    await prisma.financialState.upsert({
      where: { userId },
      create: {
        userId,
        currentCash: 0,
        monthlyIncome: 0,
      },
      update: {},
    });
  }

  async upsertStateScalars(input: UpsertFinancialStateInput): Promise<FinancialState> {
    const userId = input.user_id ?? DEFAULT_USER_ID;
    await prisma.financialState.upsert({
      where: { userId },
      create: {
        userId,
        currentCash: input.current_cash,
        monthlyIncome: input.monthly_income ?? 0,
      },
      update: {
        currentCash: input.current_cash,
        monthlyIncome: input.monthly_income ?? 0,
      },
    });
    return this.loadState(userId);
  }

  async loadState(
    userId: string = DEFAULT_USER_ID,
    referenceMonth: string = currentUtcMonth(),
  ): Promise<FinancialState> {
    const row = await prisma.financialState.findUnique({
      where: { userId },
      include: { events: { orderBy: { startDate: "asc" } } },
    });

    if (!row) {
      return financialStateEngine.createState({
        user_id: userId,
        current_cash: 0,
        monthly_income: 0,
        events: [],
        referenceMonth,
      });
    }

    const events = dedupeFinancialEventsForProjection(
      row.events.map(prismaEventToDomain),
    );
    return financialStateEngine.withComputed(
      {
        user_id: userId,
        current_cash: Number(row.currentCash),
        monthly_income: Number(row.monthlyIncome),
        events,
      },
      referenceMonth,
    );
  }

  /** Derived timeline — not persisted. */
  async buildTimeline(
    userId: string = DEFAULT_USER_ID,
    months: number = 12,
    startMonth?: string,
  ): Promise<FinancialTimelineState[]> {
    const state = await this.loadState(userId, startMonth ?? currentUtcMonth());
    return financialStateEngine.simulateForecast(state, { months, startMonth });
  }

  async listEvents(userId: string = DEFAULT_USER_ID): Promise<FinancialEvent[]> {
    const rows = await prisma.financialEvent.findMany({
      where: { userId },
      orderBy: [{ startDate: "asc" }, { category: "asc" }],
    });
    return rows.map(prismaEventToDomain);
  }

  async getEvent(id: string, userId?: string): Promise<FinancialEvent> {
    const row = await prisma.financialEvent.findFirst({
      where: userId ? { id, userId } : { id },
    });
    if (!row) {
      throw new AppError("Financial event not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }
    return prismaEventToDomain(row);
  }

  async createEvent(input: CreateFinancialEventInput): Promise<FinancialEvent> {
    const userId = input.user_id ?? DEFAULT_USER_ID;
    await this.ensureState(userId);
    await ensureSourceDocument(input.source_document_id);

    const raw: RawFinancialEvent = {
      type: input.type,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      frequency: input.frequency,
      start_date: input.start_date,
      end_date: input.end_date,
      owner: input.owner ?? "partner_a",
      confidence: input.confidence ?? 1,
      source_document_id: input.source_document_id,
      metadata: input.metadata as RawFinancialEvent["metadata"],
    };

    const [normalized] = normalizeFinancialEvents([raw]);
    if (!normalized) {
      throw new AppError("Invalid financial event", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    validateConfidence(normalized.confidence);
    await this.assertEventWritable(userId, normalized);

    const row = await prisma.financialEvent.create({
      data: {
        userId,
        type: normalized.type as FinancialEventType,
        category: normalized.category,
        amount: normalized.amount,
        currency: normalized.currency,
        frequency: normalized.frequency as FinancialEventFrequency,
        startDate: normalized.start_date,
        endDate: normalized.end_date ?? null,
        eventDate: input.event_date ? parseDateOnly(input.event_date, "event_date") : null,
        accountIn: input.account_in ?? null,
        accountOut: input.account_out ?? null,
        owner: normalized.owner,
        confidence: normalized.confidence,
        sourceDocumentId: normalized.source_document_id ?? null,
        metadata: metadataToJson(normalized.metadata),
      },
    });

    return prismaEventToDomain(row);
  }

  async updateEvent(
    id: string,
    input: UpdateFinancialEventInput,
    userId?: string,
  ): Promise<FinancialEvent> {
    const existing = await prisma.financialEvent.findFirst({
      where: userId ? { id, userId } : { id },
    });
    if (!existing) {
      throw new AppError("Financial event not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

    if (input.source_document_id !== undefined) {
      await ensureSourceDocument(input.source_document_id);
    }

    const merged: RawFinancialEvent = {
      id,
      type: input.type ?? (existing.type as FinancialEventType),
      category: input.category ?? existing.category,
      amount: input.amount ?? Number(existing.amount),
      currency: input.currency ?? existing.currency,
      frequency:
        input.frequency ?? (existing.frequency as FinancialEventFrequency),
      start_date: input.start_date
        ? parseDateOnly(input.start_date, "start_date")
        : existing.startDate,
      end_date:
        input.end_date !== undefined
          ? input.end_date
            ? parseDateOnly(input.end_date, "end_date")
            : null
          : existing.endDate,
      owner: input.owner ?? (existing.owner as FinancialEventOwner),
      confidence: input.confidence ?? existing.confidence,
      source_document_id:
        input.source_document_id !== undefined
          ? input.source_document_id
          : existing.sourceDocumentId,
      metadata: (input.metadata !== undefined
        ? input.metadata
        : prismaEventToDomain(existing).metadata) as RawFinancialEvent["metadata"],
    };

    const [normalized] = normalizeFinancialEvents([merged]);
    if (!normalized) {
      throw new AppError("Invalid financial event", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    validateConfidence(normalized.confidence);
    await this.assertEventWritable(existing.userId, normalized, id);

    const row = await prisma.financialEvent.update({
      where: { id },
      data: {
        type: normalized.type as FinancialEventType,
        category: normalized.category,
        amount: normalized.amount,
        currency: normalized.currency,
        frequency: normalized.frequency as FinancialEventFrequency,
        startDate: normalized.start_date,
        endDate: normalized.end_date ?? null,
        ...(input.event_date !== undefined && {
          eventDate: input.event_date ? parseDateOnly(input.event_date, "event_date") : null,
        }),
        ...(input.account_in !== undefined && { accountIn: input.account_in ?? null }),
        ...(input.account_out !== undefined && { accountOut: input.account_out ?? null }),
        owner: normalized.owner,
        confidence: normalized.confidence,
        sourceDocumentId: normalized.source_document_id ?? null,
        metadata: metadataToJson(normalized.metadata),
      },
    });

    return prismaEventToDomain(row);
  }

  async deleteEvent(id: string, userId?: string): Promise<void> {
    const existing = await prisma.financialEvent.findFirst({
      where: userId ? { id, userId } : { id },
    });
    if (!existing) {
      throw new AppError("Financial event not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }
    await prisma.financialEvent.delete({ where: { id } });
  }

  async ingestRawEvents(
    userId: string,
    events: RawFinancialEvent[],
  ): Promise<FinancialEvent[]> {
    await this.ensureState(userId);
    const normalized = normalizeFinancialEvents(events);
    const existing = await this.listEvents(userId);
    const created: FinancialEvent[] = [];
    const pendingKeys = new Set<string>();

    for (const event of normalized) {
      try {
        this.assertEventAmount(event);
      } catch {
        continue;
      }

      const exactKey = exactDedupeKey(event);
      if (pendingKeys.has(exactKey)) continue;
      if (findExactDuplicate(event, existing, undefined)) continue;
      if (findRecurringStreamDuplicate(event, [...existing, ...created], undefined)) {
        continue;
      }

      pendingKeys.add(exactKey);

      const row = await prisma.financialEvent.create({
        data: {
          userId,
          type: event.type as FinancialEventType,
          category: event.category,
          amount: event.amount,
          currency: event.currency,
          frequency: event.frequency as FinancialEventFrequency,
          startDate: event.start_date,
          endDate: event.end_date ?? null,
          owner: event.owner,
          confidence: event.confidence,
          sourceDocumentId: event.source_document_id ?? null,
          metadata: metadataToJson(event.metadata),
        },
      });
      created.push(prismaEventToDomain(row));
    }

    return created;
  }
}

export const financialStatePersistence = new FinancialStatePersistence();
