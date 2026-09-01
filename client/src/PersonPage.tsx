import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ApiError, fetchJson } from "./api"
import { MediaImage } from "./MediaImage"
import { PosterRail } from "./PosterRail"
import { setPageMeta } from "./pageMeta"
import { numericIdFromSlug, personPath } from "./paths"
import type {
  PersonCredit,
  PersonDetail,
  ArchiveEntry,
  SearchHit,
} from "./title"
import { titleKey } from "./title"

type PersonPageProps = {
  archive: ArchiveEntry[]
  signedIn: boolean
  onSave: (title: SearchHit) => void
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
}

function yearOf(date: string | null) {
  return date?.slice(0, 4) || null
}

function shortBiography(biography: string) {
  if (biography.length <= 560) return biography
  const end = biography.lastIndexOf(" ", 560)
  return `${biography.slice(0, end > 420 ? end : 560).trim()}…`
}

function creditCards(credits: PersonCredit[]): SearchHit[] {
  return credits.map((credit) => ({
    tmdbId: credit.tmdbId,
    mediaType: credit.mediaType,
    title: credit.title,
    year: credit.year,
    releaseDate: null,
    genre: credit.mediaType === "movie" ? "MOVIE" : "TV",
    posterUrl: credit.posterUrl,
    backdropUrl: null,
    voteAverage: credit.voteAverage,
  }))
}

export function PersonPage({
  archive,
  signedIn,
  onSave,
}: PersonPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id, personRef } = useParams()
  const tmdbId = id ? Number(id) : numericIdFromSlug(personRef)
  const validId = Number.isSafeInteger(tmdbId) && tmdbId > 0
  const [expandedBio, setExpandedBio] = useState(false)
  const [filmography, setFilmography] = useState<"all" | "movie" | "tv">("all")
  const person = useQuery({
    queryKey: ["person", tmdbId],
    queryFn: () => fetchJson<PersonDetail>(`/api/person/${tmdbId}`),
    enabled: validId,
    staleTime: 1000 * 60 * 10,
    retry: false,
  })

  useEffect(() => {
    if (!person.data) return
    const canonicalPath = personPath(person.data)
    if (location.pathname !== canonicalPath) {
      navigate(canonicalPath, { replace: true })
      return
    }
    setPageMeta({
      title: `${person.data.name} · Stub`,
      description:
        person.data.biography ||
        `${person.data.name} on Stub — filmography and known titles.`,
      image: person.data.profileUrl,
      canonicalPath,
    })
  }, [location.pathname, navigate, person.data])

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate("/")
  }

  const notFound =
    !validId ||
    (person.error instanceof ApiError &&
      (person.error.status === 400 || person.error.status === 404))

  if (notFound) {
    return (
      <main className="person-state">
        <button type="button" className="back-control" onClick={goBack}>
          ← BACK
        </button>
        <p>OFF THE BILL</p>
        <h1>Cast member not found</h1>
        <span>This person is not listed in today’s programme.</span>
        <Link to="/search" className="button-primary">
          SEARCH TITLES
        </Link>
      </main>
    )
  }

  if (person.isError) {
    return (
      <main className="person-state">
        <button type="button" className="back-control" onClick={goBack}>
          ← BACK
        </button>
        <p>PROGRAMME DELAYED</p>
        <h1>Cast page unavailable</h1>
        <span>We could not load this person or their credits.</span>
        <button
          type="button"
          className="button-primary"
          onClick={() => void person.refetch()}
        >
          RETRY
        </button>
      </main>
    )
  }

  if (!person.data) {
    return (
      <main className="py-24">
        <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
          LOADING
        </p>
      </main>
    )
  }

  const data = person.data
  const birthYear = yearOf(data.birthday)
  const deathYear = yearOf(data.deathday)
  const lifespan = birthYear
    ? `${birthYear}—${deathYear ?? "PRESENT"}`
    : deathYear
      ? `—${deathYear}`
      : null
  const biography = data.biography || "No biography on file."
  const movieCards = creditCards(data.credits.movies)
  const tvCards = creditCards(data.credits.tv)
  const creditByKey = new Map(
    [...data.credits.movies, ...data.credits.tv].map((credit) => [
      titleKey(credit),
      credit,
    ]),
  )

  return (
    <main className="pb-24 pt-8">
      <button type="button" className="back-control mt-6" onClick={goBack}>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M13 8H3m4-4L3 8l4 4" />
        </svg>
        BACK
      </button>

      <section className="person-hero enter">
        {data.profileUrl && (
          <MediaImage
            src={data.profileUrl}
            alt=""
            className="person-hero-ghost"
            imageClassName="object-cover object-[center_20%]"
            fallback=""
            loading="eager"
          />
        )}
        <div className="person-portrait-frame">
          <MediaImage
            src={data.profileUrl}
            alt={`${data.name} portrait`}
            className="person-portrait"
            imageClassName="object-cover object-[center_15%]"
            fallback={initials(data.name)}
            loading="eager"
            fetchPriority="high"
          />
        </div>
        <div className="person-intro">
          <p>
            {data.knownForDepartment.toUpperCase()}
            {lifespan ? ` · ${lifespan}` : ""}
          </p>
          <h1>{data.name}</h1>
          {data.placeOfBirth && <span>{data.placeOfBirth}</span>}
          <div className="person-biography">
            <p>{expandedBio ? biography : shortBiography(biography)}</p>
            {biography.length > 560 && (
              <button
                type="button"
                aria-expanded={expandedBio}
                onClick={() => setExpandedBio((expanded) => !expanded)}
              >
                {expandedBio ? "SHOW LESS" : "READ MORE"}
              </button>
            )}
          </div>
        </div>
      </section>

      <PosterRail
        title="Known for"
        titles={data.knownFor}
        archive={archive}
        onSave={onSave}
        showArchiveStatus={signedIn}
        enter
      />

      <section className="person-filmography">
        <p>FILMOGRAPHY</p>
        <h2>On the programme</h2>
        <span>
          {data.credits.movies.length} movies · {data.credits.tv.length} television
          credits
        </span>
        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["all", "ALL"],
              ["movie", "MOVIES"],
              ["tv", "TV"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filmography === value}
              className={filmography === value ? "genre-chip is-active" : "genre-chip"}
              onClick={() => setFilmography(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {(filmography === "all" || filmography === "movie") && (
      <PosterRail
        title="Movies"
        titles={movieCards}
        archive={archive}
        onSave={onSave}
        showArchiveStatus={signedIn}
        metaFor={(item) => {
          const credit = creditByKey.get(titleKey(item))
          return `${credit?.year ?? "—"} · ${credit?.character ?? "—"}`
        }}
      />
      )}
      {(filmography === "all" || filmography === "tv") && (
      <PosterRail
        title="Television"
        titles={tvCards}
        archive={archive}
        onSave={onSave}
        showArchiveStatus={signedIn}
        metaFor={(item) => {
          const credit = creditByKey.get(titleKey(item))
          return `${credit?.year ?? "—"} · ${credit?.character ?? "—"}`
        }}
      />
      )}
    </main>
  )
}
