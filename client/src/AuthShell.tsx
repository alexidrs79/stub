import type { ReactNode } from "react"

type AuthShellProps = {
  eyebrow: string
  heading: string
  serial: string
  panel?: "theatre" | "box-office"
  children: ReactNode
  footer: ReactNode
}

export function AuthShell({
  eyebrow,
  heading,
  serial,
  panel = "theatre",
  children,
  footer,
}: AuthShellProps) {
  const panelClass =
    panel === "box-office" ? "auth-panel-box-office" : "auth-panel-theatre"

  return (
    <main className="grid min-h-[calc(100vh-128px)] items-center gap-12 lg:grid-cols-[45fr_55fr]">
      <div className="mx-auto w-full max-w-[420px] py-12">
        <div className="auth-card">
          <div className="auth-rail">
            <span className="auth-rail-label">ADMIT ONE</span>
            <span className="auth-rail-serial">№ {serial}</span>
          </div>
          <div className="auth-perf" aria-hidden="true" />
          <div className="auth-body">
            <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
              {eyebrow}
            </p>
            <h1 className="mt-3 font-display text-display-lg font-normal leading-none">
              {heading}
            </h1>
            {children}
          </div>
        </div>
        <p className="mt-6 text-center text-body-sm text-text-dim">{footer}</p>
      </div>

      <div
        className={`auth-panel ${panelClass} relative hidden h-full min-h-[580px] overflow-hidden lg:block`}
        aria-hidden="true"
      >
        <div className="auth-grain absolute inset-0" />
        <div className="auth-vignette absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/20 to-transparent" />
        <p className="auth-caption">EST. 2026 · ONE SEAT PER STUB</p>
      </div>
    </main>
  )
}

export function TicketCheck() {
  return (
    <main className="py-24">
      <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
        CHECKING YOUR TICKET
      </p>
    </main>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] tracking-[0.1em] text-text-dim">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="text-body-sm text-stamp" role="alert">
      {children}
    </p>
  )
}
