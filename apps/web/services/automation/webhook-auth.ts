import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

import { isValidAutomationBearer } from "@/lib/auth/automation-bearer";

export function assertAutomationBearer(request: Request): void {
  if (!isValidAutomationBearer(request)) {
    if (env.isVercel() && !env.automation.webhookToken()) {
      throw new AppError(
        "AUTOMATION_WEBHOOK_TOKEN is required in production for automation routes",
        { code: "SECURITY_NOT_CONFIGURED", statusCode: 503 },
      );
    }

    throw new AppError("Unauthorized automation webhook", {
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  }
}
