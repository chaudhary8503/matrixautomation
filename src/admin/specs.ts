import type { SpecRow } from "@/types/database";

/**
 * Turns pasted text into specification rows. Understands
 *   "Input Description: 4-20mA"   (one per line, or tab-separated)
 *   "Input<TAB>4-20mA"             (copied from a table / Excel)
 * Lines that aren't "label: value" are returned in `rest`.
 * Same rules the migration used on the old descriptions.
 */
export function parseSpecs(text: string): { specs: SpecRow[]; rest: string[] } {
  const specs: SpecRow[] = [];
  const rest: string[] = [];
  const lines = text.replace(/\r/g, "").split("\n");

  for (const raw of lines) {
    // Two-column table row: "Label<TAB>Value" (no colon)
    const cells = raw.split("\t").map((c) => c.trim()).filter(Boolean);
    if (cells.length === 2 && !cells[0].includes(":")) {
      specs.push({ label: cells[0].replace(/\s+Description$/i, ""), value: cells[1] });
      continue;
    }
    for (const seg of cells.length ? cells : [raw.trim()]) {
      const s = seg.replace(/\s+/g, " ").trim();
      if (!s) continue;
      const m = s.match(/^([A-Za-z0-9][^:]{0,60}?):\s*(.+)$/);
      const last = specs[specs.length - 1];
      if (m && !/^https?$/i.test(m[1])) {
        specs.push({ label: m[1].replace(/\s+Description$/i, "").trim(), value: m[2].trim() });
      } else if (last && /,\s*$/.test(last.value)) {
        last.value = `${last.value.replace(/,\s*$/, ",")} ${s}`;
      } else {
        rest.push(s);
      }
    }
  }
  return { specs, rest };
}
