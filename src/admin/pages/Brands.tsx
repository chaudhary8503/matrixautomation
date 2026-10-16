import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Loader2, Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeo } from "@/hooks/use-seo";
import { LogoTile } from "@/components/site/LogoTile";
import { nextSortOrder, saveOrder, useAdminBrands, useAdminProducts, useRefreshAll } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Field } from "../components/Field";
import { SlugInput } from "../components/SlugInput";
import { ImageField } from "../components/ImageField";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { OrderButtons, move } from "../components/OrderButtons";
import { SLUG_RE, slugify } from "../slug";
import { removeStoredFiles } from "../storage";
import { friendlyError } from "../errors";

function BrandDialog({ brand, open, onOpenChange, sortOrder }: { brand: Brand | null; open: boolean; onOpenChange: (o: boolean) => void; sortOrder: number }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!brand);
  const [logo, setLogo] = useState<string | null>(brand?.logo_url ?? null);
  const [description, setDescription] = useState(brand?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter a name.");
    if (!SLUG_RE.test(slug)) return setError("The web address (slug) is invalid.");
    setSaving(true);
    const row = { name: name.trim(), slug, logo_url: logo, description: description.trim() || null };
    const { error } = brand
      ? await supabase.from("brands").update(row).eq("id", brand.id)
      : await supabase.from("brands").insert({ ...row, sort_order: sortOrder });
    setSaving(false);
    if (error) return setError(friendlyError(error));
    if (brand?.logo_url && brand.logo_url !== logo) void removeStoredFiles([brand.logo_url]);
    toast.success(brand ? "Brand saved" : "Brand added");
    await refresh();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{brand ? `Edit ${brand.name}` : "Add brand"}</DialogTitle>
          </DialogHeader>
          <Field label="Name" htmlFor="b-name" required>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Web address" htmlFor="b-slug" required>
            <SlugInput
              id="b-slug"
              prefix="/brands/"
              value={slug}
              onChange={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
            />
          </Field>
          <Field label="Logo" hint="Transparent PNG or SVG looks best.">
            <ImageField value={logo} onChange={setLogo} folder={`brands/${slug || "new"}`} label="Logo" previewClassName="h-28 w-full" />
          </Field>
          <Field label="Description" htmlFor="b-desc" hint="Optional. Shown under the title on the brand page.">
            <Textarea id="b-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} {brand ? "Save" : "Add brand"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Brands() {
  useSeo({ title: "Brands — Admin", noindex: true });
  const brands = useAdminBrands();
  const products = useAdminProducts();
  const refresh = useRefreshAll();
  const [editing, setEditing] = useState<Brand | null | undefined>(undefined); // undefined = closed, null = new

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products.data ?? []) m.set(p.brand_id, (m.get(p.brand_id) ?? 0) + 1);
    return m;
  }, [products.data]);

  const list = brands.data ?? [];

  const reorder = async (from: number, to: number) => {
    try {
      await saveOrder("brands", move(list, from, to).map((b) => b.id));
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Brands"
        description="The order here is used on the home page (brands with logos are shown first)."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> Add brand
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border bg-popover">
        {brands.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Tags className="mx-auto mb-2 h-8 w-8 opacity-40" /> No brands yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((b, i) => {
              const n = counts.get(b.id) ?? 0;
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <LogoTile name={b.name} logoUrl={b.logo_url} className="h-12 w-20" />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setEditing(b)} className="block truncate text-left font-medium hover:text-primary">
                      {b.name}
                    </button>
                    <Link to={`/admin/products?brand=${b.id}`} className="text-xs text-muted-foreground hover:text-primary">
                      {n} product{n === 1 ? "" : "s"}
                    </Link>
                  </div>
                  <OrderButtons index={i} count={list.length} onMove={(a, c) => void reorder(a, c)} />
                  <Button variant="ghost" size="icon" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}>
                    <Pencil />
                  </Button>
                  <ConfirmDelete
                    title={`Delete ${b.name}?`}
                    description={n > 0 ? `${b.name} still has ${n} product(s). Move them to another brand or delete them first.` : undefined}
                    onConfirm={async () => {
                      const { error } = await supabase.from("brands").delete().eq("id", b.id);
                      if (error) return toast.error(friendlyError(error));
                      void removeStoredFiles([b.logo_url]);
                      toast.success("Brand deleted");
                      await refresh();
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing !== undefined && (
        <BrandDialog
          key={editing?.id ?? "new"}
          brand={editing}
          open
          onOpenChange={(o) => !o && setEditing(undefined)}
          sortOrder={nextSortOrder(list)}
        />
      )}
    </>
  );
}
