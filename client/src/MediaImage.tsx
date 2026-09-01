import { useState, type ReactNode } from "react"

type MediaImageProps = {
  src: string | null
  alt: string
  className: string
  imageClassName?: string
  fallback?: ReactNode
  loading?: "eager" | "lazy"
  fetchPriority?: "high" | "low" | "auto"
}

export function MediaImage({
  src,
  alt,
  className,
  imageClassName = "",
  fallback = "NO IMAGE",
  loading = "lazy",
  fetchPriority = "auto",
}: MediaImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const failed = !src || failedSrc === src
  const loaded = src != null && loadedSrc === src

  return (
    <span className={`media-image ${className}`}>
      <span className="media-image-fallback" aria-hidden={loaded && !failed}>
        {fallback}
      </span>
      {!failed && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={`${imageClassName}${loaded ? " is-loaded" : ""}`}
        />
      )}
    </span>
  )
}
