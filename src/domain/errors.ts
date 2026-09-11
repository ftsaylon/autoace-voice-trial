export type AnalyzeError =
  | { tag: "unsupported_format"; name: string }
  | { tag: "decode_failed"; name: string; cause: string }
  | { tag: "classifier_unavailable" }
  | { tag: "classifier_invalid_output"; cause: string }
  | { tag: "timeout" };

export function formatAnalyzeError(error: AnalyzeError): string {
  switch (error.tag) {
    case "unsupported_format":
      return `${error.name} is not a supported audio type`;
    case "decode_failed":
      return `Could not decode ${error.name}: ${error.cause}`;
    case "classifier_unavailable":
      return "Gemini API key is missing on the Convex deployment. Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local and run npm run dev:backend (or npx convex env set GOOGLE_GENERATIVE_AI_API_KEY).";
    case "classifier_invalid_output":
      return `Classifier returned invalid output: ${error.cause}`;
    case "timeout":
      return "Analysis timed out";
  }
}

export function formatStoredAnalyzeError(errorJson: string | undefined): string {
  if (!errorJson) {
    return "unknown error";
  }
  try {
    return formatAnalyzeError(JSON.parse(errorJson) as AnalyzeError);
  } catch {
    return errorJson;
  }
}

export type BatchParseIssue =
  | { tag: "missing_csv" }
  | { tag: "csv_invalid"; cause: string }
  | { tag: "missing_audio"; names: string[] }
  | { tag: "extra_audio"; names: string[] }
  | { tag: "unsupported_format"; names: string[] }
  | { tag: "file_too_large"; names: string[] }
  | { tag: "batch_too_large" }
  | { tag: "empty_batch" };
