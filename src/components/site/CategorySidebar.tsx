import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import type { CategoryNode } from "@/lib/category-tree";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  tree: CategoryNode[];
  /** Slug of the selected category ("" = all). */
  selected: string;
  /** Link for a category ("" = all). */
  hrefFor: (slug: string) => string;
  allLabel: string;
  allCount?: number;
  /** Accessible name of the navigation, e.g. "Product categories". */
  label: string;
  loading?: boolean;
  className?: string;
};

const ITEM =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Count({ n, active }: { n?: number; active: boolean }) {
  if (n === undefined) return null;
  return (
    <span className={cn("ml-auto shrink-0 font-mono text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
      {n.toLocaleString()}
    </span>
  );
}

/**
 * Category list for the Products and brand pages: top-level categories in alphabetical order.
 * A category's subcategories only open while it (or one of them) is selected — e.g. clicking
 * "HMI" shows all HMI products and reveals PanelView 800, OptixPanel, …
 * Desktop: a sticky sidebar. Phones/tablets: a "Category" button that opens the same list.
 */
export function CategorySidebar({ tree, selected, hrefFor, allLabel, allCount, label, loading, className }: Props) {
  const [open, setOpen] = useState(false);
  const current = tree.flatMap((n) => [n, ...n.children]).find((n) => n.slug === selected);
  const close = () => setOpen(false);

  const item = (node: CategoryNode, child = false) => {
    const active = node.slug === selected;
    const expanded = node.children.length > 0 && (active || node.children.some((c) => c.slug === selected));
    return (
      <li key={node.id}>
        <Link
          to={hrefFor(node.slug)}
          onClick={close}
          aria-current={active ? "page" : undefined}
          aria-expanded={node.children.length > 0 ? expanded : undefined}
          data-has-children={node.children.length > 0 ? "" : undefined}
          className={cn(
            ITEM,
            child && "py-1.5 text-[13px]",
            active ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <span className="min-w-0 flex-1 break-words">{node.name}</span>
          <Count n={node.total} active={active} />
          {node.children.length > 0 && (
            <ChevronRight
              aria-hidden
              className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
            />
          )}
        </Link>
        {expanded && (
          <ul className="my-1 ml-4 space-y-0.5 border-l border-border pl-2">{node.children.map((c) => item(c, true))}</ul>
        )}
      </li>
    );
  };

  return (
    <aside className={cn("lg:sticky lg:top-24", className)}>
      {/* Phones/tablets: the list folds away behind a button showing the current choice. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="glass-panel flex w-full items-center gap-2 px-4 py-3 text-left text-sm lg:hidden"
      >
        <LayoutGrid className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">Category:</span>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {current ? (current.parent ? `${current.parent.name} › ${current.name}` : current.name) : allLabel}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      <nav
        aria-label={label}
        className={cn(
          "glass-panel mt-2 p-2 lg:mt-0 lg:block lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto",
          !open && "hidden",
        )}
      >
        <p className="eyebrow mb-1 px-3 pt-2">Categories</p>
        {loading ? (
          <div className="space-y-2 p-2" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : (
          <ul className="space-y-0.5">
            <li>
              <Link
                to={hrefFor("")}
                onClick={close}
                aria-current={!selected ? "page" : undefined}
                className={cn(
                  ITEM,
                  !selected ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <span className="flex-1">{allLabel}</span>
                <Count n={allCount} active={!selected} />
              </Link>
            </li>
            {tree.map((n) => item(n))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
