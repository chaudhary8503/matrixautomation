import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, FolderTree, Loader2, Paperclip, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Category, CategoryDocument } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeo } from "@/hooks/use-seo";
import { nextSortOrder, saveOrder, useAdminCategories, useAdminProducts, useRefreshAll } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Field } from "../components/Field";
import { SlugInput } from "../components/SlugInput";
import { ImageField } from "../components/ImageField";
import { PdfField } from "../components/PdfField";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { OrderButtons, move } from "../components/OrderButtons";
import { SLUG_RE, slugify } from "../slug";
import { listDocuments, removeStoredFiles } from "../storage";
import { friendlyError } from "../errors";

export const DOC_TYPES = ["Manual", "Data Sheet", "Approval / Certification", "Application Note", "Brochure", "Other"] as const;

type CategoryWithDocs = Category & { documents: CategoryDocument[] };

function CategoryDialog({ category, onClose, sortOrder }: { category: Category | null; onClose: () => void; sortOrder: number }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [image, setImage] = useState<string | null>(category?.image_url ?? null);
  const [description, setDescription] = useState(category?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter a name.");
    if (!SLUG_RE.test(slug)) return setError("The web address (slug) is invalid.");
    setSaving(true);
    const row = { name: name.trim(), slug, image_url: image, description: description.trim() || null };
    const { error } = category
      ? await supabase.from("categories").update(row).eq("id", category.id)
      : await supabase.from("categories").insert({ ...row, sort_order: sortOrder });
    setSaving(false);
    if (error) return setError(friendlyError(error));
    if (category?.image_url && category.image_url !== image) void removeStoredFiles([category.image_url]);
    toast.success(category ? "Category saved" : "Category added");
    await refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{category ? `Edit ${category.name}` : "Add category"}</DialogTitle>
          </DialogHeader>
          <Field label="Name" htmlFor="c-name" required>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Web address" htmlFor="c-slug" required>
            <SlugInput
              id="c-slug"
              prefix="/products?cat="
              value={slug}
              onChange={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
            />
          </Field>
          <Field label="Background image" hint="Shown faintly behind the category tile on the home page.">
            <ImageField value={image} onChange={setImage} folder={`categories/${slug || "new"}`} previewClassName="h-28 w-full" />
          </Field>
          <Field label="Description" htmlFor="c-desc" hint="Optional. Shown above the products when this category is selected.">
            <Textarea id="c-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} {category ? "Save" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsDialog({ category, allDocs, onClose }: { category: CategoryWithDocs; allDocs: CategoryDocument[]; onClose: () => void }) {
  const refresh = useRefreshAll();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<string>("Data Sheet");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // PDFs from the old site that were not linked to anything during migration.
  const unassigned = useQuery({
    queryKey: ["admin", "unassigned_pdfs"],
    queryFn: () => listDocuments("unassigned"),
  });
  const usedUrls = new Set(allDocs.map((d) => d.file_url));
  const available = (unassigned.data ?? []).filter((f) => !usedUrls.has(f.url));

  const docs = category.documents;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !fileUrl) return toast.error("Give the document a title and attach a PDF.");
    setSaving(true);
    const { error } = await supabase.from("category_documents").insert({
      category_id: category.id,
      title: title.trim(),
      doc_type: docType,
      file_url: fileUrl,
      sort_order: nextSortOrder(docs),
    });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Document added");
    setTitle("");
    setFileUrl(null);
    await refresh();
  };

  const reorder = async (from: number, to: number) => {
    try {
      await saveOrder("category_documents", move(docs, from, to).map((d) => d.id));
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{category.name} — documents</DialogTitle>
          <DialogDescription>Manuals, data sheets and certificates shown on the products page when this category is selected, and on each of its products.</DialogDescription>
        </DialogHeader>

        {docs.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {docs.map((d, i) => (
              <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:text-primary">
                  <span className="block truncate text-sm font-medium">{d.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{d.doc_type}</span>
                </a>
                <OrderButtons index={i} count={docs.length} onMove={(a, b) => void reorder(a, b)} />
                <ConfirmDelete
                  title={`Remove “${d.title}”?`}
                  description="The PDF will be removed from the website."
                  onConfirm={async () => {
                    const { error } = await supabase.from("category_documents").delete().eq("id", d.id);
                    if (error) return toast.error(friendlyError(error));
                    // Keep migrated "unassigned" files so they can be re-attached; delete others.
                    if (!d.file_url.includes("/documents/unassigned/")) void removeStoredFiles([d.file_url]);
                    toast.success("Document removed");
                    await refresh();
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No documents yet.</p>
        )}

        <form onSubmit={add} className="space-y-3 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-semibold">Add a document</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. ECT Installation Manual" aria-label="Document title" />
            <NativeSelect value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Document type">
              {DOC_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </NativeSelect>
          </div>
          <PdfField value={fileUrl} onChange={setFileUrl} folder={`categories/${category.slug}`} />
          {available.length > 0 && !fileUrl && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Or use a PDF from the old website that isn't attached to anything yet:</p>
              <ul className="flex flex-wrap gap-2">
                {available.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => {
                        setFileUrl(f.url);
                        if (!title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs hover:border-primary/50"
                    >
                      <Paperclip className="h-3 w-3" /> {f.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button type="submit" size="sm" disabled={saving || !fileUrl || !title.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />} Add document
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Categories() {
  useSeo({ title: "Categories — Admin", noindex: true });
  const categories = useAdminCategories();
  const products = useAdminProducts();
  const refresh = useRefreshAll();
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [docsFor, setDocsFor] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products.data ?? []) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products.data]);

  const list = categories.data ?? [];
  const allDocs = list.flatMap((c) => c.documents);
  const docsCategory = list.find((c) => c.id === docsFor);

  const reorder = async (from: number, to: number) => {
    try {
      await saveOrder("categories", move(list, from, to).map((c) => c.id));
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Categories"
        description="Categories without products are hidden on the website automatically. The order here is the order of the filter buttons."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> Add category
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border bg-popover">
        {categories.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <FolderTree className="mx-auto mb-2 h-8 w-8 opacity-40" /> No categories yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((c, i) => {
              const n = counts.get(c.id) ?? 0;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:flex-nowrap">
                  <span className="h-12 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {c.image_url && <img src={c.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setEditing(c)} className="block truncate text-left font-medium hover:text-primary">
                      {c.name}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      <Link to={`/admin/products?category=${c.id}`} className={n ? "hover:text-primary" : "text-amber-600 hover:text-primary"}>
                        {n} product{n === 1 ? "" : "s"}
                        {n === 0 && " · hidden on website"}
                      </Link>
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setDocsFor(c.id)}>
                    <FileText /> {c.documents.length} doc{c.documents.length === 1 ? "" : "s"}
                  </Button>
                  <OrderButtons index={i} count={list.length} onMove={(a, b) => void reorder(a, b)} />
                  <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                    <Pencil />
                  </Button>
                  <ConfirmDelete
                    title={`Delete ${c.name}?`}
                    description={n > 0 ? `${c.name} still has ${n} product(s). Move them to another category or delete them first.` : "Its documents will be removed too."}
                    onConfirm={async () => {
                      const { error } = await supabase.from("categories").delete().eq("id", c.id);
                      if (error) return toast.error(friendlyError(error));
                      void removeStoredFiles([c.image_url, ...c.documents.filter((d) => !d.file_url.includes("/documents/unassigned/")).map((d) => d.file_url)]);
                      toast.success("Category deleted");
                      await refresh();
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing !== undefined && <CategoryDialog key={editing?.id ?? "new"} category={editing} onClose={() => setEditing(undefined)} sortOrder={nextSortOrder(list)} />}
      {docsCategory && <DocumentsDialog category={docsCategory} allDocs={allDocs} onClose={() => setDocsFor(null)} />}
    </>
  );
}
