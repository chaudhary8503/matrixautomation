import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/use-seo";
import { useAdminBrands, useAdminCategories, useAdminProducts, useRefreshAll, type AdminProductRow } from "../api";
import { PageHeader } from "../components/PageHeader";
import { friendlyError } from "../errors";
import { categoryOptions, withSubcategories } from "../categories";

const FILTERS: Record<string, { label: string; test: (p: AdminProductRow) => boolean }> = {
  hidden: { label: "Hidden (not published)", test: (p) => !p.is_published },
  "no-image": { label: "Without photo", test: (p) => !p.image_url },
  "no-specs": { label: "Without specifications", test: (p) => !Array.isArray(p.specs) || p.specs.length === 0 },
  "no-datasheet": { label: "Without datasheet", test: (p) => !p.datasheet_url },
};

export default function Products() {
  useSeo({ title: "Products — Admin", noindex: true });
  const [params, setParams] = useSearchParams();
  const brand = params.get("brand") ?? "";
  const category = params.get("category") ?? "";
  const filter = params.get("filter") ?? "";
  const [term, setTerm] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const products = useAdminProducts();
  const brands = useAdminBrands();
  const categories = useAdminCategories();
  const refresh = useRefreshAll();

  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  // Filtering by a parent category (e.g. HMI) includes its subcategories.
  const inCategory = useMemo(
    () => new Set(category ? withSubcategories(categories.data ?? [], category) : []),
    [categories.data, category],
  );

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (!brand || p.brand_id === brand) &&
        (!category || inCategory.has(p.category_id)) &&
        (!filter || !FILTERS[filter] || FILTERS[filter].test(p)) &&
        (!t || p.name.toLowerCase().includes(t) || p.slug.includes(t)),
    );
  }, [products.data, brand, category, filter, term, inCategory]);

  const togglePublished = async (p: AdminProductRow, value: boolean) => {
    setBusyId(p.id);
    const { error } = await supabase.from("products").update({ is_published: value }).eq("id", p.id);
    setBusyId(null);
    if (error) return toast.error(friendlyError(error));
    toast.success(value ? `"${p.name}" is now visible on the website` : `"${p.name}" is now hidden`);
    await refresh();
  };

  return (
    <>
      <PageHeader
        title="Products"
        description={products.data ? `${products.data.length} products · ${products.data.filter((p) => p.is_published).length} published` : undefined}
        actions={
          <Button asChild>
            <Link to="/admin/products/new">
              <Plus /> New product
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search products…" className="pl-9" aria-label="Search products" />
        </div>
        <NativeSelect value={brand} onChange={(e) => setParam("brand", e.target.value)} aria-label="Filter by brand">
          <option value="">All brands</option>
          {brands.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={category} onChange={(e) => setParam("category", e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categoryOptions(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={filter} onChange={(e) => setParam("filter", e.target.value)} aria-label="Show">
          <option value="">All products</option>
          {Object.entries(FILTERS).map(([k, f]) => (
            <option key={k} value={k}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-popover">
        {products.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : products.isError ? (
          <p className="p-6 text-sm text-destructive">{friendlyError(products.error)}</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No products match.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Brand</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Category</th>
                <th className="px-4 py-3 text-right font-medium">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/products/${p.id}`} className="flex items-center gap-3 hover:text-primary">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                        {p.image_url ? <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-contain p-0.5" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-all font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground md:hidden">
                          {p.brand?.name} · {p.category?.name}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{p.brand?.name}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{p.category?.name}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Switch
                      checked={p.is_published}
                      disabled={busyId === p.id}
                      onCheckedChange={(v) => void togglePublished(p, v)}
                      aria-label={`Publish ${p.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
