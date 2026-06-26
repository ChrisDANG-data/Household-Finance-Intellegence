import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    ai: {
      geminiApiKey: vi.fn(() => "test-gemini-key"),
    },
  },
}));

vi.mock("@/services/ai/stt/local-whisper-stt.service", () => ({
  transcribeAudioLocalWhisper: vi.fn(async () => {
    throw new Error("ffmpeg missing");
  }),
}));

vi.mock("@/services/ai/stt/gemini-stt.service", () => ({
  transcribeAudioWithGemini: vi.fn(async () => "hello from gemini"),
}));

vi.mock("@/services/ai/stt/whisper-stt.service", () => ({
  transcribeAudioWithWhisper: vi.fn(async () => "hello from cloud whisper"),
}));

import { transcribeWithFallback } from "@/services/ai/stt/transcribe-with-fallback";

describe("transcribeWithFallback", () => {
  afterEach(() => {
    delete process.env.STT_GEMINI_FALLBACK;
  });

  it("uses cloud Whisper when provider is whisper", async () => {
    const result = await transcribeWithFallback(
      Buffer.from("fake-audio"),
      "audio/webm",
      "whisper",
    );

    expect(result).toEqual({
      text: "hello from cloud whisper",
      provider: "whisper",
    });
  });

  it("does not fall back to Gemini when local Whisper fails (Claude voice path)", async () => {
    await expect(
      transcribeWithFallback(Buffer.from("fake-audio"), "audio/webm", "local"),
    ).rejects.toThrow(/Local voice recognition failed/i);
  });

  it("falls back to Gemini only when STT_GEMINI_FALLBACK=true", async () => {
    process.env.STT_GEMINI_FALLBACK = "true";
    const result = await transcribeWithFallback(
      Buffer.from("fake-audio"),
      "audio/webm",
      "local",
    );

    expect(result).toEqual({
      text: "hello from gemini",
      provider: "gemini",
    });
  });
});
