import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AudioStore } from "@/application/ports";
import { mediaTypeFor } from "./memory";

export class FilesystemAudioStore implements AudioStore {
  constructor(private readonly root: string) {}

  async put(batchId: string, name: string, bytes: Uint8Array) {
    const dir = path.join(this.root, batchId);
    await mkdir(dir, { recursive: true });
    const safe = path.basename(name);
    const filePath = path.join(dir, safe);
    await writeFile(filePath, bytes);
    return filePath;
  }

  async get(ref: string) {
    const bytes = await readFile(ref);
    return {
      name: path.basename(ref),
      bytes: new Uint8Array(bytes),
      mediaType: mediaTypeFor(path.basename(ref)),
    };
  }
}
