import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "@xenova/transformers";
import type { AutomaticSpeechRecognitionPipeline } from "@xenova/transformers";
import { WaveFile } from "wavefile";

import { AppError } from "@/utils/errors";
import { resolveFfmpegPath } from "@/services/ai/stt/resolve-ffmpeg-path";

const MODEL_NAME =
  process.env.LOCAL_WHISPER_MODEL ?? "Xenova/whisper-tiny.en";

/** ~0.35 s at 16 kHz — shorter clips rarely transcribe well. */
const MIN_SAMPLES = Math.floor(16000 * 0.35);
const MIN_RMS = 0.002;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

async function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriber) {
    transcriber = await pipeline("automatic-speech-recognition", MODEL_NAME, {
      quantized: true,
    });
  }
  return transcriber;
}

async function convertToWavWithFfmpeg(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  let ffmpegPath: string;
  try {
    ffmpegPath = resolveFfmpegPath();
  } catch {
    throw new AppError(
      "ffmpeg binary missing for local voice. Run: cd apps/web && node scripts/ensure-ffmpeg.mjs — or use Gemini voice mode.",
      { code: "STT_NOT_CONFIGURED", statusCode: 503 },
    );
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      ffmpegPath,
      [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        outputPath,
      ],
      { stdio: "ignore" },
    );
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

type ParsedWaveFile = WaveFile & {
  fmt: { numChannels: number };
  toMono(): void;
  toBitDepth(bitDepth: string): void;
  toSampleRate(rate: number): void;
  getSamples(
    interleaved: boolean,
    indices?: number[],
  ): Float32Array | Float32Array[];
};

/** Load 16 kHz mono Float32 samples from a WAV file (Node — no AudioContext). */
function loadWavSamples(wavBuffer: Buffer): Float32Array {
  const wav = new WaveFile(wavBuffer) as ParsedWaveFile;
  if (wav.fmt.numChannels > 1) {
    wav.toMono();
  }
  wav.toBitDepth("32f");
  wav.toSampleRate(16000);

  let audioData = wav.getSamples(false);
  if (Array.isArray(audioData)) {
    audioData = audioData[0];
  }
  const samples =
    audioData instanceof Float32Array
      ? audioData
      : new Float32Array(audioData as ArrayLike<number>);
  return normalizeAudio(samples);
}

function normalizeAudio(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak < 1e-8) return samples;
  const out = new Float32Array(samples.length);
  const gain = 0.95 / peak;
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] * gain;
  }
  return out;
}

function measureRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  return Math.sqrt(sumSq / samples.length);
}

function extractTranscriptionText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result.trim();

  if (Array.isArray(result)) {
    return result
      .map((item) => extractTranscriptionText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) {
      return obj.text.trim();
    }
    if (Array.isArray(obj.chunks)) {
      const joined = obj.chunks
        .map((chunk) => {
          if (!chunk || typeof chunk !== "object") return "";
          const text = (chunk as { text?: string }).text;
          return typeof text === "string" ? text : "";
        })
        .join(" ")
        .trim();
      if (joined) return joined;
    }
  }

  return "";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * Free on-device Whisper via @xenova/transformers (no API key).
 * Converts uploaded audio to 16 kHz WAV, then transcribes.
 */
export async function transcribeAudioLocalWhisper(
  audio: Buffer,
  mimeType: string,
): Promise<string> {
  if (audio.length < 500) {
    throw new AppError(
      "Recording too short. Speak for at least 2 seconds, then click the mic again.",
      { code: "STT_EMPTY_RESPONSE", statusCode: 400 },
    );
  }

  const id = randomUUID();
  const dir = join(tmpdir(), "fi-stt");
  await mkdir(dir, { recursive: true });
  const inputPath = join(dir, `${id}-in.${extensionForMime(mimeType)}`);
  const wavPath = join(dir, `${id}.wav`);

  try {
    await writeFile(inputPath, audio);

    const wavFilePath = mimeType.includes("wav") ? inputPath : wavPath;
    if (!mimeType.includes("wav")) {
      await convertToWavWithFfmpeg(inputPath, wavPath);
    }

    const wavBuffer = await readFile(wavFilePath);
    if (wavBuffer.length < 44) {
      throw new AppError("Audio file could not be decoded.", {
        code: "STT_REQUEST_FAILED",
        statusCode: 502,
      });
    }

    const samples = loadWavSamples(wavBuffer);
    if (samples.length < MIN_SAMPLES) {
      throw new AppError(
        "Recording too short. Speak for at least 2 seconds, then click the mic again.",
        { code: "STT_EMPTY_RESPONSE", statusCode: 400 },
      );
    }

    const rms = measureRms(samples);
    if (rms < MIN_RMS) {
      throw new AppError(
        "No speech detected in recording. Speak louder, closer to the mic, then try again.",
        { code: "STT_EMPTY_RESPONSE", statusCode: 400 },
      );
    }

    const asr = await getTranscriber();
    const result = await asr(samples, {
      language: "en",
      task: "transcribe",
      return_timestamps: false,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const trimmed = extractTranscriptionText(result);
    if (!trimmed) {
      throw new AppError(
        "Could not understand the recording. Speak clearly for 2+ seconds, or type your question.",
        { code: "STT_EMPTY_RESPONSE", statusCode: 502 },
      );
    }

    return trimmed;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(`Local speech recognition failed: ${message}`, {
      code: "STT_REQUEST_FAILED",
      statusCode: 502,
    });
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => undefined),
      unlink(wavPath).catch(() => undefined),
    ]);
  }
}

/** Warm model in dev (optional); safe to call and ignore errors. */
export async function warmLocalWhisperModel(): Promise<void> {
  try {
    await getTranscriber();
  } catch {
    // first download may fail offline — runtime will retry
  }
}
