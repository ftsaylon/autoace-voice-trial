const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".m4a", ".flac"]);

function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}

function isAudioFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return false;
  }
  return AUDIO_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

async function readDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      break;
    }
    entries.push(...batch);
  }
  return entries;
}

async function collectEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    return [file];
  }
  if (!entry.isDirectory) {
    return [];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children = await readDirectoryEntries(reader);
  const nested = await Promise.all(children.map((child) => collectEntryFiles(child)));
  return nested.flat();
}

export async function collectDroppedFiles(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind !== "file") {
        continue;
      }
      const entry = item.webkitGetAsEntry?.() ?? null;
      if (entry) {
        files.push(...(await collectEntryFiles(entry)));
        continue;
      }
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
    if (files.length > 0) {
      return files;
    }
  }
  return Array.from(dataTransfer.files);
}

export function buildUploadFormData(files: File[]): FormData | { error: string } {
  if (files.length === 0) {
    return { error: "No files were dropped." };
  }

  if (files.length === 1 && isZipFile(files[0]!)) {
    const form = new FormData();
    form.set("zip", files[0]!);
    return form;
  }

  const audioFiles = files.filter((file) => isAudioFile(file.name));
  if (audioFiles.length === 0) {
    return { error: "Drop a ZIP archive or audio files (wav, mp3, ogg, m4a, flac)." };
  }

  const form = new FormData();
  for (const file of audioFiles) {
    form.append("files", file, file.name);
  }
  return form;
}

export function resetFileInput(input: HTMLInputElement | null) {
  if (!input) {
    return;
  }
  input.value = "";
}
