import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { m } from "framer-motion";
import { ArrowLeft, Send } from "lucide-react";
import { useBrand, useBrandCategories, useBrandProducts } from "@/lib/queries";
import { breadcrumbs, useSeo } from "@/hooks/use-seo";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterChips, type Chip } from "@/components/site/FilterChips";
import { ProductGrid } from "@/components/site/ProductGrid";
import { ErrorState } from "@/components/site/ErrorState";
import { LogoImage } from "@/components/site/LogoTile";
import NotFound from "./NotFound";

export default function BrandDetail() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") ?? "";

  const brand = useBrand(slug);
  const categories = useBrandCategories(brand.data?.id);
  const products = useBrandProducts(brand.data?.id);

  const selectedCat = categories.data?.find((c) => c.category_slug === cat);
  // While loading (or when not found — NotFound sets its own tags) leave the head alone.
  useSeo(
    brand.data
      ? {
          title: selectedCat ? `${brand.data.name} ${selectedCat.category_name}` : `${brand.data.name} Products`,
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

  const chips: Chip[] = useMemo(() => {
    const list = categories.data ?? [];
    const total = list.reduce((n, c) => n + c.product_count, 0);
    return [
      { value: "", label: "All", count: total },
      ...list.map((c) => ({ value: c.category_slug, label: c.category_name, count: c.product_count })),
    ];
  }, [categories.data]);

  const visible = useMemo(
    () => (products.data ?? []).filter((p) => !cat || p.category?.slug === cat),
    [products.data, cat],
  );

  const setCat = (value: string) =>
    setParams(value ? { cat: value } : {}, { preventScrollReset: true });

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

        {chips.length > 2 && (
          <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
            <FilterChips label={`Filter ${name} products by category`} chips={chips} value={cat} onChange={setCat} />
          </m.div>
        )}

        {products.isError ? (
          <ErrorState message="We couldn't load the products." onRetry={() => void products.refetch()} />
        ) : (
          <ProductGrid
            products={visible}
            loading={brand.isPending || products.isPending}
            showBrand={false}
            empty={
              <div className="space-y-4">
                <p>
                  {cat ? "No products in this category yet." : `No ${name} products are listed online yet.`}
                </p>
                <Link to="/contact" className="glow-button inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm">
                  <Send className="h-4 w-4" /> Ask us about {name}
                </Link>
              </div>
            }
          />
        )}
      </div>
    </section>
  );
}
