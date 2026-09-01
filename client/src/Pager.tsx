type PagerProps = {
  label: string
  /// Every number here comes from the response being rendered, never from the
  /// page the reader just asked for. The previous page stays on screen while
  /// the next one loads, and a readout built from the requested page would
  /// describe rows that are not there yet.
  page: number
  pageSize: number
  /// How many rows the current page actually rendered, which is short of
  /// `pageSize` on the last one.
  shown: number
  total: number
  hasMore: boolean
  busy?: boolean
  onPage: (page: number) => void
}

/// Newest-first paging for the collection views, custom lists, and the diary.
/// Renders nothing while everything fits on one page.
export function Pager({
  label,
  page,
  pageSize,
  shown,
  total,
  hasMore,
  busy = false,
  onPage,
}: PagerProps) {
  if (total <= pageSize) return null
  const first = (page - 1) * pageSize + 1

  return (
    <nav className="collection-pager" aria-label={label}>
      <button
        type="button"
        className="button-outline"
        disabled={page === 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        ← NEWER
      </button>
      <p aria-live="polite">
        {shown > 0 ? `${first}–${first + shown - 1} OF ${total}` : `${total} TOTAL`}
      </p>
      <button
        type="button"
        className="button-outline"
        disabled={!hasMore || busy}
        onClick={() => onPage(page + 1)}
      >
        OLDER →
      </button>
    </nav>
  )
}
