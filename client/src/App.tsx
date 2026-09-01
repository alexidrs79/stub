import { useRef, useState } from "react"
import { NavLink, Route, Routes, useNavigate } from "react-router-dom"
import { CollectionPage } from "./CollectionPage"
import { DetailPage } from "./DetailPage"
import { DiaryPage } from "./DiaryPage"
import { ForgotPasswordPage } from "./ForgotPasswordPage"
import { GenreIndexPage } from "./GenreIndexPage"
import { GenrePage } from "./GenrePage"
import { HomePage } from "./HomePage"
import { LegalPage } from "./LegalPage"
import { LoginPage } from "./LoginPage"
import { PersonPage } from "./PersonPage"
import { ProfilePage } from "./ProfilePage"
import { RequireAuth } from "./RequireAuth"
import { ResetPasswordPage } from "./ResetPasswordPage"
import { SearchPage } from "./SearchPage"
import { SettingsPage } from "./SettingsPage"
import { SignupPage } from "./SignupPage"
import { SiteFooter, SiteHeader } from "./SiteHeader"
import { WatchedVerdictDialog } from "./WatchedVerdictDialog"
import { useArchive } from "./useArchive"
import { useAuth } from "./auth"
import { useRoutePageMeta } from "./useRoutePageMeta"
import type { MediaType } from "./title"

function NotFound() {
  return (
    <main className="py-24">
      <p className="font-mono text-[10px] tracking-[0.16em] text-accent">WRONG SCREEN</p>
      <h1 className="mt-3 font-display text-display-lg font-normal">
        Nothing showing here
      </h1>
      <NavLink
        to="/"
        className="mt-6 inline-block font-mono text-[11px] tracking-[0.1em] text-text-dim hover:text-text"
      >
        ← BACK TO THE LOBBY
      </NavLink>
    </main>
  )
}

export default function App() {
  const { user, loading, error: authError, logout } = useAuth()
  const navigate = useNavigate()
  const archive = useArchive()
  const [logoutError, setLogoutError] = useState("")
  const [pendingWatched, setPendingWatched] = useState<{
    ref: { tmdbId: number; mediaType: MediaType }
    name: string
  } | null>(null)
  const watchedTrigger = useRef<HTMLElement | null>(null)

  useRoutePageMeta()

  /// Marking watched always goes through the verdict dialog, so the button only
  /// remembers what to focus when the dialog closes.
  function openWatchedDialog(tmdbId: number, mediaType: MediaType, name: string) {
    if (!archive.requireUser()) return
    if (!archive.entryFor({ tmdbId, mediaType })) return
    archive.watchedMutation.reset()
    watchedTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPendingWatched({ ref: { tmdbId, mediaType }, name })
  }

  function closeWatchedDialog() {
    setPendingWatched(null)
    requestAnimationFrame(() => watchedTrigger.current?.focus())
  }

  async function confirmWatched(score: number, note: string | null, watchedAt?: string) {
    if (!pendingWatched) return
    await archive.actions.logWatched(pendingWatched.ref, score, note, watchedAt)
    closeWatchedDialog()
  }

  async function handleLogout() {
    setLogoutError("")
    try {
      await logout()
      navigate("/login", { replace: true })
    } catch {
      setLogoutError("LOG OUT FAILED · TRY AGAIN")
    }
  }

  const removeTitle = (tmdbId: number, mediaType: MediaType) =>
    archive.actions.remove({ tmdbId, mediaType })
  const rateTitle = (
    tmdbId: number,
    mediaType: MediaType,
    score: number,
    note: string | null,
  ) => archive.actions.rate({ tmdbId, mediaType }, score, note)

  const detailPage = (
    <DetailPage
      archive={archive.entries}
      archiveLoading={archive.loading}
      signedIn={Boolean(user)}
      onSave={archive.actions.save}
      onMarkWatched={openWatchedDialog}
      onRemove={removeTitle}
      onRate={rateTitle}
      onToggleFavorite={archive.actions.toggleFavorite}
      onUpdateProgress={archive.actions.updateProgress}
    />
  )
  const personPage = (
    <PersonPage
      archive={archive.entries}
      signedIn={Boolean(user)}
      onSave={archive.actions.save}
    />
  )
  const genrePage = (
    <GenrePage
      archive={archive.entries}
      signedIn={Boolean(user)}
      onSave={archive.actions.save}
    />
  )
  const collectionPage = (
    <RequireAuth>
      <CollectionPage
        onMarkWatched={openWatchedDialog}
        onToggleFavorite={archive.actions.toggleFavorite}
        onUpdateProgress={archive.actions.updateProgress}
      />
    </RequireAuth>
  )

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 sm:px-8">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SiteHeader
        user={user}
        authReady={!loading && !authError}
        onLogout={() => void handleLogout()}
        logoutError={logoutError}
      />

      {archive.error && (
        <p
          className="border-b border-border py-3 font-mono text-[11px] text-stamp"
          role="alert"
        >
          {archive.error}
        </p>
      )}

      <div className="flex-1" id="main-content">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                archive={archive.entries}
                signedIn={Boolean(user)}
                justStamped={archive.justStamped}
                onSave={archive.actions.save}
                onMarkWatched={openWatchedDialog}
                onToggleFavorite={archive.actions.toggleFavorite}
              />
            }
          />
          <Route
            path="/search"
            element={
              <SearchPage
                archive={archive.entries}
                onSave={archive.actions.save}
                onRemove={removeTitle}
              />
            }
          />
          <Route path="/title/:mediaType/:id" element={detailPage} />
          <Route path="/movies/:titleRef" element={detailPage} />
          <Route path="/tv/:titleRef" element={detailPage} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage
                  displayName={user?.displayName ?? ""}
                  onToggleFavorite={archive.actions.toggleFavorite}
                />
              </RequireAuth>
            }
          />
          <Route path="/person/:id" element={personPage} />
          <Route path="/people/:personRef" element={personPage} />
          <Route path="/genres" element={<GenreIndexPage />} />
          <Route path="/genre/:id" element={genrePage} />
          <Route path="/genres/:genreSlug" element={genrePage} />
          <Route path="/collection/:view" element={collectionPage} />
          <Route path="/lists/:listRef" element={collectionPage} />
          <Route
            path="/diary"
            element={
              <RequireAuth>
                <DiaryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<LegalPage page="privacy" />} />
          <Route path="/terms" element={<LegalPage page="terms" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>

      <SiteFooter />

      {pendingWatched && (
        <WatchedVerdictDialog
          titleName={pendingWatched.name}
          pending={archive.watchedMutation.isPending}
          error={
            archive.watchedMutation.error instanceof Error
              ? archive.watchedMutation.error.message
              : null
          }
          onCancel={() => {
            archive.watchedMutation.reset()
            closeWatchedDialog()
          }}
          onConfirm={confirmWatched}
        />
      )}
    </div>
  )
}
