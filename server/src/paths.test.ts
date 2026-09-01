import assert from "node:assert/strict"
import { test } from "node:test"
import {
  genrePath,
  personPath,
  safeReturnPath,
  slugify,
  titlePath,
} from "./paths.js"

test("public paths use readable stable slugs", () => {
  assert.equal(slugify("Amélie & Friends!"), "amelie-and-friends")
  assert.equal(
    titlePath({
      mediaType: "movie",
      tmdbId: 634649,
      title: "Spider-Man: No Way Home",
    }),
    "/movies/spider-man-no-way-home-634649",
  )
  assert.equal(
    titlePath({ mediaType: "tv", tmdbId: 108978, title: "Reacher" }),
    "/tv/reacher-108978",
  )
  assert.equal(
    personPath({ tmdbId: 1136406, name: "Tom Holland" }),
    "/people/tom-holland-1136406",
  )
  assert.equal(genrePath({ name: "Science Fiction" }), "/genres/science-fiction")
})

test("safeReturnPath only allows same-origin relative paths", () => {
  assert.equal(safeReturnPath("/search"), "/search")
  assert.equal(safeReturnPath("/movies/reacher-108978"), "/movies/reacher-108978")
  assert.equal(safeReturnPath("//evil.example/phish"), "/")
  assert.equal(safeReturnPath("https://evil.example/"), "/")
  assert.equal(safeReturnPath("/\\evil"), "/")
  assert.equal(safeReturnPath("login"), "/")
  assert.equal(safeReturnPath(null), "/")
})
