import { useState, type FormEvent } from "react";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Industry, IndustryClient } from "@/types/database";
import { cn } from "@/lib/utils";
import { INDUSTRY_ICONS, industryIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSeo } from "@/hooks/use-seo";
import { LogoTile } from "@/components/site/LogoTile";
import { nextSortOrder, saveOrder, useAdminIndustries, useRefreshAll } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Field, Section } from "../components/Field";
import { SlugInput } from "../components/SlugInput";
import { ImageField } from "../components/ImageField";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { OrderButtons, move } from "../components/OrderButtons";
import { SLUG_RE, slugify } from "../slug";
import { removeStoredFiles } from "../storage";
import { friendlyError } from "../errors";

function IndustryDialog({ industry, onClose, sortOrder }: { industry: Industry | null; onClose: () => void; sortOrder: number }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState(industry?.name ?? "");
  const [slug, setSlug] = useState(industry?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!industry);
  const [icon, setIcon] = useState(industry?.icon ?? "Factory");
  const [description, setDescription] = useState(industry?.description ?? "");
  const [features, setFeatures] = useState((industry?.features ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter a name.");
    if (!SLUG_RE.test(slug)) return setError("The web address (slug) is invalid.");
    setSaving(true);
    const row = {
      name: name.trim(),
      slug,
      icon,
      description: description.trim() || null,
      features: features.split("\n").map((f) => f.trim()).filter(Boolean),
    };
    const { error } = industry
      ? await supabase.from("industries").update(row).eq("id", industry.id)
      : await supabase.from("industries").insert({ ...row, sort_order: sortOrder });
    setSaving(false);
    if (error) return setError(friendlyError(error));
    toast.success(industry ? "Industry saved" : "Industry added");
    await refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{industry ? `Edit ${industry.name}` : "Add industry"}</DialogTitle>
          </DialogHeader>
          <Field label="Name" htmlFor="i-name" required>
            <Input
              id="i-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Anchor" htmlFor="i-slug" required hint="Used for links like /industries#oil-gas">
            <SlugInput
              id="i-slug"
              prefix="/industries#"
              value={slug}
              onChange={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
            />
          </Field>
          <Field label="Icon">
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10" role="radiogroup" aria-label="Icon">
              {Object.entries(INDUSTRY_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={icon === key}
                  title={key}
                  onClick={() => setIcon(key)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-md border transition-colors",
                    icon === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Description" htmlFor="i-desc">
            <Textarea id="i-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Key points" htmlFor="i-feat" hint="One per line — shown as a checklist.">
            <Textarea id="i-feat" rows={4} value={features} onChange={(e) => setFeatures(e.target.value)} placeholder={"Hazardous area rated\nRemote monitoring ready"} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} {industry ? "Save" : "Add industry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientDialog({ industry, client, onClose, sortOrder }: { industry: Industry; client: IndustryClient | null; onClose: () => void; sortOrder: number }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState(client?.name ?? "");
  const [logo, setLogo] = useState<string | null>(client?.logo_url ?? null);
  const [website, setWebsite] = useState(client?.website_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter a name.");
    let url = website.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    setSaving(true);
    const row = { name: name.trim(), logo_url: logo, website_url: url || null };
    const { error } = client
      ? await supabase.from("industry_clients").update(row).eq("id", client.id)
      : await supabase.from("industry_clients").insert({ ...row, industry_id: industry.id, sort_order: sortOrder });
    setSaving(false);
    if (error) return setError(friendlyError(error));
    if (client?.logo_url && client.logo_url !== logo) void removeStoredFiles([client.logo_url]);
    toast.success(client ? "Client saved" : "Client added");
    await refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{client ? `Edit ${client.name}` : `Add client to ${industry.name}`}</DialogTitle>
          </DialogHeader>
          <Field label="Company name" htmlFor="cl-name" required>
            <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Logo">
            <ImageField value={logo} onChange={setLogo} folder={`clients/${slugify(name) || "new"}`} previewClassName="h-24 w-full" />
          </Field>
          <Field label="Website" htmlFor="cl-web" hint="Optional.">
            <Input id="cl-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} {client ? "Save" : "Add client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Industries() {
  useSeo({ title: "Industries — Admin", noindex: true });
  const industries = useAdminIndustries();
  const refresh = useRefreshAll();
  const [editing, setEditing] = useState<Industry | null | undefined>(undefined);
  const [clientEdit, setClientEdit] = useState<{ industry: Industry; client: IndustryClient | null } | null>(null);
  const list = industries.data ?? [];

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Industries"
        description="Sectors you serve, with the clients you've worked with in each."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus /> Add industry
          </Button>
        }
      />

      {industries.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-border bg-popover p-10 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-40" /> No industries yet.
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((ind, i) => {
            const Icon = industryIcon(ind.icon);
            return (
              <Section
                key={ind.id}
                title={
                  <span className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" /> {ind.name}
                  </span>
                }
                description={ind.features.length ? ind.features.join(" · ") : undefined}
                actions={
                  <div className="flex items-center">
                    <OrderButtons index={i} count={list.length} onMove={(a, b) => void run(() => saveOrder("industries", move(list, a, b).map((x) => x.id)))} />
                    <Button variant="ghost" size="icon" aria-label={`Edit ${ind.name}`} onClick={() => setEditing(ind)}>
                      <Pencil />
                    </Button>
                    <ConfirmDelete
                      title={`Delete ${ind.name}?`}
                      description="Its client list will be removed too."
                      onConfirm={() =>
                        run(async () => {
                          const { error } = await supabase.from("industries").delete().eq("id", ind.id);
                          if (error) throw error;
                          void removeStoredFiles(ind.clients.map((c) => c.logo_url));
                          toast.success("Industry deleted");
                        })
                      }
                    />
                  </div>
                }
              >
                {ind.description && <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{ind.description}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {ind.clients.map((c, j) => (
                    <div key={c.id} className="flex items-center gap-1 rounded-lg border border-border bg-background pr-1">
                      <LogoTile name={c.name} logoUrl={c.logo_url} className="h-9 w-16 border-0" />
                      <button type="button" onClick={() => setClientEdit({ industry: ind, client: c })} className="max-w-[10rem] truncate text-xs font-medium hover:text-primary">
                        {c.name}
                      </button>
                      <OrderButtons index={j} count={ind.clients.length} onMove={(a, b) => void run(() => saveOrder("industry_clients", move(ind.clients, a, b).map((x) => x.id)))} />
                      <ConfirmDelete
                        title={`Remove ${c.name}?`}
                        onConfirm={() =>
                          run(async () => {
                            const { error } = await supabase.from("industry_clients").delete().eq("id", c.id);
                            if (error) throw error;
                            void removeStoredFiles([c.logo_url]);
                          })
                        }
                      />
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setClientEdit({ industry: ind, client: null })}>
                    <Plus /> Add client
                  </Button>
                </div>
              </Section>
            );
          })}
        </div>
      )}

      {editing !== undefined && <IndustryDialog key={editing?.id ?? "new"} industry={editing} onClose={() => setEditing(undefined)} sortOrder={nextSortOrder(list)} />}
      {clientEdit && (
        <ClientDialog
          key={clientEdit.client?.id ?? "new"}
          industry={clientEdit.industry}
          client={clientEdit.client}
          onClose={() => setClientEdit(null)}
          sortOrder={nextSortOrder(list.find((x) => x.id === clientEdit.industry.id)?.clients)}
        />
      )}
    </>
  );
}
