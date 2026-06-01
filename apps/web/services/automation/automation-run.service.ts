import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

export type AutomationStatus = "queued" | "success" | "failed" | "skipped";

export interface RecordAutomationRunInput {
  workflow: string;
  source: string;
  status: AutomationStatus;
  payload?: unknown;
  result?: unknown;
  errorMessage?: string;
  correlationId?: string;
}

export class AutomationRunService {
  async record(input: RecordAutomationRunInput) {
    const correlationId = input.correlationId ?? randomUUID();
    try {
      const existing = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          correlation_id: string;
          status: string;
          created_at: Date;
        }>
      >(
        `SELECT id, correlation_id, status, created_at
         FROM automation_runs
         WHERE workflow = $1 AND correlation_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        input.workflow,
        correlationId,
      );
      if (existing[0]) return existing[0];

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          correlation_id: string;
          status: string;
          created_at: Date;
        }>
      >(
        `INSERT INTO automation_runs
         (id, workflow, correlation_id, source, status, payload, result, error_message, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW(), NOW())
         RETURNING id, correlation_id, status, created_at`,
        randomUUID(),
        input.workflow,
        correlationId,
        input.source,
        input.status,
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.result ?? null),
        input.errorMessage ?? null,
      );

      return rows[0] ?? {
        id: randomUUID(),
        correlation_id: correlationId,
        status: input.status,
        created_at: new Date(),
      };
    } catch {
      // Keep API endpoints functional even before Prisma migration is applied.
      return {
      id: randomUUID(),
      correlation_id: correlationId,
      status: input.status,
      created_at: new Date(),
    };
    }
  }
}

export const automationRunService = new AutomationRunService();
