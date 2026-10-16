import { useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import type { SpecRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseSpecs } from "../specs";
import { OrderButtons, move } from "./OrderButtons";

export function SpecsEditor({ value, onChange }: { value: SpecRow[]; onChange: (rows: SpecRow[]) => void }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const preview = parseSpecs(pasted);

  const set = (i: number, patch: Partial<SpecRow>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
            <span>Label</span>
            <span>Value</span>
            <span className="w-[104px]" />
          </div>
          {value.map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:border-0 sm:p-0">
              <Input value={row.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="e.g. Input" aria-label={`Spec ${i + 1} label`} />
              <Input value={row.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="e.g. 4-20mA" aria-label={`Spec ${i + 1} value`} />
              <div className="flex justify-end">
                <OrderButtons index={i} count={value.length} onMove={(a, b) => onChange(move(value, a, b))} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove row" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { label: "", value: "" }])}>
          <Plus /> Add row
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste /> Paste from datasheet
        </Button>
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste specifications</DialogTitle>
            <DialogDescription>
              Paste lines like <code className="rounded bg-muted px-1">Input: 4-20mA</code>, or copy two columns from a table or Excel. Rows are added below the
              existing ones.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Input Description: 4-20mA\nOutput Description: 4-20mA\nPower Description: 12-42DC"} className="font-mono text-xs" />
          {pasted.trim() && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border text-xs">
              {preview.specs.map((s, i) => (
                <div key={i} className="grid grid-cols-[2fr_3fr] gap-2 border-b border-border px-3 py-1.5 last:border-0">
                  <span className="font-medium">{s.label}</span>
                  <span>{s.value}</span>
                </div>
              ))}
              {preview.rest.length > 0 && <p className="px-3 py-1.5 text-muted-foreground">Ignored (not "label: value"): {preview.rest.join(" · ")}</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!preview.specs.length}
              onClick={() => {
                onChange([...value.filter((r) => r.label.trim() || r.value.trim()), ...preview.specs]);
                setPasted("");
                setPasteOpen(false);
              }}
            >
              Add {preview.specs.length} row{preview.specs.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
