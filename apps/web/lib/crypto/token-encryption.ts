import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { env } from "@/lib/env";
import { AppError } from "@/utils/errors";

const ENCRYPTION_PREFIX = "enc:v1:";

function deriveKey(rawKey: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  const decoded = Buffer.from(rawKey, "base64");
  if (decoded.length === 32) return decoded;

  return scryptSync(rawKey, "household-financial-intelligence", 32);
}

function requireEncryptionKey(): Buffer {
  const raw = env.security.tokenEncryptionKey();
  if (!raw) {
    throw new AppError(
      "TOKEN_ENCRYPTION_KEY is required to store sensitive tokens in this environment",
      { code: "SECURITY_NOT_CONFIGURED", statusCode: 503 },
    );
  }
  return deriveKey(raw);
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

/** Encrypt a secret for storage (e.g. Plaid access_token). */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;

  if (!env.security.requiresTokenEncryption()) {
    return plaintext;
  }

  const key = requireEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/** Decrypt a stored secret; plaintext legacy values pass through. */
export function decryptSecret(stored: string): string {
  if (!stored || !isEncryptedValue(stored)) return stored;

  const key = requireEncryptionKey();
  const parts = stored.slice(ENCRYPTION_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new AppError("Invalid encrypted token format", {
      code: "DECRYPTION_ERROR",
      statusCode: 500,
    });
  }

  const [ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
