import { isAuthEnabled } from "@/lib/env";

export { isAuthEnabled };

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/login")) return true;
  if (pathname.startsWith("/api/auth/register")) return true;
  if (pathname === "/api/auth/session") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/api/health") return true;
  return false;
}

export function isAutomationApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/automation/")) return true;
  if (pathname === "/api/integrations/plaid/sync") return true;
  if (pathname === "/api/integrations/plaid/scheduled-sync") return true;
  return false;
}
