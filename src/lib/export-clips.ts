import { autoAceJsonString, formatAnalyzeError } from "@/domain"
import type { AnalyzeError } from "@/domain/errors"

export type ExportableClip = {
  name: string
  predictionJson?: string
  errorJson?: string
}

const errorLabel = (errorJson?: string): string => {
  if (!errorJson) {
    return ""
  }
  try {
    return formatAnalyzeError(JSON.parse(errorJson) as AnalyzeError)
  } catch {
    return errorJson
  }
}

export const clipsToCsv = (clips: ExportableClip[]): string => {
  const header = "name,result_json,error"
  const lines = clips.map((clip) => {
    const json = clip.predictionJson ?? ""
    const error = errorLabel(clip.errorJson)
    const escapedJson = `"${json.replaceAll('"', '""')}"`
    const escapedError = `"${error.replaceAll('"', '""')}"`
    return `${clip.name},${escapedJson},${escapedError}`
  })
  return [header, ...lines].join("\n")
}

export const clipsToJson = (clips: ExportableClip[]): string => {
  return JSON.stringify(
    clips.map((clip) => ({
      name: clip.name,
      result: clip.predictionJson ? (JSON.parse(clip.predictionJson) as unknown) : null,
      error: errorLabel(clip.errorJson) || null,
    })),
    null,
    2,
  )
}

export const downloadBlobFile = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const downloadTextFile = (filename: string, contents: string, type: string) => {
  downloadBlobFile(filename, new Blob([contents], { type }))
}

export { autoAceJsonString }
