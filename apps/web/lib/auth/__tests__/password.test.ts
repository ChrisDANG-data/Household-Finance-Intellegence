import { describe, expect, it } from "vitest";

import {
  hashPassword,
  normalizeUsername,
  validateUsername,
  verifyPassword,
} from "@/lib/auth/password";

describe("password auth", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("my-secure-password");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(verifyPassword("my-secure-password", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("normalizes usernames", () => {
    expect(normalizeUsername(" Chris.Dang ")).toBe("chris.dang");
  });

  it("validates username format", () => {
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("valid_user-1")).toBeNull();
  });
});
