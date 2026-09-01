import { useEffect, useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { HeaderSearch } from "./HeaderSearch"
import { Logo } from "./Logo"

type SiteHeaderProps = {
  user: { displayName: string } | null
  authReady: boolean
  onLogout: () => void
  logoutError: string
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

const DESKTOP_BREAKPOINT = 768

/**
 * Traps focus inside the open mobile panel and closes it on Escape, navigation,
 * or a resize past the breakpoint that hides it.
 */
function useMobileMenu(
  open: boolean,
  close: () => void,
  panel: React.RefObject<HTMLElement | null>,
  trigger: React.RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close()
        window.setTimeout(() => trigger.current?.focus(), 0)
        return
      }
      if (event.key !== "Tab" || !panel.current || !trigger.current) return
      const focusable = [
        trigger.current,
        ...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
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
    function onResize() {
      if (window.innerWidth >= DESKTOP_BREAKPOINT) close()
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("popstate", close)
    window.addEventListener("resize", onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("popstate", close)
      window.removeEventListener("resize", onResize)
    }
  }, [close, open, panel, trigger])
}

export function SiteHeader({
  user,
  authReady,
  onLogout,
  logoutError,
}: SiteHeaderProps) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement | null>(null)
  const mobileMenu = useRef<HTMLElement | null>(null)

  const close = () => setMenuOpen(false)
  useMobileMenu(menuOpen, close, mobileMenu, menuButton)

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " is-active" : ""}`

  const panelClass = ({ isActive }: { isActive: boolean }) =>
    `mobile-menu-link flex min-h-[44px] items-center font-mono text-[12px] tracking-[0.07em]${
      isActive ? " is-active" : " text-text-dim hover:text-text"
    }`

  const genresActive = ({ isActive }: { isActive: boolean }) =>
    isActive ||
    location.pathname.startsWith("/genre/") ||
    location.pathname.startsWith("/genres/")

  return (
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
            className={(state) => navClass({ isActive: genresActive(state) })}
          >
            GENRES
          </NavLink>
          <NavLink
            to="/search"
            className={(state) => `${navClass(state)} lg:hidden`}
          >
            SEARCH
          </NavLink>
          {user && (
            <NavLink to="/collection/watchlist" className={navClass}>
              COLLECTION
            </NavLink>
          )}
          {authReady &&
            (user ? (
              <>
                <NavLink to="/profile" className={navClass}>
                  {user.displayName.toUpperCase()}
                </NavLink>
                <button type="button" className="nav-link" onClick={onLogout}>
                  LOG OUT
                </button>
              </>
            ) : (
              <NavLink to="/login" className={navClass}>
                LOG IN
              </NavLink>
            ))}
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
            <path d={menuOpen ? "M5 5l14 14M19 5L5 19" : "M3 6h18M3 12h18M3 18h18"} />
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
            close()
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
              onNavigate={close}
            />
          </div>
          <div className="flex flex-col divide-y divide-border border-t border-border">
            <NavLink to="/" end className={panelClass} onClick={close}>
              HOME
            </NavLink>
            <NavLink to="/search" className={panelClass} onClick={close}>
              SEARCH
            </NavLink>
            <NavLink
              to="/genres"
              className={(state) => panelClass({ isActive: genresActive(state) })}
              onClick={close}
            >
              GENRES
            </NavLink>
            {authReady &&
              (user ? (
                <>
                  <NavLink to="/collection/watchlist" className={panelClass} onClick={close}>
                    COLLECTION
                  </NavLink>
                  <NavLink to="/diary" className={panelClass} onClick={close}>
                    DIARY
                  </NavLink>
                  <NavLink to="/profile" className={panelClass} onClick={close}>
                    {user.displayName.toUpperCase()}
                  </NavLink>
                  <NavLink to="/settings" className={panelClass} onClick={close}>
                    SETTINGS
                  </NavLink>
                  <button
                    type="button"
                    className="flex min-h-[44px] items-center font-mono text-[12px] tracking-[0.07em] text-text-dim hover:text-text"
                    onClick={() => {
                      close()
                      onLogout()
                    }}
                  >
                    LOG OUT
                  </button>
                </>
              ) : (
                <NavLink to="/login" className={panelClass} onClick={close}>
                  LOG IN
                </NavLink>
              ))}
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
  )
}

export function SiteFooter() {
  return (
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
        <p>This product uses the TMDb API but is not endorsed or certified by TMDb.</p>
      </div>
    </footer>
  )
}
