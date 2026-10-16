const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.",
  );
}
if (key.startsWith("sb_secret_")) {
  // The secret key bypasses all security rules. It must never ship to browsers.
  throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is a SECRET key. Use the publishable key (sb_publishable_…).");
}

export const SUPABASE_URL: string = url.replace(/\/+$/, "");
export const SUPABASE_KEY: string = key;
