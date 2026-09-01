function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
) {
  let element = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!element) {
    element = document.createElement("meta")
    element.setAttribute(attr, key)
    document.head.appendChild(element)
  }
  element.setAttribute("content", content)
}

export function setPageMeta({
  title,
  description,
  image,
  canonicalPath,
  indexable = true,
}: {
  title: string
  description?: string
  image?: string | null
  canonicalPath?: string
  indexable?: boolean
}) {
  document.title = title
  upsertMeta("property", "og:title", title)
  upsertMeta("name", "twitter:title", title)
  upsertMeta("name", "robots", indexable ? "index,follow" : "noindex,nofollow")
  if (description) {
    upsertMeta("name", "description", description)
    upsertMeta("property", "og:description", description)
    upsertMeta("name", "twitter:description", description)
  }
  const canonicalUrl = new URL(
    canonicalPath ?? window.location.pathname,
    window.location.origin,
  ).toString()
  upsertMeta("property", "og:url", canonicalUrl)
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement("link")
    canonical.rel = "canonical"
    document.head.appendChild(canonical)
  }
  canonical.href = canonicalUrl
  if (image) {
    upsertMeta("property", "og:image", image)
    upsertMeta("name", "twitter:image", image)
    upsertMeta("name", "twitter:card", "summary_large_image")
  } else {
    document.head.querySelector('meta[property="og:image"]')?.remove()
    document.head.querySelector('meta[name="twitter:image"]')?.remove()
    upsertMeta("name", "twitter:card", "summary")
  }
}
