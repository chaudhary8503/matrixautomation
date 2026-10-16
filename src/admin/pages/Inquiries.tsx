import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, Building, Download, ExternalLink, Inbox, Mail, MessageCircle, Package, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn, whatsappHref } from "@/lib/utils";
import type { Enums, Inquiry } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/use-seo";
import { useInquiries, useInquiryCounts, useRefreshAll, type InquiryFilter } from "../api";
import { PageHeader } from "../components/PageHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { friendlyError } from "../errors";
import { formatDate, formatDateTime } from "../format";

const TABS: { value: InquiryFilter; label: string }[] = [
  { value: "new", label: "New" },
  { value: "replied", label: "Replied" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const STATUS_BADGE: Record<Enums<"inquiry_status">, "default" | "success" | "muted"> = {
  new: "default",
  replied: "success",
  closed: "muted",
};

const SOURCE_LABEL: Record<Enums<"inquiry_source">, string> = {
  contact: "Contact form",
  product: "Product quote",
  chatbot: "Chatbot",
  other: "Other",
};

/** "0300-1234567" / "+92 300 1234567" → "923001234567" for WhatsApp links. */
function whatsappDigits(phone: string | null) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("03") && d.length === 11) d = "92" + d.slice(1);
  return d.length >= 10 && d.length <= 15 ? d : null;
}

function toCsv(rows: Inquiry[]) {
  const cols: (keyof Inquiry)[] = ["created_at", "status", "source", "name", "company", "email", "phone", "product_name", "message", "admin_notes", "page_url"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
}

function Detail({ inquiry, onBack }: { inquiry: Inquiry; onBack: () => void }) {
  const refresh = useRefreshAll();
  const [notes, setNotes] = useState(inquiry.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setNotes(inquiry.admin_notes ?? ""), [inquiry.id, inquiry.admin_notes]);

  const update = async (patch: Partial<Pick<Inquiry, "status" | "admin_notes">>, okMessage: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("inquiries").update(patch).eq("id", inquiry.id);
      if (error) throw error;
      toast.success(okMessage);
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const wa = whatsappDigits(inquiry.phone);
  const subject = inquiry.product_name ? `Your quote request: ${inquiry.product_name}` : "Your inquiry — Matrix Automation & Control";

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary lg:hidden">
        <ArrowLeft className="h-3 w-3" /> Back to list
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold">{inquiry.name}</h2>
          <p className="text-xs text-muted-foreground">
            {SOURCE_LABEL[inquiry.source]} · {formatDateTime(inquiry.created_at)}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[inquiry.status]} className="capitalize">
          {inquiry.status}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {inquiry.company && (
          <p className="flex items-center gap-2">
            <Building className="h-4 w-4 text-muted-foreground" /> {inquiry.company}
          </p>
        )}
        {inquiry.email && (
          <a href={`mailto:${inquiry.email}?subject=${encodeURIComponent(subject)}`} className="flex items-center gap-2 break-all text-primary hover:underline">
            <Mail className="h-4 w-4 shrink-0" /> {inquiry.email}
          </a>
        )}
        {inquiry.phone && (
          <a href={`tel:${inquiry.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-primary hover:underline">
            <Phone className="h-4 w-4" /> {inquiry.phone}
          </a>
        )}
        {wa && (
          <a href={whatsappHref(wa, `Hello ${inquiry.name}, this is Matrix Automation & Control regarding your inquiry.`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
            <MessageCircle className="h-4 w-4" /> Reply on WhatsApp
          </a>
        )}
      </div>

      {inquiry.product_name && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
          <Package className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{inquiry.product_name}</span>
          {inquiry.product_id && (
            <Link to={`/admin/products/${inquiry.product_id}`} className="shrink-0 text-xs text-primary hover:underline">
              Open product
            </Link>
          )}
        </div>
      )}

      <div className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">
        {inquiry.message || <span className="text-muted-foreground">(no message)</span>}
      </div>
      {inquiry.page_url && (
        <a href={inquiry.page_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary">
          <ExternalLink className="h-3 w-3 shrink-0" /> Sent from {inquiry.page_url.replace(/^https?:\/\/[^/]+/, "") || "/"}
        </a>
      )}

      <div className="space-y-2">
        <label htmlFor="notes" className="text-sm font-medium">
          Internal notes <span className="font-normal text-muted-foreground">(only visible here)</span>
        </label>
        <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Sent quotation #123 on 12 Oct" />
        <Button size="sm" variant="outline" disabled={saving || notes === (inquiry.admin_notes ?? "")} onClick={() => void update({ admin_notes: notes.trim() || null }, "Notes saved")}>
          Save notes
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="mr-1 text-sm text-muted-foreground">Mark as:</span>
        {(["new", "replied", "closed"] as const).map((s) => (
          <Button key={s} size="sm" variant={inquiry.status === s ? "default" : "outline"} disabled={saving || inquiry.status === s} onClick={() => void update({ status: s }, `Marked as ${s}`)} className={cn("capitalize", inquiry.status === s && "disabled:opacity-100")}>
            {s}
          </Button>
        ))}
        <div className="ml-auto">
          <ConfirmDelete
            title="Delete this inquiry?"
            onConfirm={async () => {
              const { error } = await supabase.from("inquiries").delete().eq("id", inquiry.id);
              if (error) return toast.error(friendlyError(error));
              toast.success("Inquiry deleted");
              onBack();
              await refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Inquiries() {
  useSeo({ title: "Inquiries", noindex: true });
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as InquiryFilter) || "new";
  const openId = params.get("open");
  const [term, setTerm] = useState("");

  const counts = useInquiryCounts();
  const list = useInquiries(tab);
  // When opened from a link (dashboard), the inquiry may not be in the current tab.
  const all = useInquiries("all");

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const data = list.data ?? [];
    if (!t) return data;
    return data.filter((q) => [q.name, q.email, q.phone, q.company, q.message, q.product_name].some((v) => v?.toLowerCase().includes(t)));
  }, [list.data, term]);

  const selected = list.data?.find((q) => q.id === openId) ?? all.data?.find((q) => q.id === openId) ?? null;

  const setTab = (v: InquiryFilter) => setParams({ tab: v });
  const open = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("open", id);
      else next.delete("open");
      return next;
    });

  const exportCsv = () => {
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inquiries-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Inquiries"
        description="Messages from the contact form and product quote requests."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-popover p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {counts.data && <span className="ml-1.5 text-xs opacity-75">{counts.data[t.value]}</span>}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, email, product…" className="pl-9" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={cn("overflow-hidden rounded-xl border border-border bg-popover", selected && "hidden lg:block")}>
          {list.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : list.isError ? (
            <p className="p-6 text-sm text-destructive">{friendlyError(list.error)}</p>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {term ? "No inquiries match your search." : `No ${tab === "all" ? "" : tab + " "}inquiries.`}
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {rows.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => open(q.id)}
                    className={cn("block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60", q.id === openId && "bg-primary/5")}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", q.status === "new" ? "font-bold" : "font-medium")}>{q.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(q.created_at)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.product_name ? <span className="text-primary">Quote · {q.product_name}</span> : q.message}
                    </p>
                    {tab === "all" && (
                      <Badge variant={STATUS_BADGE[q.status]} className="mt-1 px-1.5 py-0 text-[10px] capitalize">
                        {q.status}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn("rounded-xl border border-border bg-popover p-5 sm:p-6", !selected && "hidden lg:block")}>
          {selected ? (
            <Detail inquiry={selected} onBack={() => open(null)} />
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">Select an inquiry to read it.</div>
          )}
        </div>
      </div>
    </>
  );
}
