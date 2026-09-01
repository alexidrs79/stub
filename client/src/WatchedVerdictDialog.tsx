import { useEffect, useRef } from "react"
import type { SavedTitle } from "./title"
import { VerdictForm } from "./VerdictForm"

type WatchedVerdictDialogProps = {
  title: SavedTitle
  pending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (score: number, note: string | null) => Promise<void>
}

export function WatchedVerdictDialog({
  title,
  pending,
  error,
  onCancel,
  onConfirm,
}: WatchedVerdictDialogProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel()
      if (event.key !== "Tab" || !panel.current) return
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), textarea:not(:disabled)",
      )
      if (focusable.length === 0) return
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

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [onCancel, pending])

  return (
    <div
      className="verdict-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watched-verdict-title"
        aria-describedby="watched-verdict-description"
        className="verdict-dialog"
      >
        <div className="border-b border-border p-5 sm:p-6">
          <p className="font-mono text-[10px] tracking-[0.14em] text-accent">
            ADMIT ONE · WATCHED
          </p>
          <div className="mt-3 flex items-start justify-between gap-6">
            <div>
              <h2
                id="watched-verdict-title"
                className="font-display text-display-md font-normal leading-tight"
              >
                Stamp your verdict
              </h2>
              <p id="watched-verdict-description" className="mt-2 text-body-sm leading-6 text-text-dim">
                Rate <span className="text-text">{title.title}</span> before moving it to your
                watched collection.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close verdict"
              disabled={pending}
              onClick={onCancel}
              className="grid size-8 shrink-0 place-items-center border border-border text-text-dim hover:border-accent-dim hover:text-accent disabled:opacity-45"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <VerdictForm
            submitLabel="Stamp as watched"
            pendingLabel="Stamping…"
            pending={pending}
            error={error}
            onSubmit={onConfirm}
            onCancel={onCancel}
            autoFocus
          />
        </div>
      </div>
    </div>
  )
}
