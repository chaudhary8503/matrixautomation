import { useEffect, useRef, useState, type ReactNode } from "react";
import { m } from "framer-motion";
import { SearchX } from "lucide-react";
import type { ProductCardData } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "./ProductCard";

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
/** Cards rendered at first; more are added as the visitor scrolls near the end. */
const BATCH = 48;

export function ProductGrid({
  products,
  loading,
  showBrand,
  empty,
}: {
  products: ProductCardData[];
  loading?: boolean;
  showBrand?: boolean;
  empty?: ReactNode;
}) {
  // Large catalogues render in batches, so opening or filtering the page stays fast.
  const [limit, setLimit] = useState(BATCH);
  const [shownList, setShownList] = useState(products);
  if (shownList !== products) {
    setShownList(products);
    setLimit(BATCH);
  }
  const more = useRef<HTMLDivElement>(null);
  const hasMore = limit < products.length;
  useEffect(() => {
    const el = more.current;
    if (!hasMore || !el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((n) => n + BATCH), {
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

  if (loading) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading products">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="glass-panel overflow-hidden">
            <Skeleton className="h-44 rounded-none" />
            <div className="space-y-2 p-5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center text-muted-foreground">
        <SearchX className="mx-auto mb-4 h-12 w-12 opacity-30" />
        {empty ?? <p>No products match your search criteria.</p>}
      </m.div>
    );
  }

  return (
    <>
      {/* The grid fades in as one block — no per-card animation. */}
      <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={GRID}>
        {products.slice(0, limit).map((p) => (
          <ProductCard key={p.id} product={p} showBrand={showBrand} />
        ))}
      </m.div>
      {hasMore && <div ref={more} aria-hidden className="h-px" />}
    </>
  );
}
