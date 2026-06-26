import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openRouterFetch = vi.fn();
const openAiFetch = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    appUrl: "http://localhost:3000",
    ai: {
      openRouterApiKey: vi.fn(() => "sk-or-test"),
      openaiApiKey: vi.fn(() => "sk-openai-test"),
      sttCloudPreference: vi.fn(() => "auto" as const),
    },
  },
}));

import { env } from "@/lib/env";
import { transcribeAudioWithWhisper } from "@/services/ai/stt/whisper-stt.service";

describe("transcribeAudioWithWhisper", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("openrouter.ai")) return openRouterFetch();
      if (url.includes("api.openai.com")) return openAiFetch();
      throw new Error(`unexpected url ${url}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    openRouterFetch.mockReset();
    openAiFetch.mockReset();
    vi.mocked(env.ai.sttCloudPreference).mockReturnValue("auto");
    vi.mocked(env.ai.openRouterApiKey).mockReturnValue("sk-or-test");
    vi.mocked(env.ai.openaiApiKey).mockReturnValue("sk-openai-test");
  });

  it("falls back to OpenAI when OpenRouter quota is exhausted", async () => {
    openRouterFetch.mockResolvedValue(
      new Response("quota", { status: 402, statusText: "Payment Required" }),
    );
    openAiFetch.mockResolvedValue(
      new Response(JSON.stringify({ text: "hello openai" }), { status: 200 }),
    );

    const text = await transcribeAudioWithWhisper(
      Buffer.from("audio"),
      "audio/webm",
    );

    expect(text).toBe("hello openai");
    expect(openRouterFetch).toHaveBeenCalledOnce();
    expect(openAiFetch).toHaveBeenCalledOnce();
  });

  it("uses OpenAI only when STT_CLOUD_PROVIDER=openai", async () => {
    vi.mocked(env.ai.sttCloudPreference).mockReturnValue("openai");
    openAiFetch.mockResolvedValue(
      new Response(JSON.stringify({ text: "direct openai" }), { status: 200 }),
    );

    const text = await transcribeAudioWithWhisper(
      Buffer.from("audio"),
      "audio/webm",
    );

    expect(text).toBe("direct openai");
    expect(openRouterFetch).not.toHaveBeenCalled();
    expect(openAiFetch).toHaveBeenCalledOnce();
  });
});
