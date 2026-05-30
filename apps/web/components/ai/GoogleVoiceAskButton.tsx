"use client";

import { useEffect } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAiProvider } from "@/hooks/use-ai-provider";
import {
  useGoogleVoiceInput,
  type RecordingSttProvider,
} from "@/hooks/use-google-voice-input";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

interface GoogleVoiceAskButtonProps {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  className?: string;
  showModeLabel?: boolean;
}

export function GoogleVoiceAskButton({
  disabled,
  onTranscript,
  onError,
  className,
  showModeLabel = false,
}: GoogleVoiceAskButtonProps) {
  const hydrated = useHydrated();
  const {
    provider,
    geminiAvailable,
    whisperAvailable: localSttAvailable,
    loaded: providerLoaded,
  } = useAiProvider();

  const recordingSttProvider: RecordingSttProvider =
    provider === "claude" ? "local" : "gemini";

  const recordingFallback =
    providerLoaded &&
    ((provider === "claude" && localSttAvailable) ||
      (provider === "gemini" && geminiAvailable));

  useEffect(() => {
    sessionStorage.removeItem("fi-voice-prefer-record");
    if (provider === "claude") {
      sessionStorage.removeItem("fi-voice-prefer-record-gemini");
    } else {
      sessionStorage.removeItem("fi-voice-prefer-record-local");
    }
  }, [provider]);

  const { status, listening, processing, voiceMode, toggle, browserSttSupported } =
    useGoogleVoiceInput({
      onTranscript: (text) => onTranscript(text),
      onError,
      recordingFallbackEnabled: recordingFallback,
      recordingSttProvider,
    });

  const modeLabel =
    provider === "claude"
      ? "Mic: browser speech, or free local Whisper if blocked"
      : geminiAvailable
        ? "Mic: browser speech, or Gemini recording if blocked"
        : "Mic: browser speech only";

  const statusHint = !hydrated
    ? "Mic ready"
    : status === "listening"
      ? voiceMode === "record"
        ? provider === "claude"
          ? "Recording… local Whisper"
          : "Recording… Gemini"
        : "Listening… click mic when done"
      : status === "processing"
        ? provider === "claude"
          ? "Local Whisper…"
          : "Transcribing…"
        : browserSttSupported
          ? "Mic ready"
          : recordingFallback
            ? "Mic records audio"
            : "Use Chrome or Edge";

  return (
    <div className={cn("shrink-0 self-end", className)}>
      {showModeLabel ? (
        <p className="mb-1 max-w-[9rem] text-[10px] leading-tight text-muted-foreground">
          {modeLabel}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          "size-11",
          listening &&
            "!border-red-500 !bg-red-500/20 !text-red-600 ring-2 ring-red-500/40 animate-pulse",
          processing && "border-amber-500/50 bg-amber-500/10",
        )}
        disabled={disabled || processing}
        onClick={toggle}
        title={modeLabel}
        aria-label={listening ? "Stop listening" : "Start voice input"}
        aria-pressed={listening}
      >
        {processing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : listening ? (
          <MicOff className="size-4" />
        ) : (
          <Mic className="size-4" />
        )}
      </Button>
      <p
        className={cn(
          "mt-1 max-w-[9rem] text-center text-[10px] leading-tight",
          listening ? "font-semibold text-red-600" : "text-muted-foreground",
        )}
      >
        {statusHint}
      </p>
    </div>
  );
}
