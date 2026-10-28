import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ExternalLink, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { SpecRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/use-seo";
import { nextSortOrder, useAdminBrands, useAdminCategories, useAdminProduct, useAdminProducts, useRefreshAll } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Field, Section } from "../components/Field";
import { SlugInput } from "../components/SlugInput";
import { ImageField } from "../components/ImageField";
import { PdfField } from "../components/PdfField";
import { SpecsEditor } from "../components/SpecsEditor";
import { GalleryEditor, type GalleryItem } from "../components/GalleryEditor";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { SLUG_RE, slugify } from "../slug";
import { removeStoredFiles } from "../storage";
import { friendlyError } from "../errors";
import { categoryOptions } from "../categories";

type Form = {
  name: string;
  slug: string;
  brand_id: string;
  category_id: string;
  description: string;
  specs: SpecRow[];
  image_url: string | null;
  datasheet_url: string | null;
  is_published: boolean;
  sort_order: number;
  gallery: GalleryItem[];
};

const EMPTY: Form = {
  name: "",
  slug: "",
  brand_id: "",
  category_id: "",
  description: "",
  specs: [],
  image_url: null,
  datasheet_url: null,
  is_published: true,
  sort_order: 0,
  gallery: [],
};

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const refresh = useRefreshAll();

  const existing = useAdminProduct(isNew ? undefined : id);
  const brands = useAdminBrands();
  const categories = useAdminCategories();
  const all = useAdminProducts();

  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSeo({ title: isNew ? "New product — Admin" : `${form.name || "Product"} — Admin`, noindex: true });

  // Load the product into the form once.
  useEffect(() => {
    if (isNew || !existing.data) return;
    const p = existing.data;
    const f: Form = {
      name: p.name,
      slug: p.slug,
      brand_id: p.brand_id,
      category_id: p.category_id,
      description: p.description ?? "",
      specs: p.specs,
      image_url: p.image_url,
      datasheet_url: p.datasheet_url,
      is_published: p.is_published,
      sort_order: p.sort_order,
      gallery: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt ?? "" })),
    };
    setForm(f);
    setInitial(f);
    setSlugTouched(true);
  }, [isNew, existing.data]);

  // New product: preselect from ?brand / ?category if given, else nothing.
  useEffect(() => {
    if (!isNew || !all.data) return;
    setForm((f) => ({ ...f, sort_order: nextSortOrder(all.data) }));
  }, [isNew, all.data]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const brandSlug = brands.data?.find((b) => b.id === form.brand_id)?.slug ?? "unsorted";
  const folder = `products/${brandSlug}`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    const slug = form.slug.trim();
    if (!name) return setError("Please enter a product name.");
    if (!SLUG_RE.test(slug)) return setError("The web address (slug) is invalid.");
    if (!form.brand_id || !form.category_id) return setError("Please choose a brand and a category.");

    const specs = form.specs
      .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
      .filter((s) => s.label && s.value);

    const row = {
      name,
      slug,
      brand_id: form.brand_id,
      category_id: form.category_id,
      description: form.description.trim() || null,
      specs,
      image_url: form.image_url,
      datasheet_url: form.datasheet_url,
      is_published: form.is_published,
      sort_order: form.sort_order,
    };

    setSaving(true);
    try {
      let productId = id!;
      if (isNew) {
        const { data, error } = await supabase.from("products").insert(row).select("id").single();
        if (error) throw error;
        productId = data.id;
      } else {
        const { error } = await supabase.from("products").update(row).eq("id", productId);
        if (error) throw error;
      }

      // Gallery: delete removed, then upsert the rest in order.
      const keepIds = new Set(form.gallery.filter((g) => g.id).map((g) => g.id!));
      const removed = initial.gallery.filter((g) => g.id && !keepIds.has(g.id));
      if (removed.length) {
        const { error } = await supabase.from("product_images").delete().in("id", removed.map((g) => g.id!));
        if (error) throw error;
      }
      for (const [i, g] of form.gallery.entries()) {
        const values = { url: g.url, alt: g.alt.trim() || null, sort_order: i * 10 };
        const { error } = g.id
          ? await supabase.from("product_images").update(values).eq("id", g.id)
          : await supabase.from("product_images").insert({ ...values, product_id: productId });
        if (error) throw error;
      }

      // Clean up files that are no longer used.
      const stillUsed = new Set([form.image_url, form.datasheet_url, ...form.gallery.map((g) => g.url)]);
      const old = [initial.image_url, initial.datasheet_url, ...initial.gallery.map((g) => g.url)].filter((u) => u && !stillUsed.has(u));
      void removeStoredFiles(old);

      toast.success(isNew ? "Product created" : "Product saved");
      setInitial(form);
      await refresh();
      if (isNew) navigate(`/admin/products/${productId}`, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const { error } = await supabase.from("products").delete().eq("id", id!);
    if (error) return toast.error(friendlyError(error));
    void removeStoredFiles([initial.image_url, initial.datasheet_url, ...initial.gallery.map((g) => g.url)]);
    toast.success("Product deleted");
    await refresh();
    navigate("/admin/products", { replace: true });
  };

  if (!isNew && existing.isPending) return <Skeleton className="h-96" />;
  if (!isNew && !existing.data)
    return (
      <PageHeader title="Product not found" back={{ to: "/admin/products", label: "Products" }} description="It may have been deleted." />
    );

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title={isNew ? "New product" : initial.name}
        back={{ to: "/admin/products", label: "Products" }}
        actions={
          <>
            {!isNew && initial.is_published && (
              <Button asChild variant="outline">
                <a href={`/products/${initial.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> View on website
                </a>
              </Button>
            )}
            <Button type="submit" disabled={saving || (!isNew && !dirty)}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} {isNew ? "Create product" : "Save changes"}
            </Button>
          </>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Section title="Details">
            <div className="space-y-4">
              <Field label="Product name / part number" htmlFor="name" required hint="Shown as the title, e.g. ECT/4-20mA/4-20mA/12-42DC [DIN]">
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
                  }}
                />
              </Field>
              <Field label="Web address" htmlFor="slug" required hint={!isNew ? "Changing this breaks links people may have saved." : undefined}>
                <SlugInput
                  id="slug"
                  prefix="/products/"
                  value={form.slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    set("slug", v);
                  }}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand" htmlFor="brand" required>
                  <NativeSelect id="brand" value={form.brand_id} onChange={(e) => set("brand_id", e.target.value)}>
                    <option value="">Choose a brand…</option>
                    {brands.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Category" htmlFor="category" required>
                  <NativeSelect id="category" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                    <option value="">Choose a category…</option>
                    {categoryOptions(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Description" htmlFor="description" hint="The first line is shown on product cards (e.g. “ECT Signal Isolator and Converter”). Further lines appear as paragraphs.">
                <Textarea id="description" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Specifications" description="Shown as a table on the product page. Empty rows are ignored.">
            <SpecsEditor value={form.specs} onChange={(v) => set("specs", v)} />
          </Section>

          <Section title="More photos" description="Optional. Shown as thumbnails under the main image.">
            <GalleryEditor
              value={form.gallery}
              onChange={(v) => set("gallery", v)}
              folder={folder}
              onMakeMain={(i) =>
                setForm((f) => {
                  const chosen = f.gallery[i];
                  const gallery = f.gallery.filter((_, j) => j !== i);
                  if (f.image_url) gallery.unshift({ url: f.image_url, alt: "" });
                  return { ...f, image_url: chosen.url, gallery };
                })
              }
            />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Visibility">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Published</span>
                <span className="block text-xs text-muted-foreground">{form.is_published ? "Visible on the website" : "Hidden — only admins can see it"}</span>
              </span>
              <Switch checked={form.is_published} onCheckedChange={(v) => set("is_published", v)} aria-label="Published" />
            </label>
            <Field label="Sort order" htmlFor="sort" hint="Lower numbers are shown first." className="mt-4">
              <Input id="sort" type="number" value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value) || 0)} className="w-32" />
            </Field>
          </Section>

          <Section title="Main image">
            <ImageField value={form.image_url} onChange={(v) => set("image_url", v)} folder={folder} label="Main image" previewClassName="h-48 w-full" />
          </Section>

          <Section title="Datasheet">
            <PdfField value={form.datasheet_url} onChange={(v) => set("datasheet_url", v)} folder={`datasheets/${brandSlug}`} />
          </Section>

          {!isNew && (
            <Section title="Danger zone">
              <ConfirmDelete
                title={`Delete “${initial.name}”?`}
                description="The product, its photos and datasheet will be removed. Inquiries about it are kept. This can't be undone — to just hide it, switch off Published instead."
                onConfirm={onDelete}
                trigger={
                  <Button type="button" variant="outline" className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive">
                    <Trash2 /> Delete product
                  </Button>
                }
              />
            </Section>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-end gap-3 border-t border-border bg-popover/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {dirty && <span className="mr-auto text-xs text-amber-600">Unsaved changes</span>}
        <Button asChild variant="ghost">
          <Link to="/admin/products">Cancel</Link>
        </Button>
        <Button type="submit" disabled={saving || (!isNew && !dirty)}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} {isNew ? "Create product" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
