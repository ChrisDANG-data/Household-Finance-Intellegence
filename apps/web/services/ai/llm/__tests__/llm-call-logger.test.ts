import { describe, expect, it } from "vitest";

import {
  buildTokenUsage,
  estimateCostUsd,
  estimateTokensFromText,
} from "../llm-call-logger";

describe("llm-call-logger", () => {
  it("estimates ~1 token per 4 characters", () => {
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("abcdefgh")).toBe(2);
  });

  it("charges $0 for Gemini", () => {
    const usage = buildTokenUsage("sys", "user", "hello world");
    const { usd, note } = estimateCostUsd("gemini", usage);
    expect(usd).toBe(0);
    expect(note).toContain("Gemini");
  });

  it("estimates Claude cost from token counts", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      estimated: true,
    };
    const { usd } = estimateCostUsd("claude", usage);
    expect(usd).toBe(18);
  });
});
