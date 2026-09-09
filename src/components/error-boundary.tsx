"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-medium">This view failed to render</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
