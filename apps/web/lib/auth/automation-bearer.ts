import { env } from "@/lib/env";

export function isValidAutomationBearer(request: Request): boolean {
  const token = env.automation.webhookToken();
  if (!token) return false;

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${token}`;
}
