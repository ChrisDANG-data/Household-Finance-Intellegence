import { assertAutomationBearer } from "@/services/automation/webhook-auth";
import { automationRunService } from "@/services/automation/automation-run.service";
import { jsonError, jsonSuccess } from "@/utils/api-response";
import { AppError, toAppError } from "@/utils/errors";

interface RiskAlertBody {
  risk_level?: "low" | "medium" | "high";
  user_id?: string;
  source?: string;
  correlation_id?: string;
  details?: unknown;
}

/** POST — accepts deterministic risk alerts and records workflow metadata */
export async function POST(request: Request) {
  try {
    assertAutomationBearer(request);
    const body = (await request.json()) as RiskAlertBody;
    if (!body.risk_level) {
      throw new AppError("risk_level is required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const run = await automationRunService.record({
      workflow: "alert-on-risk-threshold",
      source: body.source ?? "api",
      status: "success",
      correlationId: body.correlation_id,
      payload: {
        user_id: body.user_id ?? "default",
        risk_level: body.risk_level,
        details: body.details ?? {},
      },
    });

    return jsonSuccess({
      accepted: true,
      id: run.id,
      correlation_id: run.correlation_id,
      risk_level: body.risk_level,
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
