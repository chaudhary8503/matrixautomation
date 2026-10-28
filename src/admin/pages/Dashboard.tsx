import { Link } from "react-router";
import { AlertTriangle, ArrowRight, Building2, FolderTree, Inbox, Package, Tags } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/use-seo";
import { useAdminBrands, useAdminCategories, useAdminIndustries, useAdminProducts, useInquiries, useInquiryCounts } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Section } from "../components/Field";
import { formatDate } from "../format";

export default function Dashboard() {
  useSeo({ title: "Admin", noindex: true });
  const products = useAdminProducts();
  const brands = useAdminBrands();
  const categories = useAdminCategories();
  const industries = useAdminIndustries();
  const counts = useInquiryCounts();
  const recent = useInquiries("new");

  const p = products.data ?? [];
  const tiles = [
    { label: "New inquiries", value: counts.data?.new, icon: Inbox, to: "/admin/inquiries", highlight: (counts.data?.new ?? 0) > 0 },
    { label: "Products", value: products.data ? `${p.filter((x) => x.is_published).length} / ${p.length}` : undefined, sub: "published / total", icon: Package, to: "/admin/products" },
    { label: "Brands", value: brands.data?.length, icon: Tags, to: "/admin/brands" },
    { label: "Categories", value: categories.data?.length, icon: FolderTree, to: "/admin/categories" },
    { label: "Industries", value: industries.data?.length, icon: Building2, to: "/admin/industries" },
  ];

  // Things worth fixing in the catalogue
  const usedCats = new Set(p.map((x) => x.category_id));
  const usedBrands = new Set(p.map((x) => x.brand_id));
  const issues: { text: string; to: string }[] = [];
  const noImage = p.filter((x) => !x.image_url);
  if (noImage.length) issues.push({ text: `${noImage.length} product(s) have no photo`, to: "/admin/products?filter=no-image" });
  const noSpecs = p.filter((x) => !Array.isArray(x.specs) || x.specs.length === 0);
  if (noSpecs.length) issues.push({ text: `${noSpecs.length} product(s) have no specifications`, to: "/admin/products?filter=no-specs" });
  const drafts = p.filter((x) => !x.is_published);
  if (drafts.length) issues.push({ text: `${drafts.length} product(s) are hidden (not published)`, to: "/admin/products?filter=hidden" });
  const noLogo = (brands.data ?? []).filter((b) => !b.logo_url);
  if (noLogo.length) issues.push({ text: `Brands without a logo: ${noLogo.map((b) => b.name).join(", ")}`, to: "/admin/brands" });
  if (products.data && categories.data) {
    // A parent counts as used when any of its subcategories has products (it shows on the website).
    const used = (id: string) => usedCats.has(id) || categories.data.some((c) => c.parent_id === id && usedCats.has(c.id));
    const emptyCats = categories.data.filter((c) => !used(c.id));
    if (emptyCats.length) issues.push({ text: `${emptyCats.length} categor${emptyCats.length === 1 ? "y has" : "ies have"} no products (hidden on the website): ${emptyCats.map((c) => c.name).join(", ")}`, to: "/admin/categories" });
  }
  if (products.data && brands.data) {
    const emptyBrands = brands.data.filter((b) => !usedBrands.has(b.id));
    if (emptyBrands.length) issues.push({ text: `${emptyBrands.length} brand(s) have no products yet`, to: "/admin/brands" });
  }
  const dupNames = new Map<string, number>();
  for (const x of p) dupNames.set(x.name.trim().toLowerCase(), (dupNames.get(x.name.trim().toLowerCase()) ?? 0) + 1);
  const dups = [...dupNames].filter(([, n]) => n > 1);
  if (dups.length) issues.push({ text: `Possible duplicate products: ${dups.map(([n]) => n).join(", ")}`, to: "/admin/products" });

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of your website content and enquiries." />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.to}
            className={`rounded-xl border bg-popover p-4 shadow-sm transition-colors hover:border-primary/40 ${t.highlight ? "border-primary/50" : "border-border"}`}
          >
            <t.icon className={`mb-2 h-5 w-5 ${t.highlight ? "text-primary" : "text-muted-foreground"}`} />
            <div className="text-2xl font-bold">{t.value ?? <Skeleton className="h-8 w-12" />}</div>
            <p className="text-xs text-muted-foreground">{t.label}</p>
            {t.sub && <p className="text-[10px] text-muted-foreground/70">{t.sub}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="New inquiries"
          actions={
            <Link to="/admin/inquiries" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              All inquiries <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {recent.isPending ? (
            <Skeleton className="h-24" />
          ) : recent.data && recent.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {recent.data.slice(0, 6).map((q) => (
                <li key={q.id}>
                  <Link to={`/admin/inquiries?open=${q.id}`} className="block py-2.5 hover:text-primary">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{q.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(q.created_at)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{q.product_name ? `Quote: ${q.product_name}` : q.message}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No new inquiries. 🎉</p>
          )}
        </Section>

        <Section title="Content checks" description="Things that would make the website look more complete.">
          {products.isPending || brands.isPending || categories.isPending ? (
            <Skeleton className="h-24" />
          ) : issues.length ? (
            <ul className="space-y-2">
              {issues.map((i) => (
                <li key={i.text}>
                  <Link to={i.to} className="flex items-start gap-2 text-sm hover:text-primary">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{i.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Everything looks good.</p>
          )}
        </Section>
      </div>
    </>
  );
}
