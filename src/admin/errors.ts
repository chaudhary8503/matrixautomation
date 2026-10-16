/** Turns Supabase/Postgres errors into sentences an admin can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string; statusCode?: string | number } | null;
  const msg = e?.message ?? String(err);
  switch (e?.code) {
    case "23505":
      if (/slug/i.test(msg + (e.details ?? ""))) return "That web address (slug) is already used by another item. Choose a different one.";
      return "An item with these details already exists.";
    case "23503":
      return "This item is still in use (for example, products belong to it). Move or delete those first.";
    case "23514":
      if (/slug/i.test(msg)) return "The slug may only contain lowercase letters, numbers and single dashes.";
      return "One of the values isn't allowed. Please check the fields.";
    case "23502":
      return "A required field is empty.";
    case "42501":
    case "PGRST301":
      return "You don't have permission to do that. Try signing out and in again.";
  }
  if (/row-level security|unauthorized|jwt/i.test(msg)) return "You don't have permission to do that. Try signing out and in again.";
  if (/payload too large|exceeded the maximum allowed size|maximum allowed size/i.test(msg)) return "The file is too large.";
  if (/mime type|invalid_mime/i.test(msg)) return "That file type isn't allowed here.";
  if (/failed to fetch|network/i.test(msg)) return "Network problem — check your internet connection and try again.";
  return msg || "Something went wrong.";
}
