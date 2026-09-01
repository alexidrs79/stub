import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { fetchJson } from "./api"
import { CollectionPage } from "./CollectionPage"
import { DetailPage } from "./DetailPage"
import { DiaryPage } from "./DiaryPage"
import { ForgotPasswordPage } from "./ForgotPasswordPage"
import { GenreIndexPage } from "./GenreIndexPage"
import { GenrePage } from "./GenrePage"
import { HeaderSearch } from "./HeaderSearch"
import { HomePage } from "./HomePage"
import { LegalPage } from "./LegalPage"
import { LoginPage } from "./LoginPage"
import { Logo } from "./Logo"
import { setPageMeta } from "./pageMeta"
import { PersonPage } from "./PersonPage"
import { ProfilePage } from "./ProfilePage"
import { RequireAuth } from "./RequireAuth"
import { ResetPasswordPage } from "./ResetPasswordPage"
import { SearchPage } from "./SearchPage"
import { SettingsPage } from "./SettingsPage"
import { SignupPage } from "./SignupPage"
import { WatchedVerdictDialog } from "./WatchedVerdictDialog"
import { useAuth } from "./auth"
import { safeReturnPath } from "./paths"
import type { MediaType, SavedTitle, SearchHit, TitleDetail } from "./title"
import { titleKey, upsertSaved } from "./title"

export default function App() {
  const { user, loading, error: authError, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [justStamped, setJustStamped] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingWatched, setPendingWatched] = useState<SavedTitle | null>(null)
  const [logoutError, setLogoutError] = useState("")
  const [archiveError, setArchiveError] = useState("")
  const watchedTrigger = useRef<HTMLElement | null>(null)
  const menuButton = useRef<HTMLButtonElement | null>(null)
  const mobileMenu = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false)
        window.setTimeout(() => menuButton.current?.focus(), 0)
        return
      }
      if (event.key !== "Tab" || !mobileMenu.current || !menuButton.current) return
      const focusable = [
        menuButton.current,
        ...mobileMenu.current.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ]
      if (focusable.length < 2) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    function onPopState() {
      setMenuOpen(false)
    }
    function onResize() {
      if (window.innerWidth >= 768) setMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("popstate", onPopState)
    window.addEventListener("resize", onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("resize", onResize)
    }
  }, [menuOpen])

  useEffect(() => {
    if (
      location.pathname.startsWith("/title/") ||
      location.pathname.startsWith("/movies/") ||
      location.pathname.startsWith("/tv/") ||
      location.pathname.startsWith("/person/") ||
      location.pathname.startsWith("/people/") ||
      location.pathname.startsWith("/genre/") ||
      location.pathname.startsWith("/genres/") ||
      location.pathname.startsWith("/collection/") ||
      location.pathname.startsWith("/lists/")
    ) {
      return
    }
    const pagesByPath: Record<
      string,
      { title: string; description: string; indexable?: boolean }
    > = {
      "/": {
        title: "Stub — Your private watch archive",
        description:
          "Track movies and television with a private watchlist, viewing diary, ratings, favorites, and custom lists.",
      },
      "/search": {
        title: "Search · Stub",
        description: "Search movies and television to add to your Stub archive.",
      },
      "/genres": {
        title: "Genres · Stub",
        description: "Browse movies and television by genre on Stub.",
      },
      "/profile": {
        title: "Your taste · Stub",
        description: "Your private taste profile on Stub.",
        indexable: false,
      },
      "/diary": {
        title: "Diary · Stub",
        description: "Your private viewing diary on Stub.",
        indexable: false,
      },
      "/settings": {
        title: "Settings · Stub",
        description: "Account settings for your Stub archive.",
        indexable: false,
      },
      "/login": {
        title: "Log in · Stub",
        description: "Log in to your private Stub archive.",
        indexable: false,
      },
      "/signup": {
        title: "Sign up · Stub",
        description: "Create a private Stub archive for movies and television.",
        indexable: false,
      },
      "/forgot-password": {
        title: "Forgot password · Stub",
        description: "Reset access to your Stub archive.",
        indexable: false,
      },
      "/reset-password": {
        title: "Reset password · Stub",
        description: "Choose a new password for your Stub archive.",
        indexable: false,
      },
      "/privacy": {
        title: "Privacy · Stub",
        description: "How Stub stores and uses your private watch archive.",
      },
      "/terms": {
        title: "Terms · Stub",
        description: "House rules for using Stub.",
      },
    }
    const page = pagesByPath[location.pathname]
    setPageMeta({
      title: page?.title ?? "Page not found · Stub",
      description: page?.description ?? "This screen is not on the Stub programme.",
      canonicalPath: location.pathname,
      indexable: page ? page.indexable !== false : false,
    })
  }, [location.pathname])

  const titlesQuery = useQuery({
    queryKey: ["titles"],
    queryFn: () => fetchJson<SavedTitle[]>("/api/titles"),
    enabled: Boolean(user),
  })
  const titles = titlesQuery.data ?? []

  function setTitles(updater: (current: SavedTitle[]) => SavedTitle[]) {
    queryClient.setQueryData<SavedTitle[]>(["titles"], (current) => updater(current ?? []))
  }

  function invalidateArchive() {
    queryClient.invalidateQueries({ queryKey: ["lists"] })
    queryClient.invalidateQueries({ queryKey: ["list"] })
    queryClient.invalidateQueries({ queryKey: ["diary"] })
  }

  const saveMutation = useMutation({
    mutationFn: (title: SearchHit | TitleDetail) =>
      fetchJson<SavedTitle>("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: title.tmdbId, mediaType: title.mediaType }),
      }),
    onSuccess: (saved) => {
      setArchiveError("")
      setTitles((current) => upsertSaved(current, saved))
      invalidateArchive()
    },
    onError: (error) => {
      setArchiveError(
        error instanceof Error ? error.message : "TITLE COULD NOT BE SAVED",
      )
    },
  })

  const watchedMutation = useMutation({
    mutationFn: (body: {
      tmdbId: number
      mediaType: MediaType
      score: number
      note: string | null
    }) =>
      fetchJson<SavedTitle>("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      setTitles((current) => upsertSaved(current, saved))
      setJustStamped(titleKey(saved))
      invalidateArchive()
    },
  })

  const removeMutation = useMutation({
    mutationFn: (ref: { tmdbId: number; mediaType: MediaType }) =>
      fetchJson<void>(`/api/titles/${ref.mediaType}/${ref.tmdbId}`, { method: "DELETE" }),
    onSuccess: (_void, ref) => {
      const key = titleKey(ref)
      setTitles((current) => current.filter((title) => titleKey(title) !== key))
      invalidateArchive()
    },
  })

  const rateMutation = useMutation({
    mutationFn: (body: {
      tmdbId: number
      mediaType: MediaType
      score: number
      note: string | null
    }) =>
      fetchJson<SavedTitle>("/api/ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      setTitles((current) => upsertSaved(current, saved))
      invalidateArchive()
    },
  })
  const favoriteMutation = useMutation({
    mutationFn: (title: SavedTitle) =>
      title.favorite
        ? fetchJson<void>(`/api/favorites/${title.mediaType}/${title.tmdbId}`, {
            method: "DELETE",
          })
        : fetchJson("/api/favorites", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tmdbId: title.tmdbId, mediaType: title.mediaType }),
          }),
    onSuccess: (_result, title) => {
      setArchiveError("")
      setTitles((current) =>
        current.map((item) =>
          titleKey(item) === titleKey(title)
            ? { ...item, favorite: !title.favorite }
            : item,
        ),
      )
      invalidateArchive()
    },
    onError: (error) => {
      setArchiveError(
        error instanceof Error ? error.message : "FAVORITE COULD NOT BE UPDATED",
      )
    },
  })
  const progressMutation = useMutation({
    mutationFn: (body: { tmdbId: number; season: number; episode: number }) =>
      fetchJson<SavedTitle>("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mediaType: "tv" }),
      }),
    onSuccess: (saved) => {
      setTitles((current) => upsertSaved(current, saved))
      invalidateArchive()
    },
  })

  function requireUser() {
    if (user) return true
    navigate("/login", { state: { from: safeReturnPath(location.pathname) } })
    return false
  }

  function saveToWatchlist(title: SearchHit | TitleDetail) {
    if (!requireUser()) return
    if (titles.some((saved) => titleKey(saved) === titleKey(title))) return
    if (
      saveMutation.isPending &&
      saveMutation.variables &&
      titleKey(saveMutation.variables) === titleKey(title)
    ) {
      return
    }
    saveMutation.mutate(title)
  }

  function markWatched(tmdbId: number, mediaType: MediaType) {
    if (!requireUser()) return
    const title = titles.find(
      (saved) => saved.tmdbId === tmdbId && saved.mediaType === mediaType,
    )
    if (!title) return
    watchedMutation.reset()
    watchedTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPendingWatched(title)
  }

  async function removeTitle(tmdbId: number, mediaType: MediaType) {
    if (!requireUser()) return
    await removeMutation.mutateAsync({ tmdbId, mediaType })
  }

  async function rateTitle(
    tmdbId: number,
    mediaType: MediaType,
    score: number,
    note: string | null,
  ) {
    if (!requireUser()) return
    await rateMutation.mutateAsync({ tmdbId, mediaType, score, note })
  }

  function toggleFavorite(title: SavedTitle) {
    if (!requireUser()) return
    favoriteMutation.mutate(title)
  }

  async function updateProgress(tmdbId: number, season: number, episode: number) {
    if (!requireUser()) return
    await progressMutation.mutateAsync({ tmdbId, season, episode })
  }

  async function confirmWatched(score: number, note: string | null) {
    if (!pendingWatched) return
    await watchedMutation.mutateAsync({
      tmdbId: pendingWatched.tmdbId,
      mediaType: pendingWatched.mediaType,
      score,
      note,
    })
    closeWatchedDialog()
  }

  function closeWatchedDialog() {
    setPendingWatched(null)
    requestAnimationFrame(() => watchedTrigger.current?.focus())
  }

  async function handleLogout() {
    setLogoutError("")
    try {
      await logout()
      setMenuOpen(false)
      navigate("/login", { replace: true })
    } catch {
      // The panel covers the header's error slot, so it has to close to show it.
      setMenuOpen(false)
      setLogoutError("LOG OUT FAILED · TRY AGAIN")
    }
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " is-active" : ""}`

  const panelClass = ({ isActive }: { isActive: boolean }) =>
    `mobile-menu-link flex min-h-[44px] items-center font-mono text-[12px] tracking-[0.07em]${
      isActive ? " is-active" : " text-text-dim hover:text-text"
    }`

  const detailPage = (
    <DetailPage
      savedTitles={titles}
      savedTitlesLoading={titlesQuery.isLoading}
      signedIn={Boolean(user)}
      onSave={saveToWatchlist}
      onMarkWatched={markWatched}
      onRemove={removeTitle}
      onRate={rateTitle}
      onToggleFavorite={toggleFavorite}
      onUpdateProgress={updateProgress}
    />
  )
  const personPage = (
    <PersonPage
      savedTitles={titles}
      signedIn={Boolean(user)}
      onSave={saveToWatchlist}
    />
  )
  const genrePage = (
    <GenrePage
      key={location.pathname}
      savedTitles={titles}
      signedIn={Boolean(user)}
      onSave={saveToWatchlist}
    />
  )
  const collectionPage = (
    <RequireAuth>
      <CollectionPage
        titles={titles}
        loading={titlesQuery.isLoading}
        error={titlesQuery.isError}
        onRetry={() => void titlesQuery.refetch()}
        onMarkWatched={markWatched}
        onToggleFavorite={toggleFavorite}
        onUpdateProgress={updateProgress}
      />
    </RequireAuth>
  )

  return (
    <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 sm:px-8">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="relative z-50 border-b border-border">
        <div className="relative z-[60] flex items-center gap-6 py-6 sm:pt-8">
          <NavLink to="/" className="site-logo text-text" aria-label="Stub home">
            <Logo />
          </NavLink>
          <div className="mx-auto hidden w-full max-w-sm lg:block">
            <HeaderSearch key={`desktop-${location.pathname}-${location.search}`} />
          </div>
          <nav className="ml-auto hidden items-center gap-4 font-mono text-[12px] tracking-[0.07em] md:flex lg:gap-6">
            <NavLink to="/" end className={navClass}>
              HOME
            </NavLink>
            <NavLink
              to="/genres"
              className={({ isActive }) =>
                navClass({
                  isActive:
                    isActive ||
                    location.pathname.startsWith("/genre/") ||
                    location.pathname.startsWith("/genres/"),
                })
              }
            >
              GENRES
            </NavLink>
            <NavLink
              to="/search"
              className={({ isActive }) => `${navClass({ isActive })} lg:hidden`}
            >
              SEARCH
            </NavLink>
            {user && (
              <NavLink to="/collection/watchlist" className={navClass}>
                COLLECTION
              </NavLink>
            )}
            {!loading && !authError && (
              user ? (
                <>
                  <NavLink to="/profile" className={navClass}>
                    {user.displayName.toUpperCase()}
                  </NavLink>
                  <button
                    type="button"
                    className="nav-link"
                    onClick={() => void handleLogout()}
                  >
                    LOG OUT
                  </button>
                </>
              ) : (
                <NavLink to="/login" className={navClass}>
                  LOG IN
                </NavLink>
              )
            )}
          </nav>
          <button
            ref={menuButton}
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="-mr-2 ml-auto inline-flex size-11 items-center justify-center text-text-dim hover:text-text md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              className="size-6"
              aria-hidden="true"
            >
              <path
                d={menuOpen ? "M5 5l14 14M19 5L5 19" : "M3 6h18M3 12h18M3 18h18"}
              />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="mobile-menu-backdrop md:hidden"
            onClick={() => {
              setMenuOpen(false)
              window.setTimeout(() => menuButton.current?.focus(), 0)
            }}
          />
        )}
        {menuOpen && (
          <nav
            ref={mobileMenu}
            id="mobile-menu"
            aria-label="Main navigation"
            className="mobile-menu enter pb-2 md:hidden"
          >
            <div className="py-4">
              <HeaderSearch
                key={`mobile-${location.pathname}-${location.search}`}
                autoFocus
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
            <div className="flex flex-col divide-y divide-border border-t border-border">
              <NavLink to="/" end className={panelClass} onClick={() => setMenuOpen(false)}>
                HOME
              </NavLink>
              <NavLink to="/search" className={panelClass} onClick={() => setMenuOpen(false)}>
                SEARCH
              </NavLink>
              <NavLink
                to="/genres"
                className={({ isActive }) =>
                  panelClass({
                    isActive:
                      isActive ||
                      location.pathname.startsWith("/genre/") ||
                      location.pathname.startsWith("/genres/"),
                  })
                }
                onClick={() => setMenuOpen(false)}
              >
                GENRES
              </NavLink>
              {!loading && !authError && (
                user ? (
                  <>
                    <NavLink
                      to="/collection/watchlist"
                      className={panelClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      COLLECTION
                    </NavLink>
                    <NavLink
                      to="/diary"
                      className={panelClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      DIARY
                    </NavLink>
                    <NavLink
                      to="/profile"
                      className={panelClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      {user.displayName.toUpperCase()}
                    </NavLink>
                    <NavLink
                      to="/settings"
                      className={panelClass}
                      onClick={() => setMenuOpen(false)}
                    >
                      SETTINGS
                    </NavLink>
                    <button
                      type="button"
                      className="flex min-h-[44px] items-center font-mono text-[12px] tracking-[0.07em] text-text-dim hover:text-text"
                      onClick={() => void handleLogout()}
                    >
                      LOG OUT
                    </button>
                  </>
                ) : (
                  <NavLink to="/login" className={panelClass} onClick={() => setMenuOpen(false)}>
                    LOG IN
                  </NavLink>
                )
              )}
            </div>
          </nav>
        )}
        <p
          aria-live="polite"
          className="absolute right-0 top-full mt-2 font-mono text-[11px] text-stamp"
        >
          {logoutError}
        </p>
      </header>

      {archiveError && (
        <p
          className="border-b border-border py-3 font-mono text-[11px] text-stamp"
          role="alert"
        >
          {archiveError}
        </p>
      )}
      <div className="flex-1" id="main-content">
        <Routes>
          <Route
          path="/"
          element={
            <HomePage
              titles={titles}
              loading={titlesQuery.isLoading}
              signedIn={Boolean(user)}
              justStamped={justStamped}
              onSave={saveToWatchlist}
              onMarkWatched={markWatched}
              onToggleFavorite={toggleFavorite}
            />
          }
        />
        <Route
          path="/search"
          element={
            <SearchPage
              savedTitles={titles}
              onSave={saveToWatchlist}
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
                titles={titles}
                loading={titlesQuery.isLoading}
                error={titlesQuery.isError}
                onRetry={() => void titlesQuery.refetch()}
                onToggleFavorite={toggleFavorite}
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
        <Route
          path="*"
          element={
            <main className="py-24">
              <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
                WRONG SCREEN
              </p>
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
          }
        />
        </Routes>
      </div>
      <footer className="site-footer">
        <div className="site-footer-main">
          <span>STUB · EST. 2026</span>
          <nav aria-label="Legal">
            <NavLink to="/privacy">PRIVACY</NavLink>
            <NavLink to="/terms">TERMS</NavLink>
          </nav>
        </div>
        <div className="tmdb-credit">
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit The Movie Database"
          >
            <img src="/tmdb-logo.svg" alt="TMDb" />
          </a>
          <p>
            This product uses the TMDb API but is not endorsed or certified by TMDb.
          </p>
        </div>
      </footer>
      {pendingWatched && (
        <WatchedVerdictDialog
          title={pendingWatched}
          pending={watchedMutation.isPending}
          error={
            watchedMutation.error instanceof Error
              ? watchedMutation.error.message
              : null
          }
          onCancel={() => {
            watchedMutation.reset()
            closeWatchedDialog()
          }}
          onConfirm={confirmWatched}
        />
      )}
    </div>
  )
}
