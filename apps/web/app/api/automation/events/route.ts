import { assertAutomationBearer } from "@/services/automation/webhook-auth";
import { automationRunService } from "@/services/automation/automation-run.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

interface AutomationEventRequest {
  workflow?: string;
  source?: string;
  status?: "queued" | "success" | "failed";
  correlation_id?: string;
  payload?: unknown;
  result?: unknown;
  error?: string;
}

/** POST — record n8n/workflow events in DB for retries + observability */
export async function POST(request: Request) {
  try {
    assertAutomationBearer(request);
    const body = (await request.json()) as AutomationEventRequest;
    if (!body.workflow) {
      throw new AppError("workflow is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const run = await automationRunService.record({
      workflow: body.workflow,
      source: body.source ?? "n8n",
      status: body.status ?? "queued",
      correlationId: body.correlation_id,
      payload: body.payload,
      result: body.result,
      errorMessage: body.error,
    });

    return jsonSuccess({
      id: run.id,
      correlation_id: run.correlation_id,
      status: run.status,
      created_at: new Date(run.created_at).toISOString(),
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
