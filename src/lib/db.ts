import { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "@/types/database";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** A request that hangs (flaky mobile network) fails after this, so the page shows "Try again"
 *  instead of a loading skeleton forever. React Query also retries once on its own. */
const REQUEST_TIMEOUT_MS = 15_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  // Older browsers (Safari < 16) lack AbortSignal.timeout: they just get no timeout.
  if (typeof AbortSignal.timeout !== "function") return fetch(input, init);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal =
    init?.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, timeout]) : (init?.signal ?? timeout);
  return fetch(input, { ...init, signal });
};

/**
 * Database access for the public site: the REST (PostgREST) part of Supabase only, with the
 * publishable key. Much smaller than the full client (no auth, realtime or storage code), which
 * only the admin panel loads (src/lib/supabase.ts).
 */
export const db = new PostgrestClient<Database>(`${SUPABASE_URL}/rest/v1`, {
  headers: { apikey: SUPABASE_KEY },
  fetch: fetchWithTimeout,
});
