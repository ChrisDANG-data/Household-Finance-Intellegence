export type AiProvider = "claude" | "gemini";

export interface LlmTokenUsage {
  input_tokens: number;
  output_tokens: number;
  /** True when counts are approximated (chars ÷ 4), not from the API. */
  estimated: boolean;
}

export interface LlmCompleteRequest {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  provider?: AiProvider;
  /** Optional label for logs (e.g. scenario-chat, document-extraction). */
  caller?: string;
}

export interface LlmCompleteResponse {
  text: string;
  model: string;
  provider: AiProvider;
  usage?: LlmTokenUsage;
}

export interface AiProviderAvailability {
  claude: boolean;
  gemini: boolean;
  /** Cloud Whisper via OPENAI_API_KEY or OPENROUTER_API_KEY (paid, reliable). */
  stt_cloud: boolean;
  /** Free on-device Xenova Whisper (local dev only). */
  stt_local: boolean;
  default: AiProvider;
}
