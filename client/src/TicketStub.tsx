import { useState } from "react"
import { Link } from "react-router-dom"
import { titlePath } from "./paths"
import type { ArchiveEntry, MediaType, SavedTitle } from "./title"
import "./TicketStub.css"

type TicketStubProps = {
  title: SavedTitle
  animateStamp?: boolean
  onMarkWatched?: (tmdbId: number, mediaType: MediaType, name: string) => void
  onToggleFavorite?: (entry: ArchiveEntry) => void
}

type Point = { x: number; y: number }

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Hand-stamped edge: 10 nodes at a wobbling radius, smoothed through their
// midpoints so the ring closes without a visible seam.
function roughRing(seed: number, radius: number) {
  const nodes = 10
  const center = 40
  const points: Point[] = Array.from({ length: nodes }, (_, index) => {
    const angle = (index / nodes) * Math.PI * 2
    const wobble = Math.sin(seed * 1.37 + index * 2.11)
    const wobbled = radius * (1 + wobble * 0.06)
    return {
      x: center + Math.cos(angle) * wobbled,
      y: center + Math.sin(angle) * wobbled,
    }
  })

  const start = midpoint(points[nodes - 1], points[0])
  let path = `M${start.x.toFixed(2)} ${start.y.toFixed(2)}`
  for (let index = 0; index < nodes; index += 1) {
    const control = points[index]
    const end = midpoint(control, points[(index + 1) % nodes])
    path += ` Q${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  }
  return `${path}Z`
}

function FilledStamp({
  seed,
  score,
  thump,
}: {
  seed: number
  score: number | null
  thump: boolean
}) {
  return (
    <svg
      className={`ticket-stamp${thump ? " stamp-thump" : ""}`}
      viewBox="0 0 80 80"
      role="img"
      aria-label={score == null ? "Watched" : `Watched, rated ${score} of 10`}
    >
      <path d={roughRing(seed, 33)} fill="currentColor" fillOpacity="0.16" />
      <path
        d={roughRing(seed, 33)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d={roughRing(seed + 4, 26)}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {score == null ? (
        <text
          x="40"
          y="44"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="'IBM Plex Mono', monospace"
          fontSize="9"
          letterSpacing="1.6"
        >
          WATCHED
        </text>
      ) : (
        <>
          <text
            x="40"
            y="41"
            textAnchor="middle"
            fill="currentColor"
            fontFamily="'IBM Plex Mono', monospace"
            fontSize="22"
            fontWeight="500"
          >
            {score}
          </text>
          <text
            x="40"
            y="55"
            textAnchor="middle"
            fill="currentColor"
            fillOpacity="0.8"
            fontFamily="'IBM Plex Mono', monospace"
            fontSize="7.5"
            letterSpacing="1.6"
          >
            WATCHED
          </text>
        </>
      )}
    </svg>
  )
}

function EmptyStamp({ seed }: { seed: number }) {
  return (
    <svg className="ticket-stamp" viewBox="0 0 80 80" aria-hidden="true">
      <path className="stamp-preview" d={roughRing(seed, 33)} fill="currentColor" />
      <path
        d={roughRing(seed, 33)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="5 4"
      />
      <text
        x="40"
        y="37"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="'IBM Plex Mono', monospace"
        fontSize="9"
        letterSpacing="1.4"
      >
        MARK
      </text>
      <text
        x="40"
        y="50"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="'IBM Plex Mono', monospace"
        fontSize="9"
        letterSpacing="1.4"
      >
        WATCHED
      </text>
    </svg>
  )
}

export function TicketStub({
  title,
  animateStamp = false,
  onMarkWatched,
  onToggleFavorite,
}: TicketStubProps) {
  const [posterFailed, setPosterFailed] = useState(false)
  const watched = title.status === "watched"
  const seed = title.tmdbId % 97
  const tilt = (title.tmdbId % 13) - 6

  return (
    <article className="ticket">
      <div className="ticket-admit">
        <span className="ticket-admit-label">ADMIT ONE</span>
        <span className="ticket-admit-serial">№ {title.serial}</span>
      </div>
      <div className="ticket-perf" aria-hidden="true" />
      {posterFailed || !title.posterUrl ? (
        <div className="ticket-poster ticket-poster-fallback">
          <span>NO POSTER</span>
        </div>
      ) : (
        <img
          className="ticket-poster"
          src={title.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setPosterFailed(true)}
        />
      )}
      <div className="ticket-body">
        {onToggleFavorite && (
          <button
            type="button"
            className={`ticket-favorite${title.favorite ? " is-active" : ""}`}
            aria-label={title.favorite ? `Unpin ${title.title}` : `Pin ${title.title} as favorite`}
            aria-pressed={title.favorite}
            onClick={() => onToggleFavorite(title)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" />
            </svg>
          </button>
        )}
        <h3
          className={`ticket-title${title.title.length > 20 ? " is-long" : ""}`}
        >
          <Link
            to={titlePath(title)}
            className="hover:text-accent"
          >
            {title.title}
          </Link>
        </h3>
        <p className="ticket-meta">
          {title.year ?? "—"} · {title.runtime} · {title.genre}
        </p>
        {title.progress && (
          <p className="ticket-progress">
            WATCHING · S{String(title.progress.season).padStart(2, "0")} E
            {String(title.progress.episode).padStart(2, "0")}
          </p>
        )}
        {title.note && <p className="ticket-note">“{title.note}”</p>}
      </div>
      {watched ? (
        <div className="ticket-stamp-zone stamp-filled">
          <span
            className="ticket-stamp-tilt"
            style={{ transform: `rotate(${tilt}deg)` }}
          >
            <FilledStamp seed={seed} score={title.score} thump={animateStamp} />
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="ticket-stamp-zone stamp-empty"
          aria-label={`Mark ${title.title} watched`}
          onClick={() => onMarkWatched?.(title.tmdbId, title.mediaType, title.title)}
          disabled={!onMarkWatched}
        >
          <span
            className="ticket-stamp-tilt"
            style={{ transform: `rotate(${tilt}deg)` }}
          >
            <EmptyStamp seed={seed} />
          </span>
        </button>
      )}
    </article>
  )
}
