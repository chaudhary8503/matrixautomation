import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { AnimatePresence, m } from "framer-motion";
import { ArrowLeft, ChevronRight, Download, FileText, Package } from "lucide-react";
import { isUuid, useCategories, useCategoryDocuments, useProduct, useRelatedProducts } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { absoluteUrl, breadcrumbs, useSeo } from "@/hooks/use-seo";
import { Skeleton } from "@/components/ui/skeleton";
import { InquiryForm } from "@/components/site/InquiryForm";
import { LogoTile } from "@/components/site/LogoTile";
import { ProductImage } from "@/components/site/ProductImage";
import { ProductCard, summary } from "@/components/site/ProductCard";
import { DocumentList } from "@/components/site/DocumentList";
import { ErrorState } from "@/components/site/ErrorState";
import NotFound from "./NotFound";

function Gallery({ images, name }: { images: { url: string; alt: string | null }[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) {
    return (
      <div className="mb-6 flex h-48 w-full items-center justify-center rounded-lg bg-secondary/20 sm:h-60">
        <Package className="h-16 w-16 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="relative overflow-hidden rounded-lg border border-border/60 bg-white">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={current.url}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ProductImage
              src={current.url}
              alt={current.alt || name}
              eager
              className="h-64 p-4 sm:h-80"
              iconClassName="h-16 w-16"
            />
          </m.div>
        </AnimatePresence>
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Product images">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Image ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "h-16 w-16 overflow-hidden rounded-md border-2 bg-white p-1 transition-all",
                i === active ? "border-primary" : "border-border/60 opacity-70 hover:opacity-100",
              )}
            >
              <img src={img.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <section className="min-h-dvh py-10 sm:py-16">
      <div className="container px-4">
        <Skeleton className="mb-8 h-4 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="glass-panel space-y-4 p-5 sm:p-8 lg:col-span-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    </section>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const { data: product, isPending, isError, refetch } = useProduct(slug);
  const related = useRelatedProducts(product);
  const docs = useCategoryDocuments(product?.category_id);
  // The category's parent (e.g. HMI for PanelView 800), for the breadcrumb and labels.
  const categories = useCategories();
  const parentCategory =
    product?.category?.parent_id ? (categories.data?.find((c) => c.id === product.category!.parent_id) ?? null) : null;
  const categoryLabel = product?.category
    ? parentCategory
      ? `${parentCategory.name} ${product.category.name}`
      : product.category.name
    : null;

  const blurb = product ? summary(product.description) : null;

  const images = useMemo(() => {
    if (!product) return [];
    const list = [
      ...(product.image_url ? [{ url: product.image_url, alt: product.name }] : []),
      ...product.images.map((i) => ({ url: i.url, alt: i.alt })),
    ];
    return list.filter((img, i) => list.findIndex((x) => x.url === img.url) === i);
  }, [product]);

  // While loading (or when not found — NotFound sets its own tags) leave the head alone.
  const path = product ? `/products/${product.slug}` : "";
  const description = product
    ? [blurb, product.brand && `by ${product.brand.name}`, "Request a quote from Matrix Automation & Control."]
        .filter(Boolean)
        .join(" — ")
    : "";
  useSeo(
    product
      ? {
          title: product.name,
          description,
          image: images[0]?.url ?? product.brand?.logo_url,
          type: "product",
          path,
          jsonLd: [
            {
              "@type": "Product",
              name: product.name,
              description: product.description?.trim() || description,
              ...(images.length > 0 && { image: images.map((i) => absoluteUrl(i.url)) }),
              ...(product.brand && { brand: { "@type": "Brand", name: product.brand.name } }),
              ...(product.category && {
                category: parentCategory ? `${parentCategory.name} > ${product.category.name}` : product.category.name,
              }),
              sku: product.name,
              url: absoluteUrl(path),
            },
            breadcrumbs([
              ["Home", "/"],
              ["Products", "/products"],
              ...(parentCategory ? [[parentCategory.name, `/products?cat=${parentCategory.slug}`] as [string, string]] : []),
              ...(product.category
                ? [[product.category.name, `/products?cat=${product.category.slug}`] as [string, string]]
                : []),
              [product.name, path],
            ]),
          ],
        }
      : null,
  );

  const relatedProducts = related.data ?? [];

  if (isPending) return <DetailSkeleton />;
  if (isError)
    return (
      <section className="py-24">
        <ErrorState message="We couldn't load this product." onRetry={() => void refetch()} />
      </section>
    );
  if (!product) return <NotFound />;
  // Old links used the product's id — send them to the readable address.
  if (slug && isUuid(slug)) return <Navigate to={`/products/${product.slug}`} replace />;

  // Description: first line is shown as the product family; the rest as paragraphs.
  const bodyLines = (product.description ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const paragraphs = blurb ? bodyLines.slice(1) : bodyLines;

  return (
    <section className="min-h-dvh py-10 sm:py-16">
      <div className="container px-4">
        <m.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <Link to="/products" className="flex items-center gap-1 transition-colors hover:text-primary">
            <ArrowLeft className="h-3 w-3" /> Products
          </Link>
          {parentCategory && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link to={`/products?cat=${parentCategory.slug}`} className="transition-colors hover:text-primary">
                {parentCategory.name}
              </Link>
            </>
          )}
          {product.category && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link to={`/products?cat=${product.category.slug}`} className="transition-colors hover:text-primary">
                {product.category.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-3 w-3" />
          <span className="break-all text-foreground">{product.name}</span>
        </m.nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Main column */}
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5 sm:p-8 lg:p-10">
              <Gallery key={product.id} images={images} name={product.name} />

              <div className="mb-2 flex flex-wrap items-center gap-3">
                {categoryLabel && <span className="font-mono text-xs text-primary">{categoryLabel}</span>}
                {product.brand && <span className="font-mono text-xs text-muted-foreground">by {product.brand.name}</span>}
              </div>
              <h1 className="mb-2 mt-2 break-words text-2xl font-black leading-tight sm:text-3xl lg:text-4xl">{product.name}</h1>
              {blurb && <p className="mb-4 text-base font-medium text-foreground/80">{blurb}</p>}
              {paragraphs.map((p, i) => (
                <p key={i} className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </m.div>

            {product.specs.length > 0 && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-panel overflow-hidden"
              >
                <h2 className="border-b border-border/60 px-5 py-4 text-lg font-bold sm:px-8">Specifications</h2>
                <dl className="divide-y divide-border/60">
                  {product.specs.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4 sm:px-8 odd:bg-background/60">
                      <dt className="font-medium text-muted-foreground">{s.label}</dt>
                      <dd className="break-words text-foreground">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </m.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <m.div
              id="quote"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-panel glow-border scroll-mt-28 p-6"
            >
              <h2 className="mb-1 text-lg font-bold">Request a Quote</h2>
              <p className="mb-5 text-xs text-muted-foreground">Need pricing, availability or more details? We'll get back to you.</p>
              <InquiryForm key={product.id} source="product" product={{ id: product.id, name: product.name }} compact />
            </m.div>

            {product.brand && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-panel p-6"
              >
                <h2 className="mb-3 text-sm font-bold">Brand</h2>
                <div className="flex items-center gap-3">
                  <LogoTile name={product.brand.name} logoUrl={product.brand.logo_url} className="h-12 w-20" />
                  <div className="min-w-0 space-y-1 text-sm">
                    <Link to={`/brands/${product.brand.slug}`} className="block text-primary hover:underline">
                      All {product.brand.name} products →
                    </Link>
                    {product.category && (
                      <Link
                        to={`/brands/${product.brand.slug}?cat=${product.category.slug}`}
                        className="block text-xs text-muted-foreground hover:text-primary"
                      >
                        {product.brand.name} {product.category.name} →
                      </Link>
                    )}
                  </div>
                </div>
              </m.div>
            )}

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-panel p-6"
            >
              <h2 className="mb-3 text-sm font-bold">Datasheet</h2>
              {product.datasheet_url ? (
                <m.a
                  href={product.datasheet_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glow-button flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download className="h-4 w-4" /> Download Datasheet (PDF)
                </m.a>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Datasheet not available yet —{" "}
                  <a href="#quote" className="text-primary hover:underline">
                    request it from our team
                  </a>
                  .
                </p>
              )}
            </m.div>

            {docs.data && docs.data.length > 0 && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="glass-panel p-6"
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <FileText className="h-4 w-4 text-primary" /> {product.category?.name} documents
                </h2>
                <DocumentList docs={docs.data} />
              </m.div>
            )}
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-6 text-xl font-bold sm:text-2xl">
              More from <span className="text-gradient-primary">{product.brand?.name}</span>
            </h2>
            <m.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} showBrand={false} />
              ))}
            </m.div>
          </div>
        )}
      </div>
    </section>
  );
}
