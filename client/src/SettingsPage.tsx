import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { fetchJson } from "./api"
import { useAuth, type AuthUser } from "./auth"

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(user?.displayName ?? "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [profileMessage, setProfileMessage] = useState("")
  const [passwordMessage, setPasswordMessage] = useState("")
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleteMessage, setDeleteMessage] = useState("")

  const profile = useMutation({
    mutationFn: () =>
      fetchJson<AuthUser>("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated)
      setProfileMessage("DISPLAY NAME SAVED")
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
      setPasswordMessage("PASSWORD CHANGED")
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

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setProfileMessage("")
    try {
      await profile.mutateAsync()
    } catch (caught) {
      setProfileMessage(caught instanceof Error ? caught.message : "Profile could not be saved.")
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordMessage("")
    if (newPassword !== confirmPassword) {
      setPasswordMessage("NEW PASSWORDS DO NOT MATCH")
      return
    }
    try {
      await password.mutateAsync()
    } catch (caught) {
      setPasswordMessage(caught instanceof Error ? caught.message : "Password could not be changed.")
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    setDeleteMessage("")
    if (deleteConfirmation !== "DELETE") {
      setDeleteMessage("TYPE DELETE TO CONFIRM")
      return
    }
    try {
      await deletion.mutateAsync()
      try {
        await logout()
      } catch {
        queryClient.setQueryData(["me"], null)
        for (const key of ["titles", "lists", "list", "diary"]) {
          queryClient.removeQueries({ queryKey: [key] })
        }
      }
      navigate("/signup", { replace: true })
    } catch (caught) {
      setDeleteMessage(caught instanceof Error ? caught.message : "Account could not be deleted.")
    }
  }

  return (
    <main className="pb-24 pt-12">
      <p className="font-mono text-[10px] tracking-[0.16em] text-accent">ACCOUNT</p>
      <h1 className="mt-3 font-display text-display-lg font-normal">Settings</h1>
      <p className="mt-4 max-w-xl text-text-dim">
        Update the name on your stubs or change the password that opens your archive.
      </p>

      <div className="settings-grid">
        <section className="settings-panel">
          <p className="font-mono text-[10px] tracking-[0.14em] text-accent">PROFILE</p>
          <h2>Display name</h2>
          <form onSubmit={saveProfile} className="mt-6 space-y-5">
            <label className="block">
              <span className="settings-label">DISPLAY NAME</span>
              <input
                value={displayName}
                maxLength={40}
                required
                onChange={(event) => setDisplayName(event.target.value)}
                className="field-input mt-2"
              />
            </label>
            <label className="block">
              <span className="settings-label">EMAIL</span>
              <input
                value={user?.email ?? ""}
                disabled
                className="field-input mt-2 opacity-60"
              />
            </label>
            <div className="settings-submit">
              <p aria-live="polite">{profileMessage}</p>
              <button
                type="submit"
                disabled={profile.isPending || displayName.trim() === user?.displayName}
                className="button-primary"
              >
                {profile.isPending ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-panel">
          <p className="font-mono text-[10px] tracking-[0.14em] text-accent">SECURITY</p>
          <h2>Change password</h2>
          <form onSubmit={savePassword} className="mt-6 space-y-5">
            <label className="block">
              <span className="settings-label">CURRENT PASSWORD</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                required
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="field-input mt-2"
              />
            </label>
            <label className="block">
              <span className="settings-label">NEW PASSWORD</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={newPassword}
                required
                onChange={(event) => setNewPassword(event.target.value)}
                className="field-input mt-2"
              />
            </label>
            <label className="block">
              <span className="settings-label">CONFIRM NEW PASSWORD</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                required
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="field-input mt-2"
              />
            </label>
            <div className="settings-submit">
              <p aria-live="polite">{passwordMessage}</p>
              <button
                type="submit"
                disabled={password.isPending}
                className="button-primary"
              >
                {password.isPending ? "Changing…" : "Change password"}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="settings-panel settings-danger">
        <p className="font-mono text-[10px] tracking-[0.14em] text-stamp">
          DANGER ZONE
        </p>
        <h2>Delete account</h2>
        <p>
          Permanently remove your account, lists, ratings, notes, favorites, progress,
          and diary. This cannot be undone.
        </p>
        <form onSubmit={deleteAccount} className="mt-6 space-y-5">
          <label className="block">
            <span className="settings-label">CURRENT PASSWORD</span>
            <input
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={deletePassword}
              required
              onChange={(event) => setDeletePassword(event.target.value)}
              className="field-input mt-2"
            />
          </label>
          <label className="block">
            <span className="settings-label">TYPE DELETE TO CONFIRM</span>
            <input
              value={deleteConfirmation}
              required
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              className="field-input mt-2"
            />
          </label>
          <div className="settings-submit">
            <p aria-live="polite">{deleteMessage}</p>
            <button
              type="submit"
              disabled={deletion.isPending}
              className="button-danger"
            >
              {deletion.isPending ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
