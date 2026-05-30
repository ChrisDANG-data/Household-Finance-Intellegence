export type AiProvider = "claude" | "gemini";

export const AI_PROVIDER_STORAGE_KEY = "fi-ai-provider";

export interface AiProviderConfig {
  claude: boolean;
  gemini: boolean;
  whisper: boolean;
  default: AiProvider;
}

export function readStoredAiProvider(): AiProvider | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
  if (raw === "claude" || raw === "gemini") return raw;
  return null;
}

export function storeAiProvider(provider: AiProvider): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, provider);
}

export function resolveClientProvider(
  stored: AiProvider | null,
  config: AiProviderConfig,
): AiProvider {
  if (stored === "claude" && config.claude) return "claude";
  if (stored === "gemini" && config.gemini) return "gemini";
  if (config.default === "gemini" && config.gemini) return "gemini";
  if (config.claude) return "claude";
  if (config.gemini) return "gemini";
  return config.default;
}
