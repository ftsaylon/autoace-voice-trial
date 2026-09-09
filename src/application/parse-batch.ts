import Papa from "papaparse";
import JSZip from "jszip";
import {
  MAX_BATCH_BYTES,
  MAX_CLIP_BYTES,
  MAX_CLIP_COUNT,
  SUPPORTED_AUDIO_EXTENSIONS,
  fromAutoAceJson,
  type ClipPrediction,
  type NewClip,
} from "@/domain";

export type IncomingFile = {
  name: string;
  bytes: Uint8Array;
};

export type ParsedBatchInput = {
  clips: NewClip[];
  parseIssues: string[];
};

const AUDIO_EXT = new Set<string>(SUPPORTED_AUDIO_EXTENSIONS);

function basename(path: string): string {
  const parts = path.replaceAll("\\", "/").split("/");
  return parts[parts.length - 1] ?? path;
}

function isIgnored(name: string): boolean {
  const base = basename(name);
  return (
    base.startsWith(".") ||
    base === "Thumbs.db" ||
    name.includes("__MACOSX/")
  );
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) {
    return "";
  }
  return name.slice(idx).toLowerCase();
}

function looksLikeAudio(name: string, bytes: Uint8Array): boolean {
  const ext = extensionOf(name);
  if (!AUDIO_EXT.has(ext)) {
    return false;
  }
  if (bytes.length < 12) {
    return false;
  }
  const head = String.fromCharCode(...bytes.slice(0, 4));
  if (ext === ".wav") {
    return head === "RIFF";
  }
  if (ext === ".ogg") {
    return head === "OggS";
  }
  if (ext === ".flac") {
    return head === "fLaC";
  }
  if (ext === ".mp3") {
    return (
      head.startsWith("ID3") ||
      (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }
  if (ext === ".m4a") {
    const probe = String.fromCharCode(...bytes.slice(4, 8));
    return probe === "ftyp";
  }
  return true;
}

function parseCsv(text: string): {
  rows: { name: string; result_json: string | null }[];
  error: string | null;
} {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    return {
      rows: [],
      error: parsed.errors[0]?.message ?? "CSV parse error",
    };
  }
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("name")) {
    return { rows: [], error: "CSV must contain a name column" };
  }
  const rows: { name: string; result_json: string | null }[] = [];
  for (const row of parsed.data) {
    const name = (row.name ?? "").trim();
    if (!name) {
      continue;
    }
    const resultJson = row.result_json;
    rows.push({
      name,
      result_json:
        resultJson === undefined || resultJson.trim() === ""
          ? null
          : resultJson,
    });
  }
  return { rows, error: null };
}

function goldFromCell(name: string, cell: string | null): {
  gold: ClipPrediction | null;
  issue: string | null;
} {
  if (cell === null) {
    return { gold: null, issue: null };
  }
  const parsed = fromAutoAceJson(cell);
  if (!parsed.ok) {
    return {
      gold: null,
      issue: `${name}: invalid result_json (${parsed.error.cause})`,
    };
  }
  return { gold: parsed.value, issue: null };
}

export function parseManifestAndFiles(files: IncomingFile[]): ParsedBatchInput {
  const parseIssues: string[] = [];
  const byName = new Map<string, IncomingFile>();
  let totalBytes = 0;

  for (const file of files) {
    if (isIgnored(file.name)) {
      continue;
    }
    const name = basename(file.name);
    if (byName.has(name)) {
      parseIssues.push(`Duplicate filename ${name}`);
      continue;
    }
    totalBytes += file.bytes.byteLength;
    byName.set(name, { name, bytes: file.bytes });
  }

  if (totalBytes > MAX_BATCH_BYTES) {
    return { clips: [], parseIssues: ["Batch exceeds the 200 MB size cap"] };
  }

  const csvFile = byName.get("labels.csv") ?? [...byName.values()].find((file) =>
    file.name.toLowerCase().endsWith(".csv"),
  );
  if (!csvFile) {
    return { clips: [], parseIssues: ["Batch is missing labels.csv"] };
  }
  byName.delete(csvFile.name);

  const csvText = new TextDecoder().decode(csvFile.bytes);
  const csv = parseCsv(csvText);
  if (csv.error) {
    return { clips: [], parseIssues: [csv.error] };
  }
  if (csv.rows.length === 0) {
    return { clips: [], parseIssues: ["CSV contains no audio rows"] };
  }

  const clips: NewClip[] = [];
  const claimed = new Set<string>();
  const missing: string[] = [];
  const unsupported: string[] = [];
  const tooLarge: string[] = [];

  for (const row of csv.rows) {
    const file = byName.get(row.name);
    if (!file) {
      missing.push(row.name);
      continue;
    }
    claimed.add(row.name);
    if (file.bytes.byteLength > MAX_CLIP_BYTES) {
      tooLarge.push(row.name);
      continue;
    }
    if (!looksLikeAudio(row.name, file.bytes)) {
      unsupported.push(row.name);
      continue;
    }
    const gold = goldFromCell(row.name, row.result_json);
    if (gold.issue) {
      parseIssues.push(gold.issue);
    }
    clips.push({ name: row.name, bytes: file.bytes, gold: gold.gold });
  }

  const extra = [...byName.keys()].filter((name) => !claimed.has(name));
  if (missing.length > 0) {
    parseIssues.push(
      `${csvFile.name} lists audio files that were not selected: ${missing.join(", ")}`,
    );
  }
  if (extra.length > 0) {
    parseIssues.push(`Audio files not listed in CSV: ${extra.join(", ")}`);
  }
  if (unsupported.length > 0) {
    parseIssues.push(`Unsupported audio files: ${unsupported.join(", ")}`);
  }
  if (tooLarge.length > 0) {
    parseIssues.push(`Files over 40 MB: ${tooLarge.join(", ")}`);
  }
  if (clips.length > MAX_CLIP_COUNT) {
    return {
      clips: [],
      parseIssues: [
        ...parseIssues,
        `Batch has ${clips.length} clips; the cap is ${MAX_CLIP_COUNT}`,
      ],
    };
  }
  if (clips.length === 0 && parseIssues.length === 0) {
    parseIssues.push("No valid audio clips to process");
  }
  return { clips, parseIssues };
}

function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function filesFromZip(bytes: Uint8Array): Promise<IncomingFile[]> {
  if (!isZipBytes(bytes)) {
    throw new Error("The selected file is not a valid ZIP archive");
  }
  const zip = await JSZip.loadAsync(bytes);
  const files: IncomingFile[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const content = await entry.async("uint8array");
    files.push({ name: path, bytes: content });
  }
  return files;
}
