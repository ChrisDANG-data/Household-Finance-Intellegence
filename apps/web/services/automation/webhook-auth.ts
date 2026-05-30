import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

export function assertAutomationBearer(request: Request): void {
  const token = env.automation.webhookToken();
  if (!token) return;

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    throw new AppError("Unauthorized automation webhook", {
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  }
}
