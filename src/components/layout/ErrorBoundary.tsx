import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/site/ErrorState";

/** Errors a browser raises when a page's code file can't be loaded (e.g. removed by a new deploy). */
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS|Failed to fetch/i;

export const isChunkLoadError = (err: unknown) =>
  CHUNK_ERROR.test(err instanceof Error ? `${err.name} ${err.message}` : String(err));

const RELOAD_KEY = "matrix:reloaded-for-new-version";

/**
 * After a deploy, old code files are deleted from the server. A visitor whose tab was opened
 * before that gets an error on their next click — reloading picks up the new version. Reloads at
 * most once per 30 s, so a real outage can never cause a reload loop. Returns whether it reloads.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // storage blocked: can't guard against loops, so don't auto-reload
  }
  window.location.reload();
  return true;
}

type Props = {
  children: ReactNode;
  /** When this changes (e.g. the pathname), the boundary clears its error — navigating away recovers. */
  resetKey?: string;
};

/**
 * Catches render errors so one broken page shows a message (with the header and footer still
 * working) instead of unmounting the whole app into a white screen.
 */
export class ErrorBoundary extends Component<Props, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <section className="py-24">
        <ErrorState
          message={
            isChunkLoadError(this.state.error)
              ? "The website was just updated. Please reload the page to continue."
              : "Sorry, something went wrong while showing this page."
          }
          onRetry={() => window.location.reload()}
        />
        <p className="mt-4 text-center text-sm">
          <a href="/" className="text-primary hover:underline">
            Go to the home page
          </a>
        </p>
      </section>
    );
  }
}
