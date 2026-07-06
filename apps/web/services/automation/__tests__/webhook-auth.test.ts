import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertAutomationBearer } from "@/services/automation/webhook-auth";

describe("assertAutomationBearer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("accepts a valid bearer token", () => {
    process.env.AUTOMATION_WEBHOOK_TOKEN = "secret-token";
    const request = new Request("http://localhost/api/automation/events", {
      headers: { Authorization: "Bearer secret-token" },
    });

    expect(() => assertAutomationBearer(request)).not.toThrow();
  });

  it("rejects missing bearer in development when token is configured", () => {
    process.env.AUTOMATION_WEBHOOK_TOKEN = "secret-token";
    const request = new Request("http://localhost/api/automation/events");

    expect(() => assertAutomationBearer(request)).toThrow(/Unauthorized/);
  });

  it("fails closed on Vercel when token is not configured", () => {
    process.env.VERCEL = "1";
    delete process.env.AUTOMATION_WEBHOOK_TOKEN;

    const request = new Request("http://localhost/api/automation/events", {
      headers: { Authorization: "Bearer anything" },
    });

    expect(() => assertAutomationBearer(request)).toThrow(/required in production/);
  });
});
