import { env } from "@/lib/env";

export const SESSION_COOKIE_NAME = "hfi_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  sub: string;
  username: string;
  exp: number;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64Url(bytes);
}

function decodeBase64Url(value: string): string {
  const bytes = base64UrlToBytes(value);
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(user: {
  id: string;
  username: string;
}): Promise<string> {
  const secret = env.auth.secret();
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = await sign(body, secret);
  return `${body}.${signature}`;
}

export async function readSessionPayload(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;

  let secret: string;
  try {
    secret = env.auth.secret();
  } catch {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  const expected = await sign(body, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(body)) as SessionPayload;
    if (
      typeof payload.exp !== "number" ||
      payload.exp < Math.floor(Date.now() / 1000) ||
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string"
    ) {
      return null;
    }
    if (payload.sub.length === 0 || payload.username.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  return (await readSessionPayload(token)) !== null;
}

export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearSessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: 0;
  expires: Date;
} {
  return {
    ...sessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  };
}
