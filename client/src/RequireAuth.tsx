import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "./auth"
import { safeReturnPath } from "./paths"

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="py-24">
        <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
          LOADING
        </p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="collection-state my-24">
        <h1>Session unavailable</h1>
        <p>We could not check your account. Your archive has not been changed.</p>
        <button type="button" className="button-primary" onClick={refresh}>
          Retry
        </button>
      </main>
    )
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: safeReturnPath(location.pathname) }}
      />
    )
  }

  return children
}
