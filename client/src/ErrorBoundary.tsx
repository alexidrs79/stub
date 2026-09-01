import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught client error", error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="mx-auto max-w-xl px-4 py-24 sm:px-8">
        <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
          PROJECTION INTERRUPTED
        </p>
        <h1 className="mt-3 font-display text-display-lg font-normal">
          Stub needs a fresh reel
        </h1>
        <p className="mt-4 text-text-dim">
          An unexpected screen error occurred. Reload the page to try again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="button-primary px-6 py-3 text-body-sm font-semibold"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <a
            href="/"
            className="button-outline px-6 py-3 text-body-sm font-semibold"
          >
            Return home
          </a>
        </div>
      </main>
    )
  }
}
