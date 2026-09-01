import { useEffect, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { fetchJson } from "./api"
import { AuthShell, Field, FormError } from "./AuthShell"

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [token] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("token") ??
      params.get("token") ??
      "",
  )
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (!token) return
    window.history.replaceState(null, "", window.location.pathname)
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    if (password !== confirmation) {
      setMessage("Passwords do not match.")
      return
    }
    setBusy(true)
    try {
      await fetchJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      setComplete(true)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Password could not be reset.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      heading="New password"
      serial="00004"
      footer={
        <Link to="/login" className="text-accent hover:underline">
          Back to log in
        </Link>
      }
    >
      {!token ? (
        <div className="mt-8 border-y border-border py-6">
          <p className="text-body-sm text-text-dim">This reset link is incomplete.</p>
          <Link to="/forgot-password" className="mt-4 inline-block text-body-sm text-accent">
            Request another link
          </Link>
        </div>
      ) : complete ? (
        <div className="mt-8 border-y border-border py-6">
          <p className="text-body-sm leading-6 text-text-dim">
            Your password has been changed. You can return to the lobby.
          </p>
          <Link to="/login" className="button-primary mt-5 px-6 py-3 text-body-sm font-semibold">
            Log in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-6">
          <Field label="NEW PASSWORD">
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input"
            />
          </Field>
          <Field label="CONFIRM PASSWORD">
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="field-input"
            />
          </Field>
          <FormError>{message}</FormError>
          <button
            type="submit"
            disabled={busy}
            className="button-primary w-full px-6 py-3 text-body-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Resetting…" : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
