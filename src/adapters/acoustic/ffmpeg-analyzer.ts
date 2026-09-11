/**
 * ffmpeg I/O for the acoustic extractor.
 * Decode is stereo (2 ch, 16 kHz) before any mix-down so split-channel overlap
 * survives (Xiao et al., ICASSP 2011; Ghosh et al., Interspeech 2010). Dual-mono
 * (ρ ≈ 1) is treated as one channel in measureStereo.
 */
import { spawn } from "node:child_process";
import { access, chmod, constants, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { AcousticAnalyzer } from "@/application/ports";
import type { AudioBytes } from "@/application/ports";
import { err, ok, type Result } from "@/domain/result";
import type { AnalyzeError } from "@/domain/errors";
import { measureStereo, SAMPLE_RATE } from "./measure-acoustics";

export { SAMPLE_RATE, measurePcm, measureStereo } from "./measure-acoustics";

const ensureExecutable = async (bin: string): Promise<string> => {
  try {
    await access(bin, constants.X_OK);
    return bin;
  } catch {
    await chmod(bin, 0o755);
    await access(bin, constants.X_OK);
    return bin;
  }
};

async function runFfmpeg(args: string[], input?: Uint8Array): Promise<Uint8Array> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static binary is missing");
  }
  const bin = await ensureExecutable(ffmpegPath);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`));
        return;
      }
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function pcmStereo(pcm: Uint8Array): { left: Float32Array; right: Float32Array } {
  const frames = Math.floor(pcm.byteLength / 4);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, frames * 2);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = samples[i * 2]! / 32768;
    right[i] = samples[i * 2 + 1]! / 32768;
  }
  return { left, right };
}

/** Stereo decode before mix-down (Xiao ICASSP 2011; Ghosh Interspeech 2010). */
export async function decodePcmStereo(
  bytes: Uint8Array,
): Promise<{ left: Float32Array; right: Float32Array }> {
  const pcm = await runFfmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "2",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "s16le",
      "pipe:1",
    ],
    bytes,
  );
  return pcmStereo(pcm);
}

export async function decodePcm(bytes: Uint8Array): Promise<Float32Array> {
  const { left, right } = await decodePcmStereo(bytes);
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.5 * (left[i]! + right[i]!);
  }
  return out;
}

export class FfmpegAcousticAnalyzer implements AcousticAnalyzer {
  async measure(audio: AudioBytes): Promise<Result<import("@/domain").AcousticMeasurements, AnalyzeError>> {
    try {
      const { left, right } = await decodePcmStereo(audio.bytes);
      return ok(measureStereo(left, right));
    } catch (error) {
      return err({
        tag: "decode_failed",
        name: audio.name,
        cause: error instanceof Error ? error.message : "decode failed",
      });
    }
  }

  async extractWindow(
    audio: AudioBytes,
    startSec: number,
    endSec: number,
  ): Promise<Result<AudioBytes, AnalyzeError>> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "autoace-"));
    const inputPath = path.join(dir, "clip.bin");
    try {
      await writeFile(inputPath, audio.bytes);
      const duration = Math.max(0.05, endSec - startSec);
      const wav = await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        startSec.toFixed(3),
        "-t",
        duration.toFixed(3),
        "-i",
        inputPath,
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-f",
        "wav",
        "pipe:1",
      ]);
      return ok({
        // Generic name: never leak call_*.ogg or window timestamps to Gemini.
        name: "clip.wav",
        bytes: wav,
        mediaType: "audio/wav",
      });
    } catch (error) {
      return err({
        tag: "decode_failed",
        name: audio.name,
        cause: error instanceof Error ? error.message : "window extract failed",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
