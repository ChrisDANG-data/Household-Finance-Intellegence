/** Client-side mirror of server auth flag (set at build time in next.config.ts). */
export function isClientAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
}
