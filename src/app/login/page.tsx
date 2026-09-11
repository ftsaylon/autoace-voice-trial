"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import { AlertCircleIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  getLoginErrorMessage,
  INVALID_CREDENTIALS_MESSAGE,
  isExistingAccountError,
  LoginFailedError,
} from "@/lib/auth-errors"
import { normalizeAuthEmail } from "@/lib/trial-auth"

export default function LoginPage() {
  const router = useRouter()
  const { signIn } = useAuthActions()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [fieldsVisible, setFieldsVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const fieldType = fieldsVisible ? "text" : "password"

  const handleToggleFields = () => {
    setFieldsVisible((visible) => !visible)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const email = normalizeAuthEmail(username)
    const attempt = async (flow: "signIn" | "signUp") => {
      const formData = new FormData()
      formData.set("email", email)
      formData.set("password", password)
      formData.set("flow", flow)
      await signIn("password", formData)
    }
    try {
      try {
        await attempt("signIn")
      } catch {
        try {
          await attempt("signUp")
        } catch (signUpError) {
          if (isExistingAccountError(signUpError)) {
            throw new LoginFailedError(INVALID_CREDENTIALS_MESSAGE)
          }
          throw signUpError
        }
      }
      router.replace("/batches")
      router.refresh()
    } catch (caught) {
      setError(getLoginErrorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex h-svh flex-1 items-center justify-center overflow-auto bg-background px-4 py-10">
      <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden space-y-4 lg:block">
          <p className="text-sm font-medium">AutoAce evaluation</p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Run labeled call batches without leaving the operator tool
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Sign in with the trial credentials. Concurrent batches keep processing
            while you move between batches, history, and settings.
          </p>
        </section>
        <Card className="w-full shadow-none">
          <CardHeader className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase lg:hidden">
              AutoAce
            </p>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use the evaluation credentials. Username <code>autoace</code> maps to
              the Password account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type={fieldType}
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type={fieldType}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full"
                aria-pressed={fieldsVisible}
                aria-controls="username password"
                aria-label={fieldsVisible ? "Hide login fields" : "Show login fields"}
                onClick={handleToggleFields}
              >
                {fieldsVisible ? (
                  <EyeOffIcon data-icon="inline-start" />
                ) : (
                  <EyeIcon data-icon="inline-start" />
                )}
                {fieldsVisible ? "Hide credentials" : "Show credentials"}
              </Button>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon className="size-4" />
                  <AlertTitle>Login failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="h-10 w-full" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
