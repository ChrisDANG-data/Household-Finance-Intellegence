"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type AiProvider,
  type AiProviderConfig,
  readStoredAiProvider,
  resolveClientProvider,
  storeAiProvider,
} from "@/lib/ai-provider";

const DEFAULT_CONFIG: AiProviderConfig = {
  claude: false,
  gemini: false,
  whisper: false,
  default: "claude",
};

interface AiProviderContextValue {
  provider: AiProvider;
  setProvider: (provider: AiProvider) => void;
  config: AiProviderConfig;
  loaded: boolean;
  claudeAvailable: boolean;
  geminiAvailable: boolean;
  whisperAvailable: boolean;
}

const AiProviderContext = createContext<AiProviderContextValue | null>(null);

export function AiProviderProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AiProviderConfig>(DEFAULT_CONFIG);
  const [provider, setProviderState] = useState<AiProvider>("claude");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/ai/config", { cache: "no-store" });
        const json = (await res.json()) as {
          success: boolean;
          data?: AiProviderConfig;
        };
        if (cancelled || !json.success || !json.data) return;

        const stored = readStoredAiProvider();
        const resolved = resolveClientProvider(stored, json.data);
        setConfig(json.data);
        setProviderState(resolved);
      } catch {
        const stored = readStoredAiProvider();
        if (stored) setProviderState(stored);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setProvider = useCallback(
    (next: AiProvider) => {
      if (next === "claude" && !config.claude) return;
      if (next === "gemini" && !config.gemini) return;
      storeAiProvider(next);
      setProviderState(next);
    },
    [config.claude, config.gemini],
  );

  const value = useMemo(
    () => ({
      provider,
      setProvider,
      config,
      loaded,
      claudeAvailable: config.claude,
      geminiAvailable: config.gemini,
      whisperAvailable: config.whisper,
    }),
    [provider, setProvider, config, loaded],
  );

  return (
    <AiProviderContext.Provider value={value}>
      {children}
    </AiProviderContext.Provider>
  );
}

export function useAiProvider(): AiProviderContextValue {
  const ctx = useContext(AiProviderContext);
  if (!ctx) {
    throw new Error("useAiProvider must be used within AiProviderProvider");
  }
  return ctx;
}
