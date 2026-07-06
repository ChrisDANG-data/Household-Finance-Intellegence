import { withApiHandler } from "@/lib/api/route-handler";
import {
  clearSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { jsonSuccess } from "@/utils/api-response";

export async function POST() {
  return withApiHandler(async () => {
    const response = jsonSuccess({ authenticated: false });
    response.cookies.set(SESSION_COOKIE_NAME, "", clearSessionCookieOptions());
    return response;
  });
}
