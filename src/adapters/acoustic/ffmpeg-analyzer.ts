import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { AcousticAnalyzer } from "@/application/ports";
import type { AudioBytes } from "@/application/ports";
import { err, ok, type Result } from "@/domain/result";
import type { AcousticMeasurements } from "@/domain";
import type { AnalyzeError } from "@/domain/errors";

const SAMPLE_RATE = 16000;

function runFfmpeg(args: string[], input?: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary is missing"));
      return;
    }
    const chunks: Buffer[] = [];
    const child = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
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

async function decodePcm(bytes: Uint8Array): Promise<Float32Array> {
  const pcm = await runFfmpeg(
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "pipe:1"],
    bytes,
  );
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i]! / 32768;
  }
  return out;
}

function frameEnergy(samples: Float32Array, start: number, size: number): number {
  let sum = 0;
  const end = Math.min(start + size, samples.length);
  for (let i = start; i < end; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
}

function spectralFlatness(samples: Float32Array): number {
  const n = 512;
  if (samples.length < n) {
    return 0.5;
  }
  const mid = Math.floor(samples.length / 2) - n / 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = samples[mid + i]!;
  }
  dft(re, im);
  let logSum = 0;
  let arith = 0;
  let count = 0;
  for (let k = 1; k < n / 2; k++) {
    const mag = re[k]! * re[k]! + im[k]! * im[k]!;
    const p = Math.max(mag, 1e-12);
    logSum += Math.log(p);
    arith += p;
    count += 1;
  }
  if (count === 0 || arith === 0) {
    return 0.5;
  }
  const geo = Math.exp(logSum / count);
  return geo / (arith / count);
}

function dft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      sr += re[t]! * Math.cos(angle);
      si += re[t]! * Math.sin(angle);
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  re.set(outRe);
  im.set(outIm);
}

export function measurePcm(samples: Float32Array): AcousticMeasurements {
  const durationSec = samples.length / SAMPLE_RATE;
  if (samples.length === 0) {
    return {
      durationSec: 0,
      longestSilenceSec: 0,
      snrDb: 0,
      clipFraction: 0,
      rms: 0,
      spectralFlatness: 0.5,
    };
  }
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sumSq += v * v;
    if (Math.abs(v) >= 0.99) {
      clipped += 1;
    }
  }
  const rms = Math.sqrt(sumSq / samples.length);
  const frame = Math.round(0.03 * SAMPLE_RATE);
  const hop = Math.round(0.015 * SAMPLE_RATE);
  const energies: number[] = [];
  for (let start = 0; start + frame <= samples.length; start += hop) {
    energies.push(frameEnergy(samples, start, frame));
  }
  const sorted = [...energies].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.max(0, Math.floor(sorted.length * 0.1))] ?? 0;
  const speechThresh = Math.max(0.01, noiseFloor * 3, rms * 0.25);
  let longest = 0;
  let current = 0;
  let speechEnergy = 0;
  let speechCount = 0;
  let noiseEnergy = 0;
  let noiseCount = 0;
  for (const energy of energies) {
    if (energy < speechThresh) {
      current += hop / SAMPLE_RATE;
      longest = Math.max(longest, current);
      noiseEnergy += energy * energy;
      noiseCount += 1;
    } else {
      current = 0;
      speechEnergy += energy * energy;
      speechCount += 1;
    }
  }
  const speechRms = speechCount ? Math.sqrt(speechEnergy / speechCount) : rms;
  const noiseRms = noiseCount ? Math.sqrt(noiseEnergy / noiseCount) : Math.max(rms * 0.05, 1e-6);
  const snrDb = 20 * Math.log10((speechRms + 1e-8) / (noiseRms + 1e-8));
  return {
    durationSec,
    longestSilenceSec: longest,
    snrDb,
    clipFraction: clipped / samples.length,
    rms,
    spectralFlatness: spectralFlatness(samples),
  };
}

export class FfmpegAcousticAnalyzer implements AcousticAnalyzer {
  async measure(audio: AudioBytes): Promise<Result<AcousticMeasurements, AnalyzeError>> {
    try {
      const pcm = await decodePcm(audio.bytes);
      return ok(measurePcm(pcm));
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
    const inputPath = path.join(dir, audio.name);
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
        name: `${path.parse(audio.name).name}_${startSec.toFixed(1)}.wav`,
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

