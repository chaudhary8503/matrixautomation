import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, m } from "framer-motion";
import { Loader2, Package, Search } from "lucide-react";
import { useProductSearch } from "@/lib/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 250);
  const { data: hits = [], isFetching } = useProductSearch(debounced);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const close = () => {
    setOpen(false);
    setTerm("");
  };

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (slug: string) => {
    close();
    navigate(`/products/${slug}`);
  };

  const showEmpty = debounced.trim().length >= 2 && !isFetching && hits.length === 0;

  return (
    <div ref={wrapRef} className="relative">
      <m.button
        type="button"
        aria-label="Search products"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-primary"
        whileTap={{ scale: 0.95 }}
      >
        <Search className="h-5 w-5" />
      </m.button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="glass-panel absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] bg-popover p-3 shadow-xl"
          >
            <form
              role="search"
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                if (hits[0]) go(hits[0].slug);
              }}
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search products..."
                aria-label="Search products"
                className="w-full rounded-lg border border-border bg-secondary/50 py-2.5 pl-10 pr-9 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </form>

            {hits.length > 0 && (
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => go(p.slug)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[p.brand?.name, p.category?.name].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showEmpty && <p className="py-4 text-center text-xs text-muted-foreground">No products found.</p>}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
