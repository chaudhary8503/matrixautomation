import { useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LIMITS, uploadFile } from "../storage";
import { friendlyError } from "../errors";

export function PdfField({ value, onChange, folder }: { value: string | null; onChange: (url: string | null) => void; folder: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf") return toast.error("Please choose a PDF file.");
    setBusy(true);
    try {
      onChange(await uploadFile("documents", folder, file));
    } catch (e) {
      toast.error("Upload failed", { description: friendlyError(e) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const name = value ? decodeURIComponent(value.split("/").pop() ?? "").replace(/^[a-z0-9]+-/, "") : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-primary/40">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{name}</span>
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">No file</span>
      )}
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} {value ? "Replace" : "Upload PDF"}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
          <Trash2 /> Remove
        </Button>
      )}
      <span className="text-[11px] text-muted-foreground">PDF · max {LIMITS.documents.label}</span>
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => void handle(e.target.files?.[0])} />
    </div>
  );
}
