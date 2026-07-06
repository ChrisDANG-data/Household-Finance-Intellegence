import { withApiHandler } from "@/lib/api/route-handler";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { jsonSuccess } from "@/utils/api-response";
import { AppError } from "@/utils/errors";
import { userAuthService } from "@/services/auth/user-auth.service";
import { financialStatePersistence } from "@/services/financial-state/financial-state.persistence";

function setSessionCookie(user: { id: string; username: string }) {
  return createSessionToken(user).then((token) => {
    const response = jsonSuccess({
      authenticated: true,
      user: { id: user.id, username: user.username },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  });
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      throw new AppError("Username and password are required", {
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    const user = await userAuthService.authenticate(username, password);
    if (!user) {
      throw new AppError("Invalid username or password", {
        code: "UNAUTHORIZED",
        statusCode: 401,
      });
    }

    await financialStatePersistence.ensureState(user.id);

    return setSessionCookie(user);
  });
}
