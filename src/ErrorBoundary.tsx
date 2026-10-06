import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last-resort screen if something throws while drawing. Saved data is never touched here. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center">
        <p className="text-lg font-semibold text-white">Something went wrong</p>
        <p className="max-w-xs text-sm text-neutral-400">
          Your habits are still saved on this phone. Reload to try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-green-500 px-5 py-2.5 text-sm font-semibold text-black"
        >
          Reload
        </button>
      </div>
    );
  }
}
