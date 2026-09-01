import { useState, type FormEvent } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { AuthShell, Field } from "./AuthShell"
import { useAuth } from "./auth"

export function SignupPage() {
  const { signup, user, loading } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <main className="py-24">
        <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
          CHECKING YOUR TICKET
        </p>
      </main>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (password !== confirmation) {
      setError("Passwords do not match.")
      return
    }
    setBusy(true)
    try {
      await signup({ email, password, displayName })
      navigate("/", { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign up.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="NEW TICKET HOLDER"
      heading="Sign up"
      serial="00002"
      panel="box-office"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <Field label="DISPLAY NAME">
          <input
            name="displayName"
            autoComplete="nickname"
            required
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="field-input"
          />
        </Field>
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
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field-input"
          />
        </Field>
        <Field label="CONFIRM PASSWORD">
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="field-input"
          />
        </Field>
        {error && (
          <p className="text-body-sm text-stamp" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="button-primary w-full px-6 py-3 text-body-sm font-semibold disabled:opacity-60"
        >
          Sign up
        </button>
        <p className="auth-legal">
          By creating an account, you agree to the{" "}
          <Link to="/terms">Terms</Link> and acknowledge the{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </form>
    </AuthShell>
  )
}
