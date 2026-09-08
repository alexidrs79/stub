import { Link } from "react-router-dom"
import { Marquee } from "./Marquee"
import { MediaImage } from "./MediaImage"
import { titlePath } from "./paths"
import type { ArchiveEntry, SearchHit } from "./title"
import { titleKey } from "./title"

function statusLabel(status: ArchiveEntry["status"]) {
  return status === "watched" ? "STAMPED" : status === "watching" ? "WATCHING" : "WATCHLIST"
}

export function PosterCard({
  title,
  saved,
  onSave,
  showStatus = false,
  meta,
  className = "poster-card",
  loading = "lazy",
  fetchPriority = "auto",
}: {
  title: SearchHit
  saved?: ArchiveEntry
  onSave?: (title: SearchHit) => void
  showStatus?: boolean
  meta: string
  className?: string
  loading?: "eager" | "lazy"
  fetchPriority?: "high" | "low" | "auto"
}) {
  return (
    <article className={className}>
      <Link to={titlePath(title)}>
        <div className="poster-frame relative overflow-hidden border border-border bg-surface">
          <MediaImage
            src={title.posterUrl}
            alt={`${title.title} poster`}
            className="poster w-full"
            imageClassName="object-cover"
            fallback="NO POSTER"
            loading={loading}
            fetchPriority={fetchPriority}
          />
          {showStatus && saved && (
            <span className={`poster-status is-${saved.status}`}>
              {statusLabel(saved.status)}
            </span>
          )}
        </div>
        <h3 className="mt-3 line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-text">
          {title.title}
        </h3>
        <p className="mt-1 font-mono text-[11px] text-text-dim">{meta}</p>
      </Link>
      {showStatus && !saved && onSave && (
        <button type="button" className="poster-save" onClick={() => onSave(title)}>
          + WATCHLIST
        </button>
      )}
    </article>
  )
}

function defaultMeta(title: SearchHit) {
  return `${title.year ?? "—"}${
    title.voteAverage != null ? ` · ${title.voteAverage.toFixed(1)}` : ""
  }`
}

function PosterSkeletons() {
  return (
    <div className="mt-6 flex gap-2 overflow-hidden">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="skeleton-pulse w-[132px] shrink-0 sm:w-[144px]">
          <div className="poster bg-surface-raised" />
          <div className="mt-3 h-3 bg-surface-raised" />
          <div className="mt-2 h-2 w-2/3 bg-surface-raised" />
        </div>
      ))}
    </div>
  )
}

export function PosterRail({
  title,
  titles,
  loading = false,
  compact = false,
  enter = false,
  error = false,
  onRetry,
  metaFor,
  archive,
  onSave,
  showArchiveStatus = false,
}: {
  title: string
  titles: SearchHit[]
  loading?: boolean
  compact?: boolean
  enter?: boolean
  error?: boolean
  onRetry?: () => void
  metaFor?: (title: SearchHit) => string | null
  archive?: ArchiveEntry[]
  onSave?: (title: SearchHit) => void
  showArchiveStatus?: boolean
}) {
  return (
    <section className={`${compact ? "mt-6" : "mt-16"}${enter ? " enter enter-2" : ""}`}>
      {error ? (
        <>
          <div className="section-heading">
            <h2 className="font-display text-display-sm font-normal">{title}</h2>
          </div>
          <div className="rail-state">
            <p>This reel could not be loaded.</p>
            {onRetry && (
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        </>
      ) : loading ? (
        <>
          {title && (
            <div className="section-heading">
              <h2 className="font-display text-display-sm font-normal">{title}</h2>
            </div>
          )}
          <PosterSkeletons />
        </>
      ) : titles.length === 0 ? (
        <>
          <div className="section-heading">
            <h2 className="font-display text-display-sm font-normal">{title}</h2>
          </div>
          <div className="rail-state">
            <p>No titles on this reel.</p>
          </div>
        </>
      ) : (
        <Marquee
          count={titles.length}
          align="start"
          heading={
            title ? (
              <h2 className="font-display text-display-sm font-normal">{title}</h2>
            ) : undefined
          }
        >
          {titles.map((item, index) => {
            const saved = archive?.find(
              (entry) => titleKey(entry) === titleKey(item),
            )
            return (
              <PosterCard
                key={titleKey(item)}
                title={item}
                saved={saved}
                onSave={onSave}
                showStatus={showArchiveStatus}
                meta={metaFor?.(item) ?? defaultMeta(item)}
                className="poster-card marquee-item mr-3 w-[132px] shrink-0 sm:w-[144px]"
                loading={index < 8 ? "eager" : "lazy"}
                fetchPriority={index < 4 ? "high" : "auto"}
              />
            )
          })}
        </Marquee>
      )}
    </section>
  )
}
