import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue,
} from "@/lib/crypto/token-encryption";

describe("token-encryption", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.REQUIRE_TOKEN_ENCRYPTION = "true";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("encrypts and decrypts Plaid-style tokens", () => {
    const plaintext = "access-sandbox-abc123";
    const encrypted = encryptSecret(plaintext);

    expect(isEncryptedValue(encrypted)).toBe(true);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("passes through legacy plaintext values", () => {
    const legacy = "access-sandbox-plaintext";
    expect(decryptSecret(legacy)).toBe(legacy);
    expect(isEncryptedValue(legacy)).toBe(false);
  });
});
