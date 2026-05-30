/**
 * Typed environment access for server-side code.
 * Validates required variables at runtime when accessed.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const env = {
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  databaseUrl: () => requireEnv("DATABASE_URL"),
  appUrl: optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),

  ai: {
    openaiApiKey: () => optionalEnv("OPENAI_API_KEY"),
    /** OpenRouter key (preferred for Whisper STT when set). */
    openRouterApiKey: () => optionalEnv("OPENROUTER_API_KEY"),
    /** Whisper / STT: OPENROUTER_API_KEY if set, else OPENAI_API_KEY. */
    whisperApiKey: () => {
      const openRouter = optionalEnv("OPENROUTER_API_KEY");
      if (openRouter) return openRouter;
      return optionalEnv("OPENAI_API_KEY");
    },
    anthropicApiKey: () => optionalEnv("ANTHROPIC_API_KEY"),
    geminiApiKey: () => optionalEnv("GOOGLE_API_KEY", optionalEnv("GEMINI_API_KEY")),
    defaultProvider: () => optionalEnv("AI_PROVIDER", "claude"),
  },

  upload: {
    maxSizeMb: Number(optionalEnv("UPLOAD_MAX_SIZE_MB", "25")),
    storageProvider: optionalEnv("STORAGE_PROVIDER", "local"),
  },

  ocr: {
    provider: () => optionalEnv("OCR_PROVIDER"),
  },

  vector: {
    provider: () => optionalEnv("VECTOR_STORE_PROVIDER", "pgvector"),
  },

  tts: {
    provider: () => optionalEnv("TTS_PROVIDER"),
  },

  automation: {
    webhookToken: () => optionalEnv("AUTOMATION_WEBHOOK_TOKEN"),
    n8nCallbackUrl: () => optionalEnv("N8N_CALLBACK_URL"),
    n8nEncryptionKey: () => optionalEnv("N8N_ENCRYPTION_KEY"),
  },

  plaid: {
    /** Direct Plaid API (Link token, future item exchange). */
    clientId: () => optionalEnv("PLAID_CLIENT_ID"),
    secret: () => optionalEnv("PLAID_SECRET"),
    environment: (): "sandbox" | "production" =>
      optionalEnv("PLAID_ENV", "sandbox") === "production"
        ? "production"
        : "sandbox",
    /** OAuth redirect — only set if registered in Plaid dashboard */
    redirectUri: () => optionalEnv("PLAID_REDIRECT_URI"),
    /** Optional MCP wrapper for balance sync (separate from Plaid secret). */
    mcpBaseUrl: () => optionalEnv("PLAID_MCP_BASE_URL"),
    mcpToken: () => optionalEnv("PLAID_MCP_TOKEN"),
  },

  langgraph: {
    orchestratorUrl: () => optionalEnv("LANGGRAPH_URL"),
    enabled: () => optionalEnv("LANGGRAPH_ENABLED", "false") === "true",
  },
} as const;

export function isDevelopment(): boolean {
  return env.nodeEnv === "development";
}
