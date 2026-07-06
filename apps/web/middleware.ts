import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  isAuthEnabled,
  isAutomationApiPath,
  isPublicPath,
} from "@/lib/auth/config";
import { isValidAutomationBearer } from "@/lib/auth/automation-bearer";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";

function unauthorizedApi(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    },
    { status: 401 },
  );
}

export async function middleware(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSession = await verifySessionToken(session);

  if (isAutomationApiPath(pathname) && isValidAutomationBearer(request)) {
    return NextResponse.next();
  }

  if (hasSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return unauthorizedApi();
  }

  const homeUrl = request.nextUrl.clone();
  homeUrl.pathname = "/";
  return NextResponse.redirect(homeUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
