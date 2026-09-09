import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { filesFromZip, parseManifestAndFiles } from "./parse-batch";

function wavBytes(): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(0, 40);
  return new Uint8Array(header);
}

describe("parseManifestAndFiles", () => {
  it("queues matching audio and reports missing and extra files", () => {
    const wav = wavBytes();
    const parsed = parseManifestAndFiles([
      {
        name: "labels.csv",
        bytes: new TextEncoder().encode(
          "name,result_json\ncall_ok.wav,\ncall_missing.wav,\n",
        ),
      },
      { name: "call_ok.wav", bytes: wav },
      { name: "call_extra.wav", bytes: wav },
    ]);
    expect(parsed.clips.map((clip) => clip.name)).toEqual(["call_ok.wav"]);
    expect(parsed.parseIssues).toEqual([
      "labels.csv lists audio files that were not selected: call_missing.wav",
      "Audio files not listed in CSV: call_extra.wav",
    ]);
  });

  it("reports missing names from the uploaded csv, not a fixed clip list", () => {
    const parsed = parseManifestAndFiles([
      {
        name: "labels.csv",
        bytes: new TextEncoder().encode(
          "name,result_json\ncustom_a.m4a,\ncustom_b.flac,\n",
        ),
      },
    ]);
    expect(parsed.clips).toEqual([]);
    expect(parsed.parseIssues).toEqual([
      "labels.csv lists audio files that were not selected: custom_a.m4a, custom_b.flac",
    ]);
  });

  it("does not treat gold JSON as model input and still stores it on the clip", () => {
    const wav = wavBytes();
    const gold =
      '{"emotional_tone":"neutral","emotional_intensity":"low","background_noise_present":false,"background_noise_type":"","background_noise_severity":"none","audio_quality":"clear","speaker_overlap_present":false,"long_silence_present":false,"confidence":0.5}';
    const parsed = parseManifestAndFiles([
      {
        name: "labels.csv",
        bytes: new TextEncoder().encode(`name,result_json\ncall_ok.wav,"${gold.replaceAll('"', '""')}"\n`),
      },
      { name: "call_ok.wav", bytes: wav },
    ]);
    expect(parsed.clips).toHaveLength(1);
    expect(parsed.clips[0]?.gold?.emotional_tone).toBe("neutral");
  });

  it("treats empty result_json as unlabeled instead of fatal", () => {
    const parsed = parseManifestAndFiles([
      {
        name: "labels.csv",
        bytes: new TextEncoder().encode("name,result_json\ncall_ok.wav,\n"),
      },
      { name: "call_ok.wav", bytes: wavBytes() },
    ]);
    expect(parsed.clips).toHaveLength(1);
    expect(parsed.clips[0]?.gold).toBeNull();
    expect(parsed.parseIssues).toEqual([]);
  });

  it("errors when labels.csv is missing", () => {
    const parsed = parseManifestAndFiles([{ name: "call_ok.wav", bytes: wavBytes() }]);
    expect(parsed.clips).toEqual([]);
    expect(parsed.parseIssues).toEqual(["Batch is missing labels.csv"]);
  });
});

describe("filesFromZip", () => {
  it("rejects bytes that are not a zip archive", async () => {
    await expect(filesFromZip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      "The selected file is not a valid ZIP archive",
    )
  })

  it("reads audio at the archive root", async () => {
    const zip = new JSZip();
    zip.file("labels.csv", "name,result_json\ncall_ok.wav,\n");
    zip.file("call_ok.wav", wavBytes());
    const files = await filesFromZip(await zip.generateAsync({ type: "uint8array" }));
    expect(files.map((file) => file.name).sort()).toEqual([
      "call_ok.wav",
      "labels.csv",
    ]);
  });
});
