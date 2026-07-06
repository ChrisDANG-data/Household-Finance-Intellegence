import { financialStateRepository } from "@/services/financial-state";
import { isAuthEnabled } from "@/lib/auth/config";
import { jsonSuccess } from "@/utils/api-response";

export async function GET() {
  const database = await financialStateRepository.healthCheck();

  return jsonSuccess({
    status: "ok",
    timestamp: new Date().toISOString(),
    deploy: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    auth: {
      enabled: isAuthEnabled(),
      /** When false on Vercel, redeploy — auth API routes missing from this build. */
      routesExpected: isAuthEnabled(),
    },
    engines: {
      financialState: { database },
    },
  });
}
