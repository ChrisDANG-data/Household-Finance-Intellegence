import { cookies } from "next/headers";

import { withApiHandler } from "@/lib/api/route-handler";
import { isAuthEnabled } from "@/lib/auth/config";
import { env } from "@/lib/env";
import {
  readSessionPayload,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { jsonSuccess } from "@/utils/api-response";
import { userAuthService } from "@/services/auth/user-auth.service";

export async function GET() {
  return withApiHandler(async () => {
    const authEnabled = isAuthEnabled();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const payload = authEnabled ? await readSessionPayload(token ?? null) : null;

    const userCount = authEnabled ? await userAuthService.countUsers() : 0;

    return jsonSuccess({
      authEnabled,
      authenticated: payload !== null,
      user: payload
        ? { id: payload.sub, username: payload.username }
        : null,
      registrationAllowed: env.auth.allowRegistration(),
      hasUsers: userCount > 0,
    });
  });
}
