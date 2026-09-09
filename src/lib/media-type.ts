export const mediaTypeFor = (name: string): string => {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase()
  if (ext === ".wav") {
    return "audio/wav"
  }
  if (ext === ".mp3") {
    return "audio/mpeg"
  }
  if (ext === ".ogg") {
    return "audio/ogg"
  }
  if (ext === ".m4a") {
    return "audio/mp4"
  }
  if (ext === ".flac") {
    return "audio/flac"
  }
  return "application/octet-stream"
}
