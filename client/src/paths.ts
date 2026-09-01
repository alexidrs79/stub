import type { CollectionList, MediaType } from "./title"

export function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  )
}

export function titlePath(title: {
  mediaType: MediaType
  tmdbId: number
  title: string
}) {
  const section = title.mediaType === "movie" ? "movies" : "tv"
  return `/${section}/${slugify(title.title)}-${title.tmdbId}`
}

export function personPath(person: { tmdbId: number; name: string }) {
  return `/people/${slugify(person.name)}-${person.tmdbId}`
}

export function genrePath(genre: { name: string }) {
  return `/genres/${slugify(genre.name)}`
}

export function listPath(list: Pick<CollectionList, "id" | "name">) {
  return `/lists/${slugify(list.name)}-${list.id}`
}

export function numericIdFromSlug(value: string | undefined) {
  const match = /(?:^|-)(\d+)$/.exec(value ?? "")
  if (!match) return Number.NaN
  return Number(match[1])
}

export function listIdFromSlug(value: string | undefined) {
  const match = /(?:^|-)(c[a-z0-9]+)$/.exec(value ?? "")
  return match?.[1] ?? value ?? ""
}

export function safeReturnPath(value: unknown) {
  if (typeof value !== "string") return "/"
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/"
  }
  if (value.includes("://")) return "/"
  return value
}
