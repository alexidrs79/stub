import { Link } from "react-router-dom"

const TABS = [
  { to: "/collection/watchlist", id: "watchlist", label: "WATCHLIST" },
  { to: "/collection/watching", id: "watching", label: "WATCHING" },
  { to: "/collection/watched", id: "watched", label: "WATCHED" },
  { to: "/collection/favorites", id: "favorites", label: "FAVORITES" },
  { to: "/diary", id: "diary", label: "DIARY" },
] as const

export type CollectionTabId = (typeof TABS)[number]["id"] | "list"

export function CollectionTabs({ current }: { current: CollectionTabId }) {
  return (
    <nav className="collection-tabs" aria-label="Collection views">
      {TABS.map((tab) => (
        <Link key={tab.id} to={tab.to} className={current === tab.id ? "is-active" : ""}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
