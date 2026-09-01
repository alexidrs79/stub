import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { fetchJson } from "./api"
import { AuthShell, Field, FormError } from "./AuthShell"

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      await fetchJson("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Reset email could not be sent.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      heading="Find your seat"
      serial="00003"
      footer={
        <Link to="/login" className="text-accent hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="mt-8 border-y border-border py-6">
          <p className="text-body-sm leading-6 text-text-dim">
            If an account exists for that email, a reset link is on its way. It expires in one
            hour.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-6">
          <p className="text-body-sm leading-6 text-text-dim">
            Enter the email on your account and we’ll send a one-hour reset link.
          </p>
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
          <FormError>{message}</FormError>
          <button
            type="submit"
            disabled={busy}
            className="button-primary w-full px-6 py-3 text-body-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
