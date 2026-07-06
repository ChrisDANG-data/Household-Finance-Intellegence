import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

/** Hash a plaintext password for storage (scrypt + random salt). */
export function hashPassword(plaintext: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plaintext, salt, SCRYPT_KEY_LENGTH);
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

/** Verify candidate password against stored hash. */
export function verifyPassword(plaintext: string, storedHash: string): boolean {
  if (!storedHash.startsWith("scrypt:")) return false;

  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;

  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const derived = scryptSync(plaintext, salt, expected.length);

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3 || normalized.length > 32) {
    return "Username must be 3–32 characters";
  }
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    return "Username may only contain letters, numbers, dots, underscores, and hyphens";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}
