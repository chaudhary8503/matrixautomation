import { QueryClient, dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // catalogue data changes rarely
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Query keys that may be embedded in a prerendered page: public catalogue + site settings only.
 * Never admin (["admin", …]), auth, search or inquiry data.
 */
const SNAPSHOT_KEYS = new Set([
  "site_settings",
  "catalog",
  "categories",
  "brands",
  "brand",
  "brand_categories",
  "brand_products",
  "category_documents",
  "product",
  "industries",
  "logo_box", // where the logo sits inside each logo file (src/lib/logo-trim.ts)
]);

const isSnapshotKey = (key: readonly unknown[] | undefined) => typeof key?.[0] === "string" && SNAPSHOT_KEYS.has(key[0]);

/** True when this page load started from a prerendered snapshot (scripts/prerender.mjs). */
export const bootedFromSnapshot = document.documentElement.hasAttribute("data-prerendered");

/**
 * Seeds the cache with the data the snapshot was rendered from (<script id="rq-state">), so the
 * first render shows the same content instead of skeletons. That data is only a first paint: it is
 * marked stale right away, so every query refetches from Supabase as soon as its page mounts.
 */
export function hydrateFromSnapshot() {
  const el = document.getElementById("rq-state");
  if (!el) return;
  el.remove();
  try {
    const state = JSON.parse(el.textContent ?? "") as DehydratedState;
    hydrate(queryClient, {
      mutations: [],
      queries: (state.queries ?? []).filter((q) => isSnapshotKey(q.queryKey) && q.state.status === "success"),
    });
    void queryClient.invalidateQueries({ refetchType: "none" });
  } catch (err) {
    console.warn("Ignoring unreadable snapshot data", err);
  }
}

// The prerender script reads the cache through this; it exists only while prerendering.
if (window.__PRERENDER__) {
  window.__RQ_DEHYDRATE__ = () =>
    dehydrate(queryClient, {
      shouldDehydrateQuery: (q) => isSnapshotKey(q.queryKey) && q.state.status === "success",
      shouldDehydrateMutation: () => false,
    });
}
