import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Full Supabase client (auth, storage) — admin panel only. Public pages use `db` (src/lib/db.ts). */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
