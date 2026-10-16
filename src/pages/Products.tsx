import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { m } from "framer-motion";
import { FileText, Search, X } from "lucide-react";
import { useCatalog, useCategories, useCategoryDocuments, type ProductCardData } from "@/lib/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSeo } from "@/hooks/use-seo";
import { SectionHeading } from "@/components/site/SectionHeading";
import { FilterChips, type Chip } from "@/components/site/FilterChips";
import { ProductGrid } from "@/components/site/ProductGrid";
import { DocumentList } from "@/components/site/DocumentList";
import { ErrorState } from "@/components/site/ErrorState";

export function matchesSearch(p: ProductCardData, term: string) {
  if (!term) return true;
  const hay = `${p.name} ${p.description ?? ""} ${p.brand?.name ?? ""} ${p.category?.name ?? ""}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") ?? "";
  const [term, setTerm] = useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(term.trim(), 250);

  const catalog = useCatalog();
  const categories = useCategories();
  const selected = categories.data?.find((c) => c.slug === cat);
  const docs = useCategoryDocuments(selected?.id);

  useSeo({
    title: selected ? `${selected.name} — Products` : "Products",
    description: selected?.description ?? "Browse our complete range of industrial automation and instrumentation products.",
  });

  // Keep ?q= in the URL so searches can be shared and survive "back".
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set("q", debounced);
        else next.delete("q");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [debounced, setParams]);

  const setCat = (slug: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (slug) next.set("cat", slug);
        else next.delete("cat");
        return next;
      },
      { preventScrollReset: true },
    );

  const products = catalog.data ?? [];

  // Search first, then count per category, so the numbers on the buttons match what you'd see.
  const searched = useMemo(() => products.filter((p) => matchesSearch(p, debounced)), [products, debounced]);

  const chips: Chip[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of searched) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    const withProducts = new Set(products.map((p) => p.category_id));
    return [
      { value: "", label: "All", count: searched.length },
      ...(categories.data ?? [])
        .filter((c) => withProducts.has(c.id) || c.slug === cat)
        .map((c) => ({ value: c.slug, label: c.name, count: counts.get(c.id) ?? 0 })),
    ];
  }, [categories.data, products, searched, cat]);

  const visible = useMemo(
    () => (cat ? searched.filter((p) => p.category?.slug === cat) : searched),
    [searched, cat],
  );

  const loading = catalog.isPending || categories.isPending;
  const failed = catalog.isError || categories.isError;

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

        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 space-y-4"
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
          {!loading && !failed && <FilterChips label="Filter by category" chips={chips} value={cat} onChange={setCat} />}
        </m.div>

        {selected?.description && (
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
        )}

        {docs.data && docs.data.length > 0 && (
          <div className="glass-panel mb-8 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <FileText className="h-4 w-4 text-primary" /> {selected?.name} — Downloads
            </h2>
            <DocumentList docs={docs.data} className="grid gap-2 space-y-0 sm:grid-cols-2 lg:grid-cols-3" />
          </div>
        )}

        {failed ? (
          <ErrorState
            message="We couldn't load the product catalog."
            onRetry={() => {
              void catalog.refetch();
              void categories.refetch();
            }}
          />
        ) : (
          <ProductGrid
            products={visible}
            loading={loading}
            empty={
              <div className="space-y-3">
                <p>No products match your search{cat ? " in this category" : ""}.</p>
                {(cat || term) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerm("");
                      setCat("");
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            }
          />
        )}
      </div>
    </section>
  );
}
