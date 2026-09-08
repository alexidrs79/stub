import type { ReactNode } from "react"

type PageStateProps = {
  heading?: string
  body?: string
  action?: ReactNode
  busy?: boolean
}

/// In-page empty, error, and busy copy. Full-screen misses (404, title down)
/// stay on `person-state` so a missing title still feels like a lobby, not a
/// dashed box in the middle of a collection.
export function PageState({ heading, body, action, busy = false }: PageStateProps) {
  return (
    <div className={busy ? "page-state is-busy" : "page-state"} role={busy ? "status" : undefined}>
      {heading && <h2>{heading}</h2>}
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}
