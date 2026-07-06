export const AUTH_SESSION_CHANGED_EVENT = "auth:session-changed";

export function notifyAuthSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}
