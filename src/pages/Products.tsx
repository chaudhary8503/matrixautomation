import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { m } from "framer-motion";
import { FileText, Search, X } from "lucide-react";
import { PAGE_SIZE, useCategories, useCategoryCounts, useCategoryDocuments, useProductPage } from "@/lib/queries";
import { buildCategoryTree, categoryFilter } from "@/lib/category-tree";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSeo } from "@/hooks/use-seo";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/site/SectionHeading";
import { CategorySidebar } from "@/components/site/CategorySidebar";
import { Pagination, useScrollOnPageChange } from "@/components/site/Pagination";
import { ProductGrid } from "@/components/site/ProductGrid";
import { DocumentList } from "@/components/site/DocumentList";
import { ErrorState } from "@/components/site/ErrorState";

/** /products?cat=…&q=…&page=… — every filter lives in the address, so it can be shared and survives "back". */
function productsHref(cat: string, q: string, page = 1) {
  const p = new URLSearchParams();
  if (cat) p.set("cat", cat);
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/products?${s}` : "/products";
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  // The search box updates the address (and so the results) 300 ms after typing stops.
  const [term, setTerm] = useState(q);
  const debounced = useDebouncedValue(term.trim(), 300);
  useEffect(() => {
    if (debounced === q) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set("q", debounced);
        else next.delete("q");
        next.delete("page"); // a new search starts at page 1
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [debounced]); // only when the typed search changes (not when the address changes otherwise)

  const categories = useCategories();
  const counts = useCategoryCounts(q);
  const filter = categoryFilter(categories.data, cat);
  const tree = useMemo(
    () =>
      categories.data && counts.data
        ? buildCategoryTree(categories.data, new Map(Object.entries(counts.data)), { keepSlug: cat })
        : [],
    [categories.data, counts.data, cat],
  );
  const allCount = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : undefined;

  // Products wait for the category list only when a category is chosen (to know its subcategories).
  const products = useProductPage({ categoryIds: filter?.ids, q, page }, !cat || !!categories.data);
  const total = products.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // An old link past the last page (products were removed since): go to the last page instead.
  useEffect(() => {
    if (products.data && !products.isPlaceholderData && page > pageCount) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (pageCount > 1) next.set("page", String(pageCount));
          else next.delete("page");
          return next;
        },
        { replace: true },
      );
    }
  }, [products.data, products.isPlaceholderData, page, pageCount, setParams]);

  const docs = useCategoryDocuments(filter?.category.id);
  const resultsRef = useRef<HTMLDivElement>(null);
  useScrollOnPageChange(resultsRef, page);

  useSeo({
    title: `${filter ? `${filter.label} — Products` : "Products"}${page > 1 ? ` — Page ${page}` : ""}`,
    description: filter?.category.description ?? "Browse our complete range of industrial automation and instrumentation products.",
  });

  const failed = products.isError || categories.isError;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="min-h-dvh py-10 sm:py-16">
      <div className="container px-4">
        <SectionHeading
          as="h1"
          align="left"
          title="Product"
          highlight="Catalog"
          description="Browse our complete range of industrial automation products."
        />

        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <CategorySidebar
            label="Product categories"
            tree={tree}
            selected={cat}
            hrefFor={(slug) => productsHref(slug, q)}
            allLabel="All products"
            allCount={allCount}
            loading={categories.isPending || counts.isPending}
            className="mb-6 lg:mb-0"
          />

          <div ref={resultsRef} className="min-w-0 scroll-mt-28">
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 space-y-3"
            >
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search by name, part number or brand..."
                  aria-label="Search products"
                  className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-10 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {term && (
                  <button
                    type="button"
                    onClick={() => setTerm("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {products.data && total > 0 && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} products
                  {filter && (
                    <>
                      {" "}
                      in <span className="font-medium text-foreground">{filter.label}</span>
                    </>
                  )}
                  {q && (
                    <>
                      {" "}
                      for <span className="font-medium text-foreground">“{q}”</span>
                    </>
                  )}
                </p>
              )}
            </m.div>

            {filter?.category.description && (
              <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">{filter.category.description}</p>
            )}

            {docs.data && docs.data.length > 0 && (
              <div className="glass-panel mb-8 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <FileText className="h-4 w-4 text-primary" /> {filter?.label} — Downloads
                </h2>
                <DocumentList docs={docs.data} className="grid gap-2 space-y-0 sm:grid-cols-2 xl:grid-cols-3" />
              </div>
            )}

            {failed ? (
              <ErrorState
                message="We couldn't load the product catalog."
                onRetry={() => {
                  void products.refetch();
                  void categories.refetch();
                }}
              />
            ) : (
              // While the next page loads, the current one stays (dimmed) instead of a skeleton flash.
              <div
                aria-busy={products.isPlaceholderData || undefined}
                className={cn("transition-opacity", products.isPlaceholderData && "opacity-60")}
              >
                <ProductGrid
                  products={products.data?.items ?? []}
                  loading={products.isPending}
                  empty={
                    <div className="space-y-3">
                      <p>No products match your search{filter ? " in this category" : ""}.</p>
                      {(cat || q) && (
                        <Link to="/products" onClick={() => setTerm("")} className="text-sm text-primary hover:underline">
                          Clear filters
                        </Link>
                      )}
                    </div>
                  }
                />
                <Pagination page={page} pageCount={pageCount} hrefFor={(n) => productsHref(cat, q, n)} className="mt-10" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
