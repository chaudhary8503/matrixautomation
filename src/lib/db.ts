import { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "@/types/database";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/**
 * Database access for the public site: the REST (PostgREST) part of Supabase only, with the
 * publishable key. Much smaller than the full client (no auth, realtime or storage code), which
 * only the admin panel loads (src/lib/supabase.ts).
 */
export const db = new PostgrestClient<Database>(`${SUPABASE_URL}/rest/v1`, {
  headers: { apikey: SUPABASE_KEY },
});
