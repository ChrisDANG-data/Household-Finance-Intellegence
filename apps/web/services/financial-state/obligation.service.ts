import { prisma } from "@/lib/prisma";
import {
  serializeObligation,
  type SerializedObligation,
} from "@/lib/serializers";
import {
  computeMonthlyObligationSummary,
  type MonthlyObligationSummary,
} from "@/services/financial-state/obligation-summary";
import { isValidFrequency } from "@/services/financial-state/obligation.mapper";
import { currentUtcMonth, parseMonth } from "@/services/financial-state/dates";
import type { FinancialEventFrequency } from "@/services/financial-state/types";
import { AppError } from "@/utils/errors";

export interface CreateObligationInput {
  name: string;
  category?: string;
  amount: number;
  currency?: string;
  frequency?: FinancialEventFrequency;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  sourceDocumentId?: string | null;
}

export type UpdateObligationInput = Partial<CreateObligationInput>;

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

function validateAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("amount must be a positive number", {
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  }
}

function validateName(name: string): void {
  if (!name?.trim()) {
    throw new AppError("name is required", {
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  }
}

export class ObligationService {
  async list(): Promise<SerializedObligation[]> {
    const rows = await prisma.financialObligation.findMany({
      orderBy: [{ startDate: "desc" }, { name: "asc" }],
    });
    return rows.map(serializeObligation);
  }

  async getById(id: string): Promise<SerializedObligation> {
    const row = await prisma.financialObligation.findUnique({ where: { id } });
    if (!row) {
      throw new AppError("Obligation not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }
    return serializeObligation(row);
  }

  async create(input: CreateObligationInput): Promise<SerializedObligation> {
    validateName(input.name);
    validateAmount(input.amount);

    const frequency = input.frequency ?? "monthly";
    if (!isValidFrequency(frequency)) {
      throw new AppError("Invalid frequency", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    if (input.sourceDocumentId) {
      const doc = await prisma.document.findUnique({
        where: { id: input.sourceDocumentId },
      });
      if (!doc) {
        throw new AppError("sourceDocumentId not found", {
          code: "VALIDATION_ERROR",
          statusCode: 400,
        });
      }
    }

    const row = await prisma.financialObligation.create({
      data: {
        name: input.name.trim(),
        category: input.category?.trim() || "general",
        amount: input.amount,
        currency: input.currency?.trim() || "CAD",
        frequency,
        startDate: parseDateOnly(input.startDate, "startDate"),
        endDate: input.endDate
          ? parseDateOnly(input.endDate, "endDate")
          : null,
        notes: input.notes?.trim() || null,
        sourceDocumentId: input.sourceDocumentId ?? null,
      },
    });

    return serializeObligation(row);
  }

  async update(
    id: string,
    input: UpdateObligationInput,
  ): Promise<SerializedObligation> {
    await this.getById(id);

    if (input.name !== undefined) validateName(input.name);
    if (input.amount !== undefined) validateAmount(input.amount);
    if (input.frequency !== undefined && !isValidFrequency(input.frequency)) {
      throw new AppError("Invalid frequency", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    if (input.sourceDocumentId) {
      const doc = await prisma.document.findUnique({
        where: { id: input.sourceDocumentId },
      });
      if (!doc) {
        throw new AppError("sourceDocumentId not found", {
          code: "VALIDATION_ERROR",
          statusCode: 400,
        });
      }
    }

    const row = await prisma.financialObligation.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.category !== undefined && {
          category: input.category.trim() || "general",
        }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.currency !== undefined && {
          currency: input.currency.trim() || "CAD",
        }),
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.startDate !== undefined && {
          startDate: parseDateOnly(input.startDate, "startDate"),
        }),
        ...(input.endDate !== undefined && {
          endDate: input.endDate
            ? parseDateOnly(input.endDate, "endDate")
            : null,
        }),
        ...(input.notes !== undefined && {
          notes: input.notes?.trim() || null,
        }),
        ...(input.sourceDocumentId !== undefined && {
          sourceDocumentId: input.sourceDocumentId,
        }),
      },
    });

    return serializeObligation(row);
  }

  async delete(id: string): Promise<void> {
    const row = await prisma.financialObligation.findUnique({ where: { id } });
    if (!row) {
      throw new AppError("Obligation not found", {
        code: "NOT_FOUND",
        statusCode: 404,
      });
    }

    const eventWhere: {
      startDate: Date;
      amount: number;
      category: string;
      sourceDocumentId?: string;
    } = {
      startDate: row.startDate,
      amount: Number(row.amount),
      category: row.category,
    };
    if (row.sourceDocumentId) {
      eventWhere.sourceDocumentId = row.sourceDocumentId;
    }

    await prisma.financialEvent.deleteMany({ where: eventWhere });
    await prisma.financialObligation.delete({ where: { id } });
  }

  async getMonthlySummary(month?: string): Promise<MonthlyObligationSummary> {
    const targetMonth = month ?? currentUtcMonth();
    parseMonth(targetMonth);

    const obligations = await prisma.financialObligation.findMany();
    return computeMonthlyObligationSummary(obligations, targetMonth);
  }
}

export const obligationService = new ObligationService();
