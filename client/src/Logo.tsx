export function Logo() {
  return (
    <span className="brand-logo">
      <svg viewBox="0 0 42 22" className="brand-logo-mark" aria-hidden="true">
        <path
          d="M.5.5H41.5V7.6A3.4 3.4 0 0 0 41.5 14.4V21.5H.5V14.4A3.4 3.4 0 0 0 .5 7.6Z"
          fill="none"
          stroke="currentColor"
        />
        <path d="M17 .5V21.5" stroke="currentColor" strokeDasharray="2.2 1.6" />
        <path
          d="M20.9 7.2H34.1M20.9 11H34.1M20.9 14.8H29.5"
          stroke="currentColor"
        />
        <circle cx="10.4" cy="11" r="2.9" fill="var(--color-stamp)" />
      </svg>
      <span className="brand-logo-wordmark">Stub</span>
    </span>
  )
}
