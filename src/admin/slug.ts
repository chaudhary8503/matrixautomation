/** Same rules as the migration script and the database check. */
export function slugify(s: string) {
  return (
    String(s)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\+/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 80)
      .replace(/-+$/g, "") || ""
  );
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
