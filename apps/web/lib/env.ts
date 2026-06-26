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
    /** OpenRouter key (optional proxy for Whisper STT). */
    openRouterApiKey: () => optionalEnv("OPENROUTER_API_KEY"),
    /** openai | openrouter | auto — auto tries OpenRouter then OpenAI on quota errors. */
    sttCloudPreference: (): "openai" | "openrouter" | "auto" => {
      const raw = optionalEnv("STT_CLOUD_PROVIDER", "auto").toLowerCase();
      if (raw === "openai" || raw === "openrouter") return raw;
      return "auto";
    },
    hasCloudStt: () => {
      const openRouter = optionalEnv("OPENROUTER_API_KEY").trim();
      const openAi = optionalEnv("OPENAI_API_KEY").trim();
      return Boolean(openRouter || openAi);
    },
    /** Primary cloud STT key (legacy — prefer explicit OpenRouter/OpenAI routing). */
    whisperApiKey: () => {
      const pref = optionalEnv("STT_CLOUD_PROVIDER", "auto").toLowerCase();
      const openRouter = optionalEnv("OPENROUTER_API_KEY");
      const openAi = optionalEnv("OPENAI_API_KEY");
      if (pref === "openai") return openAi;
      if (openRouter) return openRouter;
      return openAi;
    },
    anthropicApiKey: () => optionalEnv("ANTHROPIC_API_KEY"),
    geminiApiKey: () => optionalEnv("GOOGLE_API_KEY", optionalEnv("GEMINI_API_KEY")),
    defaultProvider: () => optionalEnv("AI_PROVIDER", "claude"),
  },

  upload: {
    maxSizeMb: Number(optionalEnv("UPLOAD_MAX_SIZE_MB", "25")),
    /** Resolved provider (defaults to local). */
    storageProvider: (): "local" | "blob" => {
      const value = optionalEnv("STORAGE_PROVIDER", "local").toLowerCase();
      return value === "blob" ? "blob" : "local";
    },
    /** Raw env value, or empty when unset (for Vercel auto-detection). */
    storageProviderExplicit: (): "" | "local" | "blob" => {
      const raw = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
      if (raw === "blob") return "blob";
      if (raw === "local") return "local";
      return "";
    },
    blobReadWriteToken: () => optionalEnv("BLOB_READ_WRITE_TOKEN"),
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
    /** LLM narration layer after deterministic LangGraph specialists. */
    writerEnabled: () =>
      optionalEnv("LANGGRAPH_WRITER_ENABLED", "false") === "true",
  },

  obsidian: {
    /** Local folder Obsidian opens as a vault; optional (ZIP export always works). */
    vaultPath: () => {
      const value = optionalEnv("OBSIDIAN_VAULT_PATH").trim();
      return value.length > 0 ? value : null;
    },
  },
} as const;

export function isDevelopment(): boolean {
  return env.nodeEnv === "development";
}
