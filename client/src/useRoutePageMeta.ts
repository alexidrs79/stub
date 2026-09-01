import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { setPageMeta } from "./pageMeta"

type PageMeta = { title: string; description: string; indexable?: boolean }

/// Routes that render a TMDb record set their own meta once the record loads,
/// so this hook leaves them alone.
const DYNAMIC_PREFIXES = [
  "/title/",
  "/movies/",
  "/tv/",
  "/person/",
  "/people/",
  "/genre/",
  "/genres/",
  "/collection/",
  "/lists/",
]

const PAGES: Record<string, PageMeta> = {
  "/": {
    title: "Stub — Your private watch archive",
    description:
      "Track movies and television with a private watchlist, viewing diary, ratings, favorites, and custom lists.",
  },
  "/search": {
    title: "Search · Stub",
    description: "Search movies and television to add to your Stub archive.",
  },
  "/genres": {
    title: "Genres · Stub",
    description: "Browse movies and television by genre on Stub.",
  },
  "/profile": {
    title: "Your taste · Stub",
    description: "Your private taste profile on Stub.",
    indexable: false,
  },
  "/diary": {
    title: "Diary · Stub",
    description: "Your private viewing diary on Stub.",
    indexable: false,
  },
  "/settings": {
    title: "Settings · Stub",
    description: "Account settings for your Stub archive.",
    indexable: false,
  },
  "/login": {
    title: "Log in · Stub",
    description: "Log in to your private Stub archive.",
    indexable: false,
  },
  "/signup": {
    title: "Sign up · Stub",
    description: "Create a private Stub archive for movies and television.",
    indexable: false,
  },
  "/forgot-password": {
    title: "Forgot password · Stub",
    description: "Reset access to your Stub archive.",
    indexable: false,
  },
  "/reset-password": {
    title: "Reset password · Stub",
    description: "Choose a new password for your Stub archive.",
    indexable: false,
  },
  "/privacy": {
    title: "Privacy · Stub",
    description: "How Stub stores and uses your private watch archive.",
  },
  "/terms": {
    title: "Terms · Stub",
    description: "House rules for using Stub.",
  },
}

export function useRoutePageMeta() {
  const location = useLocation()
  useEffect(() => {
    if (DYNAMIC_PREFIXES.some((prefix) => location.pathname.startsWith(prefix))) {
      return
    }
    const page = PAGES[location.pathname]
    setPageMeta({
      title: page?.title ?? "Page not found · Stub",
      description: page?.description ?? "This screen is not on the Stub programme.",
      canonicalPath: location.pathname,
      indexable: page ? page.indexable !== false : false,
    })
  }, [location.pathname])
}
