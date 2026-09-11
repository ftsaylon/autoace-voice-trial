const MAX_DATASET_NAME_LENGTH = 80

const basename = (path: string): string => {
  const normalized = path.replace(/\\/g, "/")
  const segments = normalized.split("/").filter(Boolean)
  return segments.at(-1) ?? path
}

export const sanitizeDatasetName = (raw: string): string => {
  const trimmed = raw.trim().replace(/[/\\]+/g, " ").replace(/\s+/g, " ")
  if (trimmed.length === 0) {
    return ""
  }
  return trimmed.slice(0, MAX_DATASET_NAME_LENGTH)
}

const folderNameFromRelativePaths = (files: File[]): string | null => {
  const roots = new Set<string>()
  for (const file of files) {
    const relativePath = file.webkitRelativePath
    if (!relativePath) {
      continue
    }
    const root = relativePath.split("/")[0]
    if (root) {
      roots.add(root)
    }
  }
  if (roots.size !== 1) {
    return null
  }
  return [...roots][0] ?? null
}

export const deriveUploadSourceName = (
  files: File[],
  droppedRootName?: string,
): string | null => {
  if (files.length === 1 && files[0]?.name.toLowerCase().endsWith(".zip")) {
    const zipBase = basename(files[0].name)
    return sanitizeDatasetName(zipBase.replace(/\.zip$/i, "")) || null
  }

  if (droppedRootName) {
    const sanitized = sanitizeDatasetName(droppedRootName)
    if (sanitized) {
      return sanitized
    }
  }

  const folderName = folderNameFromRelativePaths(files)
  if (folderName) {
    const sanitized = sanitizeDatasetName(folderName)
    if (sanitized) {
      return sanitized
    }
  }

  return null
}
