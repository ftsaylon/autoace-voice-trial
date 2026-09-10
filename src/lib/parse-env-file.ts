export const parseEnvFile = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
      continue
    }
    const eq = line.indexOf("=")
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    if (!key) {
      continue
    }
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export const pickNonEmptyEnv = (
  env: Record<string, string | undefined>,
  names: readonly string[],
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) {
      out[name] = value
    }
  }
  return out
}

export const mergeEnvSources = (
  fileEnv: Record<string, string>,
  processEnv: Record<string, string | undefined>,
  names: readonly string[],
): Record<string, string> => {
  const merged: Record<string, string | undefined> = {}
  for (const name of names) {
    const fromFile = fileEnv[name]?.trim()
    merged[name] = fromFile || processEnv[name]
  }
  return pickNonEmptyEnv(merged, names)
}
