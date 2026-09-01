import { useState, type FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import { AuthShell, Field, FormError, TicketCheck } from "./AuthShell"
import { useAuth } from "./auth"
import { safeReturnPath } from "./paths"

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = safeReturnPath((location.state as { from?: string } | null)?.from)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (loading) return <TicketCheck />

  if (user) {
    return <Navigate to={from} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setBusy(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not log in.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="YOUR TICKETS"
      heading="Log in"
      serial="00001"
      footer={
        <>
          No account yet?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <Field label="EMAIL">
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field-input"
          />
        </Field>
        <Field label="PASSWORD">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field-input"
          />
        </Field>
        <div className="-mt-3 text-right">
          <Link to="/forgot-password" className="font-mono text-[11px] text-text-dim hover:text-accent">
            FORGOT PASSWORD?
          </Link>
        </div>
        <FormError>{error}</FormError>
        <button
          type="submit"
          disabled={busy}
          className="button-primary w-full px-6 py-3 text-body-sm font-semibold disabled:opacity-60"
        >
          Log in
        </button>
      </form>
    </AuthShell>
  )
}
