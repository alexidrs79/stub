import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { fetchJson } from "./api"
import { useAuth, type AuthUser } from "./auth"

type Notice = { tone: "ok" | "error"; text: string } | null

function messageOf(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}

function SettingsSection({
  eyebrow,
  heading,
  blurb,
  children,
}: {
  eyebrow: string
  heading: string
  blurb?: string
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <p>{eyebrow}</p>
        <h2>{heading}</h2>
        {blurb && <span>{blurb}</span>}
      </div>
      {children}
    </section>
  )
}

/// One row of the identity strip, so the page says whose account this is
/// before it offers anything to edit.
function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  )
}

function SettingsNotice({ notice }: { notice: Notice }) {
  if (!notice) return null
  return (
    <p
      className={notice.tone === "error" ? "settings-notice is-error" : "settings-notice"}
      role={notice.tone === "error" ? "alert" : undefined}
      aria-live={notice.tone === "error" ? undefined : "polite"}
    >
      {notice.text}
    </p>
  )
}

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(user?.displayName ?? "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [profileNotice, setProfileNotice] = useState<Notice>(null)
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleteNotice, setDeleteNotice] = useState<Notice>(null)
  // Deleting is irreversible, so the fields stay out of the way until asked for.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const profile = useMutation({
    mutationFn: () =>
      fetchJson<AuthUser>("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated)
      setProfileNotice({ tone: "ok", text: "Display name saved." })
    },
  })
  const password = useMutation({
    mutationFn: () =>
      fetchJson<void>("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordNotice({ tone: "ok", text: "Password changed." })
    },
  })
  const deletion = useMutation({
    mutationFn: () =>
      fetchJson<void>("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: deletePassword }),
      }),
  })

  const nameUnchanged = displayName.trim() === user?.displayName

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setProfileNotice(null)
    try {
      await profile.mutateAsync()
    } catch (caught) {
      setProfileNotice({
        tone: "error",
        text: messageOf(caught, "Profile could not be saved."),
      })
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordNotice(null)
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ tone: "error", text: "New passwords do not match." })
      return
    }
    try {
      await password.mutateAsync()
    } catch (caught) {
      setPasswordNotice({
        tone: "error",
        text: messageOf(caught, "Password could not be changed."),
      })
    }
  }

  function cancelDelete() {
    setConfirmingDelete(false)
    setDeletePassword("")
    setDeleteConfirmation("")
    setDeleteNotice(null)
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    setDeleteNotice(null)
    if (deleteConfirmation.trim().toUpperCase() !== "DELETE") {
      setDeleteNotice({ tone: "error", text: "Type DELETE to confirm." })
      return
    }
    try {
      await deletion.mutateAsync()
      try {
        await logout()
      } catch {
        // The account is already gone, so a failed logout must not strand the
        // page on a signed-in view.
      }
      /// A full load rather than a client navigation: clearing auth unmounts
      /// this page through the route guard, which would swallow an in-app
      /// redirect and leave the visitor on the login form instead.
      window.location.replace("/signup")
    } catch (caught) {
      setDeleteNotice({
        tone: "error",
        text: messageOf(caught, "Account could not be deleted."),
      })
    }
  }

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate("/profile")
  }

  return (
    <main className="settings-page">
      <button type="button" className="back-control" onClick={goBack}>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M13 8H3m4-4L3 8l4 4" />
        </svg>
        BACK
      </button>
      <header>
        <p className="font-mono text-[10px] tracking-[0.16em] text-accent">ACCOUNT</p>
        <h1 className="mt-3 font-display text-display-lg font-normal">Settings</h1>
        <p className="mt-4 text-text-dim">
          Manage the name on your stubs, the password that opens your archive, and
          whether the archive exists at all.
        </p>
      </header>

      <div className="settings-identity">
        <IdentityRow label="SIGNED IN AS" value={user?.displayName ?? "—"} />
        <IdentityRow label="EMAIL" value={user?.email ?? "—"} />
      </div>

      <SettingsSection eyebrow="PROFILE" heading="Your details">
        <form onSubmit={saveProfile} className="settings-form">
          <label className="settings-field">
            <span className="settings-label">DISPLAY NAME</span>
            <input
              value={displayName}
              maxLength={40}
              required
              autoComplete="nickname"
              onChange={(event) => setDisplayName(event.target.value)}
              className="field-input"
            />
            <small>Shown on your profile and your stubs. Up to 40 characters.</small>
          </label>
          <label className="settings-field">
            <span className="settings-label">EMAIL</span>
            <input value={user?.email ?? ""} disabled className="field-input" />
            <small>Your email cannot be changed here.</small>
          </label>
          <div className="settings-actions">
            <SettingsNotice notice={profileNotice} />
            <button
              type="submit"
              disabled={profile.isPending || nameUnchanged}
              className="button-primary"
            >
              {profile.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection eyebrow="SECURITY" heading="Password">
        <form onSubmit={savePassword} className="settings-form">
          <label className="settings-field">
            <span className="settings-label">CURRENT PASSWORD</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              required
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="field-input"
            />
          </label>
          <label className="settings-field">
            <span className="settings-label">NEW PASSWORD</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={newPassword}
              required
              onChange={(event) => setNewPassword(event.target.value)}
              className="field-input"
            />
            <small>At least 8 characters.</small>
          </label>
          <label className="settings-field">
            <span className="settings-label">CONFIRM NEW PASSWORD</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              required
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="field-input"
            />
          </label>
          <div className="settings-actions">
            <SettingsNotice notice={passwordNotice} />
            <button
              type="submit"
              disabled={password.isPending}
              className="button-primary"
            >
              {password.isPending ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
      </SettingsSection>

      <section className="settings-section settings-danger">
        <div className="settings-section-head">
          <p>DANGER ZONE</p>
          <h2>Delete account</h2>
          <span>
            Permanently removes your account, lists, ratings, notes, favorites,
            progress, and diary. This cannot be undone.
          </span>
        </div>

        {confirmingDelete ? (
          <form onSubmit={deleteAccount} className="settings-form">
            <label className="settings-field">
              <span className="settings-label">CURRENT PASSWORD</span>
              <input
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={deletePassword}
                required
                autoFocus
                onChange={(event) => setDeletePassword(event.target.value)}
                className="field-input"
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">TYPE DELETE TO CONFIRM</span>
              <input
                value={deleteConfirmation}
                required
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                className="field-input"
              />
            </label>
            <div className="settings-actions">
              <SettingsNotice notice={deleteNotice} />
              <button
                type="button"
                className="button-outline settings-cancel"
                disabled={deletion.isPending}
                onClick={cancelDelete}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deletion.isPending}
                className="button-danger"
              >
                {deletion.isPending ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </form>
        ) : (
          <div className="settings-actions settings-actions-standalone">
            <button
              type="button"
              className="button-danger"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete account…
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
