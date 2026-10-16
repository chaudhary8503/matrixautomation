import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS, uploadFile } from "../storage";
import { friendlyError } from "../errors";
import { OrderButtons, move } from "./OrderButtons";

export type GalleryItem = { id?: string; url: string; alt: string };

/** Extra product photos (shown as thumbnails under the main image). */
export function GalleryEditor({
  value,
  onChange,
  folder,
  onMakeMain,
}: {
  value: GalleryItem[];
  onChange: (items: GalleryItem[]) => void;
  folder: string;
  onMakeMain: (index: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setUploading(list.length);
    const added: GalleryItem[] = [];
    for (const f of list) {
      try {
        added.push({ url: await uploadFile("images", folder, f), alt: "" });
      } catch (e) {
        toast.error(`${f.name}: ${friendlyError(e)}`);
      }
      setUploading((n) => n - 1);
    }
    onChange([...value, ...added]);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((img, i) => (
            <li key={img.url} className="flex items-center gap-3 rounded-lg border border-border p-2">
              <img src={img.url} alt="" className="h-14 w-14 shrink-0 rounded border border-border bg-white object-contain p-0.5" />
              <Input value={img.alt} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} placeholder="Short description (optional)" className="h-9 flex-1" aria-label={`Image ${i + 1} description`} />
              <div className="flex shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Use as main image" aria-label="Use as main image" onClick={() => onMakeMain(i)}>
                  <Star />
                </Button>
                <OrderButtons index={i} count={value.length} onMove={(a, b) => onChange(move(value, a, b))} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove image" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading > 0} onClick={() => input.current?.click()}>
          {uploading > 0 ? <Loader2 className="animate-spin" /> : <ImagePlus />} {uploading > 0 ? `Uploading ${uploading}…` : "Add photos"}
        </Button>
        <span className="text-[11px] text-muted-foreground">You can select several at once · max {LIMITS.images.label} each</span>
      </div>
      <input ref={input} type="file" multiple accept={LIMITS.images.accept} hidden onChange={(e) => void add(e.target.files)} />
    </div>
  );
}
