import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "./auth"
import { PageState } from "./PageState"
import { safeReturnPath } from "./paths"

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="py-24">
        <PageState busy body="Loading…" />
      </main>
    )
  }

  if (error) {
    return (
      <main className="py-24">
        <PageState
          heading="Session unavailable"
          body="We could not check your account. Your archive has not been changed."
          action={
            <button type="button" className="button-primary" onClick={refresh}>
              Retry
            </button>
          }
        />
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
