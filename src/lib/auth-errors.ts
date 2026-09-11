export const INVALID_CREDENTIALS_MESSAGE = "Invalid username or password."

export const DEFAULT_LOGIN_ERROR_MESSAGE =
  "Login failed. Check the username and password."

export class LoginFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LoginFailedError"
  }
}

export const stripConvexErrorNoise = (message: string): string => {
  let cleaned = message.replace(/\[Request ID:[^\]]+\]\s*/gi, "")
  cleaned = cleaned.replace(/^Server Error\s*/i, "")
  cleaned = cleaned.replace(/(?:Uncaught Error:\s*)+/gi, "")
  const firstLine = cleaned.split(/\s+at\s+|\n/)[0]?.trim() ?? cleaned.trim()
  return firstLine
}

export const getAuthErrorCause = (error: unknown): string => {
  if (error instanceof LoginFailedError) {
    return error.message
  }
  const raw = error instanceof Error ? error.message : String(error)
  return stripConvexErrorNoise(raw)
}

export const isExistingAccountError = (error: unknown): boolean => {
  return /already exists/i.test(getAuthErrorCause(error))
}

export const isInvalidCredentialsError = (error: unknown): boolean => {
  return /invalid credentials/i.test(getAuthErrorCause(error))
}

export const isInvalidPasswordError = (error: unknown): boolean => {
  return /invalid password/i.test(getAuthErrorCause(error))
}

export const getLoginErrorMessage = (error: unknown): string => {
  if (error instanceof LoginFailedError) {
    return error.message
  }
  if (isExistingAccountError(error) || isInvalidCredentialsError(error)) {
    return INVALID_CREDENTIALS_MESSAGE
  }
  if (isInvalidPasswordError(error)) {
    return "Password must be at least 8 characters."
  }
  return DEFAULT_LOGIN_ERROR_MESSAGE
}
