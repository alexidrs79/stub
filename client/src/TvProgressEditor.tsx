import { useState, type FormEvent } from "react"
import type { SeasonOption } from "./title"

/// Takes the season list and the saved position separately: on the detail page
/// the seasons come from the TMDb record, not from the archive entry.
type TvProgressEditorProps = {
  seasonOptions: SeasonOption[]
  progress: { season: number; episode: number } | null
  mode: "detail" | "collection"
  onUpdate: (season: number, episode: number) => Promise<void>
  onMessage?: (message: string) => void
}

export function TvProgressEditor({
  seasonOptions,
  progress,
  mode,
  onUpdate,
  onMessage,
}: TvProgressEditorProps) {
  const options = seasonOptions ?? []
  const initialSeason =
    options.find((option) => option.season === progress?.season) ?? options[0]
  const [season, setSeason] = useState(initialSeason?.season ?? 0)
  const [episode, setEpisode] = useState(
    initialSeason ? Math.min(progress?.episode ?? 1, initialSeason.episodeCount) : 0,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const selected = options.find((option) => option.season === season)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected || episode < 1 || episode > selected.episodeCount) return
    setBusy(true)
    setError("")
    onMessage?.("")
    try {
      await onUpdate(season, episode)
      onMessage?.("PROGRESS SAVED")
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Progress could not be saved."
      setError(message)
      onMessage?.(message)
    } finally {
      setBusy(false)
    }
  }

  if (options.length === 0) {
    return (
      <div className={mode === "detail" ? "detail-progress" : "collection-progress-empty"}>
        {mode === "detail" && <p>NOW WATCHING</p>}
        <span>EPISODE DATA UNAVAILABLE</span>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className={mode === "detail" ? "detail-progress" : "collection-progress-form"}
    >
      {mode === "detail" && <p>NOW WATCHING</p>}
      <div>
        <label>
          <span>{mode === "detail" ? "S" : "SEASON"}</span>
          <select
            aria-label="Season"
            value={season}
            disabled={busy}
            onChange={(event) => {
              setSeason(Number(event.target.value))
              setEpisode(1)
            }}
          >
            {options.map((option) => (
              <option key={option.season} value={option.season}>
                {option.season}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{mode === "detail" ? "E" : "EPISODE"}</span>
          <select
            aria-label="Episode"
            value={episode}
            disabled={busy}
            onChange={(event) => setEpisode(Number(event.target.value))}
          >
            {Array.from(
              { length: selected?.episodeCount ?? 0 },
              (_, index) => index + 1,
            ).map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "SAVING…" : "UPDATE"}
        </button>
      </div>
      {error && !onMessage && <p>{error}</p>}
    </form>
  )
}
