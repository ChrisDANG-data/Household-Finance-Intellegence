import { cookies } from "next/headers";

import { isAuthEnabled } from "@/lib/auth/config";
import {
  readSessionPayload,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { DEFAULT_USER_ID } from "@/services/financial-state/financial-state.persistence";
import { AppError } from "@/utils/errors";

/**
 * Resolve the authenticated household user id for API handlers.
 * When auth is disabled (local dev), falls back to the legacy shared ledger id.
 */
export async function resolveRequestUserId(): Promise<string> {
  if (!isAuthEnabled()) return DEFAULT_USER_ID;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = await readSessionPayload(token ?? null);
  if (!payload) {
    throw new AppError("Authentication required", {
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  }
  return payload.sub;
}

/** Reject client-supplied user_id when it does not match the session user. */
export function assertMatchingUserId(
  sessionUserId: string,
  clientUserId: string | null | undefined,
): void {
  if (!clientUserId || clientUserId === sessionUserId) return;
  throw new AppError("Forbidden: user_id does not match your session", {
    code: "FORBIDDEN",
    statusCode: 403,
  });
}
