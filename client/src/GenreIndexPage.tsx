import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { Link } from "react-router-dom"
import { fetchJson } from "./api"
import { setPageMeta } from "./pageMeta"
import { genrePath } from "./paths"
import type { GenreInfo } from "./title"

function kindLabel(genre: GenreInfo) {
  if (genre.movie && genre.tv) return "MOVIES · TV"
  if (genre.tv) return "TV"
  return "MOVIES"
}

export function GenreIndexPage() {
  const genres = useQuery({
    queryKey: ["genres"],
    queryFn: () => fetchJson<GenreInfo[]>("/api/genres"),
    staleTime: 1000 * 60 * 60,
  })

  useEffect(() => {
    setPageMeta({
      title: "Genres · Stub",
      description: "Browse movies and television by genre on Stub.",
    })
  }, [])

  return (
    <main className="pb-24 pt-12">
      <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
        THE PROGRAMME
      </p>
      <h1 className="mt-3 font-display text-display-lg font-normal">Genres</h1>
      <p className="mt-4 max-w-xl text-text-dim">
        Pick a category and walk the current bill — movies, television, or both.
      </p>

      {genres.isError && (
        <div className="rail-state mt-16">
          <p>THE PROGRAMME IS UNAVAILABLE. TRY AGAIN.</p>
          <button type="button" onClick={() => void genres.refetch()}>
            RETRY
          </button>
        </div>
      )}
      {genres.isLoading && (
        <p className="mt-16 font-mono text-[11px] tracking-[0.08em] text-text-dim">
          LOADING
        </p>
      )}
      {genres.data && (
        <div className="genre-directory">
          {genres.data.map((genre) => (
            <Link key={genre.id} to={genrePath(genre)}>
              <span>{genre.name}</span>
              <span>{kindLabel(genre)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
