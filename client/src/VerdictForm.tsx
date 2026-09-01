import { useId, useState, type FormEvent } from "react"
import { dayToIso, localDateKey } from "./dates"

type VerdictFormProps = {
  initialScore?: number | null
  initialNote?: string | null
  initialDate?: string | null
  /// Shown when the form sets a stamp's date, hidden when it only edits a
  /// verdict from the detail page.
  showDate?: boolean
  submitLabel: string
  pendingLabel: string
  pending?: boolean
  error?: string | null
  onSubmit: (score: number, note: string | null, watchedAt?: string) => Promise<void>
  onCancel?: () => void
  autoFocus?: boolean
}

export function VerdictForm({
  initialScore = null,
  initialNote = null,
  initialDate = null,
  showDate = false,
  submitLabel,
  pendingLabel,
  pending = false,
  error,
  onSubmit,
  onCancel,
  autoFocus = false,
}: VerdictFormProps) {
  const [score, setScore] = useState<number | null>(initialScore)
  const [note, setNote] = useState(initialNote ?? "")
  const [day, setDay] = useState(initialDate ?? localDateKey())
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState("")
  const noteId = useId()
  const dateId = useId()
  const cleanNote = note.trim() || null
  const baseDate = initialDate ?? localDateKey()
  const dirty =
    score !== initialScore ||
    cleanNote !== (initialNote || null) ||
    (showDate && day !== baseDate)
  const busy = pending || submitting

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (score == null) return
    setSubmitting(true)
    setLocalError("")
    if (showDate && !day) {
      setLocalError("CHOOSE A WATCH DATE")
      setSubmitting(false)
      return
    }
    try {
      // An unchanged date means "now", which the server timestamps itself and
      // keeps the time of day rather than flattening it to midday.
      await onSubmit(
        score,
        cleanNote,
        showDate && day !== baseDate ? dayToIso(day) : undefined,
      )
      setSubmitted(false)
    } catch (submitError) {
      setLocalError(
        submitError instanceof Error ? submitError.message : "VERDICT COULD NOT BE SAVED",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend className="sr-only">Score, required</legend>
        <div className="flex items-end justify-between gap-4">
          <p className="verdict-label">SCORE · REQUIRED</p>
          <p className="font-display text-[30px] leading-none text-accent" aria-live="polite">
            {score ?? "—"}
            <span className="ml-1 font-mono text-[11px] text-text-dim">/ 10</span>
          </p>
        </div>
        <div className="verdict-scores" aria-label="Choose a score from 1 to 10">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              type="button"
              autoFocus={autoFocus && value === 1}
              aria-pressed={score === value}
              onClick={() => setScore(value)}
              className={`score-button${score === value ? " is-selected" : ""}`}
            >
              {value}
            </button>
          ))}
        </div>

        {showDate && (
          <div className="mt-6">
            <label htmlFor={dateId} className="verdict-label">
              WATCHED ON
            </label>
            <input
              id={dateId}
              type="date"
              value={day}
              max={localDateKey()}
              onChange={(event) => setDay(event.target.value)}
              className="field-input mt-2"
            />
          </div>
        )}
        <div className="mt-6 flex items-baseline justify-between gap-4">
          <label htmlFor={noteId} className="verdict-label">
            NOTE · OPTIONAL
          </label>
          <span className="font-mono text-[11px] text-text-dim">{note.length} / 140</span>
        </div>
        <textarea
          id={noteId}
          value={note}
          maxLength={140}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What stayed with you?"
          className="field-input mt-2 resize-y placeholder:text-text-dim/55"
        />
      </fieldset>

      <div className="mt-4 flex min-h-6 items-center justify-between gap-4">
        <p className={`verdict-status${error || localError || (submitted && score == null) ? " is-error" : ""}`}>
          {error || localError || (submitted && score == null ? "SELECT A SCORE FROM 1 TO 10" : dirty ? "UNSAVED CHANGES" : initialScore ? "SAVED" : "")}
        </p>
        <div className="flex shrink-0 gap-2">
          {onCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="button-outline min-h-11 px-5 text-body-sm font-medium"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy || (initialScore != null && !dirty)}
            className="button-primary min-h-11 px-5 text-body-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? pendingLabel : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
