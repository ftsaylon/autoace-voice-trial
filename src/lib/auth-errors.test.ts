import { describe, expect, it } from "vitest"
import {
  DEFAULT_LOGIN_ERROR_MESSAGE,
  getAuthErrorCause,
  getLoginErrorMessage,
  INVALID_CREDENTIALS_MESSAGE,
  isExistingAccountError,
  LoginFailedError,
  stripConvexErrorNoise,
} from "./auth-errors"

describe("stripConvexErrorNoise", () => {
  it("removes request ids and stack traces", () => {
    const raw =
      "[Request ID: c00a080632bd1c40] Server Error Uncaught Error: Uncaught Error: Account autoace@eval.local already exists at createAccountFromCredentialsImpl (../../node_modules/@convex-dev/auth/dist/server/implementation/mutations/createAccountFromCredentials.js:30:11)"

    expect(stripConvexErrorNoise(raw)).toBe(
      "Account autoace@eval.local already exists",
    )
  })
})

describe("getLoginErrorMessage", () => {
  it("maps existing account errors to invalid credentials", () => {
    const error = new Error(
      "[Request ID: abc] Server Error Uncaught Error: Account autoace@eval.local already exists at createAccountFromCredentialsImpl",
    )

    expect(getLoginErrorMessage(error)).toBe(INVALID_CREDENTIALS_MESSAGE)
    expect(isExistingAccountError(error)).toBe(true)
  })

  it("maps invalid credentials to a friendly message", () => {
    const error = new Error(
      "[Request ID: abc] Server Error Uncaught Error: Invalid credentials",
    )

    expect(getLoginErrorMessage(error)).toBe(INVALID_CREDENTIALS_MESSAGE)
  })

  it("maps invalid password requirements", () => {
    const error = new Error("Invalid password")

    expect(getLoginErrorMessage(error)).toBe(
      "Password must be at least 8 characters.",
    )
  })

  it("falls back to the default message for unknown errors", () => {
    expect(getLoginErrorMessage(new Error("Database unavailable"))).toBe(
      DEFAULT_LOGIN_ERROR_MESSAGE,
    )
  })

  it("returns login failed errors unchanged", () => {
    expect(
      getLoginErrorMessage(new LoginFailedError(INVALID_CREDENTIALS_MESSAGE)),
    ).toBe(INVALID_CREDENTIALS_MESSAGE)
  })
})

describe("getAuthErrorCause", () => {
  it("extracts the first meaningful auth error line", () => {
    expect(
      getAuthErrorCause(new Error("Server Error Uncaught Error: Invalid credentials")),
    ).toBe("Invalid credentials")
  })
})
