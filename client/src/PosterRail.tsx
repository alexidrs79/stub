import { Link } from "react-router-dom"
import { Marquee } from "./Marquee"
import { MediaImage } from "./MediaImage"
import { titlePath } from "./paths"
import type { ArchiveEntry, SearchHit } from "./title"
import { titleKey } from "./title"

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
            <p>THIS PART OF THE PROGRAMME IS UNAVAILABLE</p>
            {onRetry && <button type="button" onClick={onRetry}>RETRY</button>}
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
            <p>NO TITLES ON THIS REEL</p>
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
              (title) => titleKey(title) === titleKey(item),
            )
            return (
              <article
                key={titleKey(item)}
                className="poster-card marquee-item mr-3 w-[132px] shrink-0 sm:w-[144px]"
              >
                <Link to={titlePath(item)}>
                  <div className="poster-frame relative overflow-hidden border border-border bg-surface">
                    <MediaImage
                      src={item.posterUrl}
                      alt={`${item.title} poster`}
                      className="poster w-full"
                      imageClassName="object-cover"
                      fallback="NO POSTER"
                      loading={index < 8 ? "eager" : "lazy"}
                      fetchPriority={index < 4 ? "high" : "auto"}
                    />
                    {showArchiveStatus && saved && (
                      <span className={`poster-status is-${saved.status}`}>
                        {saved.status === "watched"
                          ? "STAMPED"
                          : saved.status === "watching"
                            ? "WATCHING"
                            : "WATCHLIST"}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-text">
                    {item.title}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] text-text-dim">
                    {metaFor?.(item) ??
                      `${item.year ?? "—"}${
                        item.voteAverage != null
                          ? ` · ${item.voteAverage.toFixed(1)}`
                          : ""
                      }`}
                  </p>
                </Link>
                {showArchiveStatus && !saved && onSave && (
                  <button
                    type="button"
                    className="poster-save"
                    onClick={() => onSave(item)}
                  >
                    + WATCHLIST
                  </button>
                )}
              </article>
            )
          })}
        </Marquee>
      )}
    </section>
  )
}
