import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { fetchJson } from "./api"
import { SearchPage } from "./SearchPage"
import type { SavedTitle, SearchHit } from "./title"

vi.mock("./api", () => ({ fetchJson: vi.fn() }))

const hit: SearchHit = {
  tmdbId: 550,
  mediaType: "movie",
  title: "Fight Club",
  year: 1999,
  releaseDate: "1999-10-15",
  genre: "DRAMA",
  posterUrl: null,
  backdropUrl: null,
  voteAverage: 8.4,
}

const saved: SavedTitle = {
  ...hit,
  runtime: "139 MIN",
  genres: ["DRAMA"],
  status: "watchlist",
  score: null,
  note: null,
  serial: "00550",
  favorite: false,
  progress: null,
  lastWatchedAt: null,
  savedAt: "2026-09-01T00:00:00.000Z",
  customListIds: [],
  seasonOptions: [],
}

function renderPage(onRemove: (tmdbId: number, mediaType: "movie" | "tv") => Promise<void>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/search?q=Fight"]}>
        <SearchPage
          savedTitles={[saved]}
          onSave={vi.fn()}
          onRemove={onRemove}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(fetchJson).mockResolvedValue([hit])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("SearchPage archive removal", () => {
  it("requires confirmation before removing a saved title", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn().mockResolvedValue(undefined)
    renderPage(onRemove)

    await screen.findByRole("link", { name: "Fight Club" })
    await user.click(screen.getByRole("button", { name: "REMOVE FROM ARCHIVE" }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(
      screen.getByRole("group", { name: "Remove Fight Club from archive" }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Remove from archive" }))
    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledWith(550, "movie")
    })
  })

  it("cancels removal without changing the archive", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn().mockResolvedValue(undefined)
    renderPage(onRemove)

    await screen.findByRole("link", { name: "Fight Club" })
    await user.click(screen.getByRole("button", { name: "REMOVE FROM ARCHIVE" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("group", { name: "Remove Fight Club from archive" }),
    ).not.toBeInTheDocument()
  })
})
