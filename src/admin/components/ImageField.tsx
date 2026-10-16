import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIMITS, uploadFile } from "../storage";
import { friendlyError } from "../errors";

/**
 * Single image picker: shows the current image, uploads a replacement straight away,
 * and reports the new public URL. The old file is cleaned up when the form is saved.
 */
export function ImageField({
  value,
  onChange,
  folder,
  label = "Image",
  className,
  previewClassName = "h-32 w-full",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  label?: string;
  className?: string;
  previewClassName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    setBusy(true);
    try {
      onChange(await uploadFile("images", folder, file));
    } catch (e) {
      toast.error("Upload failed", { description: friendlyError(e) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-white transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
          previewClassName,
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : value ? (
          <img src={value} alt={label} className="h-full w-full object-contain p-2" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-1 p-4 text-xs text-muted-foreground hover:text-primary">
            <ImagePlus className="h-6 w-6" />
            Click or drop an image
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload /> {value ? "Replace" : "Upload"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
            <Trash2 /> Remove
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">PNG, JPG, WebP or SVG · max {LIMITS.images.label}</span>
      </div>
      <input ref={input} type="file" accept={LIMITS.images.accept} hidden onChange={(e) => void handle(e.target.files?.[0])} />
    </div>
  );
}
