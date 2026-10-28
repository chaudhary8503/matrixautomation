import { useEffect, useMemo, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { m } from "framer-motion";
import { ArrowLeft, Send } from "lucide-react";
import { PAGE_SIZE, useBrand, useBrandCategories, useCategories, useProductPage } from "@/lib/queries";
import { buildCategoryTree, categoryFilter, flattenTree } from "@/lib/category-tree";
import { breadcrumbs, useSeo } from "@/hooks/use-seo";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CategorySidebar } from "@/components/site/CategorySidebar";
import { Pagination, useScrollOnPageChange } from "@/components/site/Pagination";
import { ProductGrid } from "@/components/site/ProductGrid";
import { ErrorState } from "@/components/site/ErrorState";
import { LogoImage } from "@/components/site/LogoTile";
import NotFound from "./NotFound";

/** /brands/<brand>?cat=…&page=… */
function brandHref(brandSlug: string, cat: string, page = 1) {
  const p = new URLSearchParams();
  if (cat) p.set("cat", cat);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/brands/${brandSlug}${s ? `?${s}` : ""}`;
}

export default function BrandDetail() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const brand = useBrand(slug);
  const brandCategories = useBrandCategories(brand.data?.id);
  const categories = useCategories();
  const filter = categoryFilter(categories.data, cat);

  // Sidebar: only the categories this brand has products in (and their parents), with counts.
  const tree = useMemo(() => {
    if (!categories.data || !brandCategories.data) return [];
    const counts = new Map(brandCategories.data.map((c) => [c.category_id, c.product_count]));
    return buildCategoryTree(categories.data, counts, { keepSlug: cat });
  }, [categories.data, brandCategories.data, cat]);
  const allCount = brandCategories.data?.reduce((n, c) => n + c.product_count, 0);
  const showSidebar = flattenTree(tree).length > 1;

  const products = useProductPage(
    { brandId: brand.data?.id, categoryIds: filter?.ids, page },
    !!brand.data && (!cat || !!categories.data),
  );
  const total = products.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // An old link past the last page: go to the last page instead.
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

  const resultsRef = useRef<HTMLDivElement>(null);
  useScrollOnPageChange(resultsRef, page);
  // While loading (or when not found — NotFound sets its own tags) leave the head alone.
  useSeo(
    brand.data
      ? {
          title: `${filter ? `${brand.data.name} ${filter.label}` : `${brand.data.name} Products`}${page > 1 ? ` — Page ${page}` : ""}`,
          description:
            brand.data.description ??
            `All ${brand.data.name} products available from Matrix Automation & Control in Pakistan.`,
          image: brand.data.logo_url,
          path: `/brands/${brand.data.slug}`,
          jsonLd: breadcrumbs([
            ["Home", "/"],
            ["Brands", "/brands"],
            [brand.data.name, `/brands/${brand.data.slug}`],
          ]),
        }
      : null,
  );

  if (brand.isError)
    return (
      <section className="py-24">
        <ErrorState message="We couldn't load this brand." onRetry={() => void brand.refetch()} />
      </section>
    );
  if (!brand.isPending && !brand.data) return <NotFound />;

  const b = brand.data;
  const name = b?.name ?? "";

  return (
    <section className="min-h-dvh py-10 sm:py-16">
      <div className="container px-4">
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
          <Link
            to="/brands"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> All Brands
          </Link>
        </m.div>

        {b ? (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            {b.logo_url && (
              <m.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                // Fixed size (the widest a logo could be), so the title beside it never jumps when the logo loads.
                className="relative h-16 w-[11.5rem] max-w-full shrink-0 rounded-lg border border-border bg-white"
              >
                <LogoImage src={b.logo_url} alt={`${name} logo`} eager className="inset-x-3 inset-y-2" />
              </m.div>
            )}
            <div className="min-w-0">
              <h1 className="mb-1 text-2xl font-black sm:text-3xl lg:text-5xl">
                <span className="text-gradient-primary">{name}</span> Products
              </h1>
              <p className="max-w-2xl text-muted-foreground">
                {b.description ?? `All products available from ${name}.`}
              </p>
            </div>
          </m.div>
        ) : (
          <div className="mb-8 flex items-center gap-4">
            <Skeleton className="h-16 w-32" />
            <Skeleton className="h-10 w-72" />
          </div>
        )}

        {/* Sidebar only when there is something to choose between (more than one category). */}
        <div className={cn(showSidebar && "lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8")}>
          {showSidebar && (
            <CategorySidebar
              label={`${name} product categories`}
              tree={tree}
              selected={cat}
              hrefFor={(c) => brandHref(b?.slug ?? slug ?? "", c)}
              allLabel={`All ${name} products`}
              allCount={allCount}
              className="mb-6 lg:mb-0"
            />
          )}

          <div ref={resultsRef} className="min-w-0 scroll-mt-28">
            {products.data && total > PAGE_SIZE && (
              <p className="mb-4 text-xs text-muted-foreground" aria-live="polite">
                Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of{" "}
                {total.toLocaleString()} products
                {filter && (
                  <>
                    {" "}
                    in <span className="font-medium text-foreground">{filter.label}</span>
                  </>
                )}
              </p>
            )}
            {products.isError ? (
              <ErrorState message="We couldn't load the products." onRetry={() => void products.refetch()} />
            ) : (
              <div
                aria-busy={products.isPlaceholderData || undefined}
                className={cn("transition-opacity", products.isPlaceholderData && "opacity-60")}
              >
                <ProductGrid
                  products={products.data?.items ?? []}
                  loading={brand.isPending || products.isPending}
                  showBrand={false}
                  empty={
                    <div className="space-y-4">
                      <p>{cat ? "No products in this category yet." : `No ${name} products are listed online yet.`}</p>
                      <Link to="/contact" className="glow-button inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm">
                        <Send className="h-4 w-4" /> Ask us about {name}
                      </Link>
                    </div>
                  }
                />
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  hrefFor={(n) => brandHref(b?.slug ?? slug ?? "", cat, n)}
                  className="mt-10"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
