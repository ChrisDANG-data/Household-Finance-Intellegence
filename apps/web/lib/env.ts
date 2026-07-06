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
  isVercel: () => process.env.VERCEL === "1",
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

  auth: {
    /** HMAC secret for session cookies (min 32 chars recommended). */
    secret: () => {
      if (!isAuthEnabled()) return optionalEnv("AUTH_SECRET", "dev-insecure-auth-secret");
      const value = optionalEnv("AUTH_SECRET").trim();
      if (!value) {
        throw new Error(
          "Missing AUTH_SECRET — required when auth is enabled (Vercel or AUTH_ENABLED=true)",
        );
      }
      return value;
    },
    /** Allow POST /api/auth/register (default: true locally, false on Vercel unless set). */
    allowRegistration: () => {
      const flag = optionalEnv("AUTH_ALLOW_REGISTRATION").trim().toLowerCase();
      if (flag === "true") return true;
      if (flag === "false") return false;
      return !env.isVercel();
    },
  },

  security: {
    /** 32-byte key as base64 or 64-char hex — encrypts Plaid tokens at rest. */
    tokenEncryptionKey: () => optionalEnv("TOKEN_ENCRYPTION_KEY").trim(),
    requiresTokenEncryption: () =>
      env.isVercel() ||
      optionalEnv("TOKEN_ENCRYPTION_KEY").trim().length > 0 ||
      optionalEnv("REQUIRE_TOKEN_ENCRYPTION", "").toLowerCase() === "true",
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
    orchestratorUrl: () => {
      const explicit = optionalEnv("LANGGRAPH_URL").trim();
      if (explicit) return explicit;
      if (isDevelopment() && !env.isVercel()) {
        return "http://127.0.0.1:8081";
      }
      return "";
    },
    enabled: () => {
      const flag = optionalEnv("LANGGRAPH_ENABLED", "").trim().toLowerCase();
      if (flag === "true") return true;
      if (flag === "false") return false;
      return (
        isDevelopment() &&
        !env.isVercel() &&
        env.langgraph.orchestratorUrl().length > 0
      );
    },
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

/** Household login required — default on Vercel; opt-in locally via AUTH_ENABLED=true. */
export function isAuthEnabled(): boolean {
  const flag = process.env.AUTH_ENABLED?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env.isVercel();
}
