"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionCtor = new () => SpeechRecognition;

type VoiceMode = "browser" | "record";
export type RecordingSttProvider = "local" | "gemini" | "whisper";

function preferRecordKey(stt: RecordingSttProvider): string {
  return `fi-voice-prefer-record-${stt}`;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function readPreferRecording(stt: RecordingSttProvider): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(preferRecordKey(stt)) === "1";
}

function storePreferRecording(stt: RecordingSttProvider): void {
  sessionStorage.setItem(preferRecordKey(stt), "1");
}

export type VoiceInputStatus = "idle" | "listening" | "processing";

export interface UseGoogleVoiceInputOptions {
  onTranscript: (text: string, final?: boolean) => void;
  onError?: (message: string) => void;
  /** When true, use mic recording + /api/stt if browser speech fails or is blocked. */
  recordingFallbackEnabled?: boolean;
  /** STT backend for recorded audio (Claude → cloud/local Whisper, Gemini → gemini). */
  recordingSttProvider?: RecordingSttProvider;
  lang?: string;
}

const UNSUPPORTED_MSG =
  "Voice needs Chrome or Edge. Type your question.";

function browserBlockedMessage(stt: RecordingSttProvider | undefined): string {
  if (stt === "whisper") {
    return "Browser speech could not reach Google. Cloud Whisper will transcribe your recording — or type your question.";
  }
  if (stt === "local") {
    return "Browser speech could not reach Google. Local voice transcription will be used when you record — or type your question.";
  }
  if (stt === "gemini") {
    return "Browser speech could not reach Google. Switch to Gemini for recorded voice, or type your question.";
  }
  return "Browser speech could not reach Google (VPN/firewall/ad blocker). Type your question.";
}

export function useGoogleVoiceInput({
  onTranscript,
  onError,
  recordingFallbackEnabled = false,
  recordingSttProvider = "local",
  lang = "en-US",
}: UseGoogleVoiceInputOptions) {
  const sttProviderRef = useRef(recordingSttProvider);
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("browser");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const gotTranscriptRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const userStoppedRef = useRef(false);
  const networkFailedRef = useRef(false);
  const modeRef = useRef<VoiceMode>("browser");

  const browserSttSupported = Boolean(getSpeechRecognition());

  const finishBrowserSession = useCallback(
    (options?: { noSpeech?: boolean }) => {
      sessionActiveRef.current = false;
      userStoppedRef.current = false;
      recognitionRef.current = null;
      if (modeRef.current === "browser") {
        setStatus("idle");
      }
      if (options?.noSpeech && !gotTranscriptRef.current && !networkFailedRef.current) {
        onError?.(
          "No speech detected. Click mic, speak, then click mic again to stop.",
        );
      }
    },
    [onError],
  );

  const cleanupMedia = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    chunksRef.current = [];
  }, []);

  const abortSession = useCallback(() => {
    sessionActiveRef.current = false;
    userStoppedRef.current = true;
    networkFailedRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    cleanupMedia();
    gotTranscriptRef.current = false;
    modeRef.current = "browser";
    setVoiceMode("browser");
    setStatus("idle");
  }, [cleanupMedia]);

  useEffect(() => {
    sttProviderRef.current = recordingSttProvider;
  }, [recordingSttProvider]);

  const transcribeRecording = useCallback(
    async (blob: Blob) => {
      if (blob.size < 2000) {
        onError?.(
          "Recording too short. Click mic, speak for at least 2 seconds, then click mic again.",
        );
        setStatus("idle");
        return;
      }

      setStatus("processing");
      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        formData.append("provider", sttProviderRef.current);
        const res = await fetch("/api/stt/transcribe", {
          method: "POST",
          body: formData,
        });
        const raw = await res.text();
        let json: {
          success: boolean;
          data?: { text: string };
          error?: { message: string; code?: string };
        };
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          const isHtml =
            raw.trimStart().startsWith("<!DOCTYPE") ||
            raw.trimStart().startsWith("<html");
          const hint = isHtml
            ? res.status >= 500
              ? `Voice API server error (${res.status}). Restart: cd apps/web && npm run dev — then check the terminal for compile errors.`
              : `Voice API unavailable (${res.status}). Is npm run dev running on http://localhost:3000?`
            : `Voice transcription failed (${res.status}).`;
          throw new Error(hint);
        }
        if (!res.ok || !json.success || !json.data?.text) {
          const apiMsg = json.error?.message?.trim();
          if (apiMsg) throw new Error(apiMsg);
          throw new Error(`Transcription failed (${res.status}).`);
        }
        gotTranscriptRef.current = true;
        onTranscript(json.data.text, true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Voice transcription failed";
        onError?.(message);
      } finally {
        sessionActiveRef.current = false;
        modeRef.current = "browser";
        setVoiceMode("browser");
        setStatus("idle");
      }
    },
    [onTranscript, onError],
  );

  const startRecordingSession = useCallback(async () => {
    if (!recordingFallbackEnabled) {
      onError?.(browserBlockedMessage(sttProviderRef.current));
      setStatus("idle");
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError?.("Microphone not available in this browser.");
        setStatus("idle");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      gotTranscriptRef.current = false;
      sessionActiveRef.current = true;
      userStoppedRef.current = false;
      modeRef.current = "record";
      setVoiceMode("record");

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        void transcribeRecording(blob);
      };

      recorder.start(500);
      setStatus("listening");
    } catch (err) {
      sessionActiveRef.current = false;
      modeRef.current = "browser";
      setVoiceMode("browser");
      onError?.(
        err instanceof Error
          ? `Microphone error: ${err.message}`
          : "Could not access microphone. Allow mic permission and try again.",
      );
      setStatus("idle");
    }
  }, [recordingFallbackEnabled, onError, transcribeRecording]);

  const switchToRecordingFallback = useCallback(
    (_reason?: string) => {
      storePreferRecording(sttProviderRef.current);
      networkFailedRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      void startRecordingSession();
    },
    [startRecordingSession],
  );

  const startBrowserRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return false;

    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    gotTranscriptRef.current = false;
    networkFailedRef.current = false;
    sessionActiveRef.current = true;
    userStoppedRef.current = false;
    modeRef.current = "browser";
    setVoiceMode("browser");

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += text;
        } else {
          interim += text;
        }
      }
      const display = (finalText || interim).trim();
      if (display) {
        gotTranscriptRef.current = true;
        onTranscript(display, Boolean(finalText.trim()));
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;

      if (event.error === "network" || event.error === "service-not-allowed") {
        if (recordingFallbackEnabled) {
          switchToRecordingFallback();
        } else {
          networkFailedRef.current = true;
          sessionActiveRef.current = false;
          recognitionRef.current = null;
          setStatus("idle");
          onError?.(browserBlockedMessage(sttProviderRef.current));
        }
        return;
      }

      if (event.error === "not-allowed") {
        finishBrowserSession();
        onError?.(
          "Microphone permission denied. Allow mic access in browser settings.",
        );
        return;
      }

      finishBrowserSession();
      onError?.(
        `Voice error: ${event.error}. Try Chrome/Edge, or type your question.`,
      );
    };

    recognition.onend = () => {
      if (networkFailedRef.current || modeRef.current === "record") {
        recognitionRef.current = null;
        return;
      }

      if (userStoppedRef.current) {
        finishBrowserSession({ noSpeech: !gotTranscriptRef.current });
        return;
      }

      if (!sessionActiveRef.current) {
        recognitionRef.current = null;
        setStatus("idle");
        return;
      }

      try {
        recognition.start();
      } catch {
        finishBrowserSession({
          noSpeech: !gotTranscriptRef.current,
        });
      }
    };

    try {
      recognition.start();
      return true;
    } catch (err) {
      sessionActiveRef.current = false;
      recognitionRef.current = null;
      setStatus("idle");
      if (recordingFallbackEnabled) {
        void startRecordingSession();
        return true;
      }
      onError?.(
        err instanceof Error
          ? `Could not start voice: ${err.message}`
          : "Could not start voice input",
      );
      return false;
    }
  }, [
    lang,
    onTranscript,
    onError,
    finishBrowserSession,
    recordingFallbackEnabled,
    switchToRecordingFallback,
    startRecordingSession,
  ]);

  const start = useCallback(() => {
    const preferRecord =
      recordingFallbackEnabled &&
      (readPreferRecording(recordingSttProvider) || !browserSttSupported);

    if (preferRecord && recordingFallbackEnabled) {
      setStatus("listening");
      void startRecordingSession();
      return;
    }

    if (!browserSttSupported) {
      if (recordingFallbackEnabled) {
        setStatus("listening");
        void startRecordingSession();
        return;
      }
      onError?.(UNSUPPORTED_MSG);
      return;
    }

    setStatus("listening");
    const started = startBrowserRecognition();
    if (!started) {
      setStatus("idle");
    }
  }, [
    browserSttSupported,
    recordingFallbackEnabled,
    recordingSttProvider,
    startBrowserRecognition,
    startRecordingSession,
    onError,
  ]);

  const stop = useCallback(() => {
    if (modeRef.current === "record" && mediaRecorderRef.current) {
      userStoppedRef.current = true;
      sessionActiveRef.current = false;
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      } else {
        cleanupMedia();
        setStatus("idle");
      }
      return;
    }

    if (!recognitionRef.current || !sessionActiveRef.current) {
      abortSession();
      return;
    }
    userStoppedRef.current = true;
    try {
      recognitionRef.current.stop();
    } catch {
      finishBrowserSession({ noSpeech: !gotTranscriptRef.current });
    }
  }, [abortSession, finishBrowserSession, cleanupMedia]);

  const toggle = useCallback(() => {
    if (status === "listening") {
      stop();
      return;
    }
    if (status === "processing") return;
    start();
  }, [status, start, stop]);

  return {
    status,
    listening: status === "listening",
    processing: status === "processing",
    voiceMode,
    toggle,
    stop: abortSession,
    browserSttSupported,
    recordingFallbackEnabled,
    busy: status !== "idle",
  };
}
