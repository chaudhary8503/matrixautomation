import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useSiteSettings } from "@/lib/queries";
import type { Stat } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/use-seo";
import { useRefreshAll } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Field, Section } from "../components/Field";
import { OrderButtons, move } from "../components/OrderButtons";
import { friendlyError } from "../errors";

export const SOCIAL_NETWORKS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
] as const;

type Form = {
  company_name: string;
  tagline: string;
  address: string;
  phones: string;
  mobile: string;
  whatsapp: string;
  email: string;
  stats: { label: string; value: string; suffix: string }[];
  social: Record<string, string>;
};

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function PasswordSection() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return toast.error("Use at least 10 characters.");
    if (pw !== pw2) return toast.error("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password changed");
    setPw("");
    setPw2("");
  };
  return (
    <Section title="Your password">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="New password" htmlFor="pw">
          <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Repeat new password" htmlFor="pw2">
          <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" disabled={busy || !pw}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
        </Button>
      </form>
    </Section>
  );
}

export default function Settings() {
  useSeo({ title: "Settings — Admin", noindex: true });
  const { data, isPending, isError, error: loadError } = useSiteSettings();
  const refresh = useRefreshAll();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || form) return;
    setForm({
      company_name: data.company_name,
      tagline: data.tagline ?? "",
      address: data.address_lines.join("\n"),
      phones: data.phones.join("\n"),
      mobile: data.mobile ?? "",
      whatsapp: data.whatsapp ?? "",
      email: data.email ?? "",
      stats: data.stats.map((s) => ({ label: s.label, value: String(s.value), suffix: s.suffix ?? "" })),
      social: { ...data.social },
    });
  }, [data, form]);

  if (isError) return <p className="text-sm text-destructive">Could not load settings: {friendlyError(loadError)}</p>;
  if (isPending || !form) return <Skeleton className="h-96" />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setStat = (i: number, patch: Partial<Form["stats"][number]>) => set("stats", form.stats.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const whatsapp = form.whatsapp.replace(/\D/g, "");
    if (whatsapp && !/^[0-9]{8,15}$/.test(whatsapp)) return setError("WhatsApp number: digits only with country code, e.g. 923008256712.");
    const stats: Stat[] = [];
    for (const s of form.stats) {
      if (!s.label.trim() && !s.value.trim()) continue;
      const value = Number(s.value.replace(/,/g, ""));
      if (!s.label.trim() || !Number.isFinite(value)) return setError(`Counter “${s.label || s.value}”: needs a label and a number.`);
      stats.push({ label: s.label.trim(), value, ...(s.suffix.trim() ? { suffix: s.suffix.trim() } : {}) });
    }
    const social = Object.fromEntries(
      Object.entries(form.social)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, /^https?:\/\//i.test(v) ? v : `https://${v}`]),
    );

    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .update({
        company_name: form.company_name.trim() || "Matrix Automation & Control",
        tagline: form.tagline.trim() || null,
        address_lines: lines(form.address),
        phones: lines(form.phones),
        mobile: form.mobile.trim() || null,
        whatsapp: whatsapp || null,
        email: form.email.trim() || null,
        stats,
        social,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) return setError(friendlyError(error));
    toast.success("Settings saved — the website is updated");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <PageHeader
          title="Settings"
          description="Contact details and numbers shown across the website."
          actions={
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
            </Button>
          }
        />
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Section title="Company">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="s-name">
              <Input id="s-name" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
            </Field>
            <Field label="Tagline" htmlFor="s-tag">
              <Input id="s-tag" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Contact details" description="Shown in the footer and on the Contact page. Inquiry alerts will go to the email address.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" htmlFor="s-addr" hint="One line per row.">
              <Textarea id="s-addr" rows={4} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Telephone numbers" htmlFor="s-phones" hint="One per line, e.g. +92-21-35161020">
              <Textarea id="s-phones" rows={4} value={form.phones} onChange={(e) => set("phones", e.target.value)} />
            </Field>
            <Field label="Mobile (as shown)" htmlFor="s-mobile">
              <Input id="s-mobile" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+92-300-8256712" />
            </Field>
            <Field label="WhatsApp number" htmlFor="s-wa" hint="Digits with country code, no + or spaces — e.g. 923008256712. Leave empty to hide the WhatsApp button.">
              <Input id="s-wa" inputMode="numeric" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="s-email">
              <Input id="s-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Home page counters" description="The four numbers under the banner (they count up when scrolled into view).">
          <div className="space-y-2">
            {form.stats.map((s, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_4rem_auto] items-center gap-2">
                <Input value={s.label} onChange={(e) => setStat(i, { label: e.target.value })} placeholder="Label" aria-label={`Counter ${i + 1} label`} />
                <Input value={s.value} inputMode="numeric" onChange={(e) => setStat(i, { value: e.target.value })} placeholder="5000" aria-label={`Counter ${i + 1} number`} />
                <Input value={s.suffix} onChange={(e) => setStat(i, { suffix: e.target.value })} placeholder="+" aria-label={`Counter ${i + 1} suffix`} />
                <div className="flex">
                  <OrderButtons index={i} count={form.stats.length} onMove={(a, b) => set("stats", move(form.stats, a, b))} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove counter" onClick={() => set("stats", form.stats.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            {form.stats.length < 4 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("stats", [...form.stats, { label: "", value: "", suffix: "+" }])}>
                <Plus /> Add counter
              </Button>
            )}
          </div>
        </Section>

        <Section title="Social media" description="Optional. Links appear in the footer.">
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_NETWORKS.map((n) => (
              <Field key={n.key} label={n.label} htmlFor={`s-${n.key}`}>
                <Input id={`s-${n.key}`} value={form.social[n.key] ?? ""} onChange={(e) => set("social", { ...form.social, [n.key]: e.target.value })} placeholder={`https://${n.key}.com/…`} />
              </Field>
            ))}
          </div>
        </Section>
      </form>

      <PasswordSection />
    </div>
  );
}
