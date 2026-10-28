import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Page numbers to show: first, last, and the neighbours of the current page, with gaps as "…". */
export function pageList(page: number, pageCount: number): (number | "…")[] {
  const keep = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  // Avoid a lone "…" standing in for a single page: show that page instead.
  if (keep.has(3) || page === 4) keep.add(2);
  if (keep.has(pageCount - 2) || page === pageCount - 3) keep.add(pageCount - 1);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/** After moving to another page, scroll back up to the top of the results (not on first load). */
export function useScrollOnPageChange(ref: RefObject<HTMLElement | null>, page: number) {
  const previous = useRef(page);
  useEffect(() => {
    if (previous.current === page) return;
    previous.current = page;
    const el = ref.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ref, page]);
}

const BOX =
  "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-3 text-sm font-medium transition-colors";

/** Previous · 1 … 4 5 6 … 65 · Next — real links, so pages can be bookmarked and shared. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  className,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const edge = (to: number, label: string, children: ReactNode, disabled: boolean) =>
    disabled ? (
      <span aria-disabled="true" className={cn(BOX, "cursor-not-allowed border-border text-muted-foreground/50")}>
        {children}
      </span>
    ) : (
      <Link to={hrefFor(to)} aria-label={label} className={cn(BOX, "border-border bg-card hover:border-primary/40 hover:text-primary")}>
        {children}
      </Link>
    );

  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}>
      {edge(
        page - 1,
        "Previous page",
        <>
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Previous</span>
        </>,
        page <= 1,
      )}
      {pageList(page, pageCount).map((n, i) =>
        n === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <Link
            key={n}
            to={hrefFor(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              BOX,
              n === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary/40 hover:text-primary",
            )}
          >
            {n}
          </Link>
        ),
      )}
      {edge(
        page + 1,
        "Next page",
        <>
          <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
        </>,
        page >= pageCount,
      )}
    </nav>
  );
}
