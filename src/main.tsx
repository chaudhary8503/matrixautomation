import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionGlobalConfig } from "framer-motion";
import App from "./App";
import { bootedFromSnapshot, hydrateFromSnapshot, queryClient } from "./lib/query-client";
import { installLinkPrefetch } from "./lib/link-prefetch";
import { preloadRoute } from "./routes";
import "./index.css";

// scripts/prerender.mjs sets this while it takes HTML snapshots for crawlers: skip animations so the
// snapshot holds the final, visible state. Real visitors keep their animations.
if (window.__PRERENDER__) MotionGlobalConfig.skipAnimations = true;

// Note: no global "vite:preloadError" → reload handler. Vite fires that event for background
// prefetches too, and a page reloading by itself (e.g. while someone types in the quote form) is
// worse than the error. A failed page load is handled where the visitor clicked: the error
// boundary reloads once for a new deploy (src/components/layout/ErrorBoundary.tsx).

// On a prerendered page, start from the data the snapshot was drawn with (marked stale, so it is
// refetched from Supabase at once) — the first render then matches the snapshot instead of
// flashing skeletons.
hydrateFromSnapshot();

function render() {
  // createRoot (not hydrateRoot): React replaces the snapshot markup on its first render.
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  if (!window.__PRERENDER__) installLinkPrefetch(queryClient);
}

// Over a snapshot, wait for this page's code first (max 4 s) so React's first render is the full
// page, not a loading spinner. Without a snapshot there is nothing to keep on screen.
if (bootedFromSnapshot) {
  const timeout = new Promise((r) => setTimeout(r, 4000));
  Promise.race([preloadRoute(location.pathname), timeout]).catch(() => {}).finally(render);
} else {
  render();
}
