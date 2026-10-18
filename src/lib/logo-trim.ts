import { queryOptions } from "@tanstack/react-query";
import { SUPABASE_URL } from "./env";

/**
 * Where the actual logo sits inside an image file, as fractions of the image (0–1), plus the
 * aspect ratio (width / height) of that area in real pixels.
 * Many logo files carry a wide white or transparent margin, so a "fit the whole file" tile shows
 * them tiny; showing only this box makes every logo fill its tile the same way.
 */
export type LogoBox = { x: number; y: number; w: number; h: number; aspect: number };

/** React Query key for one logo's box, measured on this page — embedded in prerendered pages. */
export const logoBoxKey = (src: string) => ["logo_box", src] as const;

/**
 * Only images from our own Supabase storage are trimmed: it sends CORS headers, which the browser
 * requires before a page may read an image's pixels. Logos from anywhere else are shown untrimmed.
 */
export const canTrim = (src: string) => src.startsWith(`${SUPABASE_URL}/storage/`);

/**
 * Who measures? Reading pixels needs the image loaded in CORS mode, which puts every logo on the
 * same browser connection as the page's data requests — on a shaky network that made data requests
 * stall. So visitors' browsers never measure: scripts/prerender.mjs measures every logo at build
 * time and publishes the results as /logo-boxes.json (and inside each snapshot). Logos uploaded
 * after the last build are shown untrimmed until the next (nightly) build.
 * `npm run dev` measures live, so changes can be checked locally.
 */
export const measureLogos = !!window.__PRERENDER__ || import.meta.env.DEV;

/** All logo boxes from the last build: { [logo URL]: LogoBox }. */
export const logoBoxesQuery = queryOptions({
  queryKey: ["logo_boxes"],
  staleTime: Infinity,
  retry: 1,
  queryFn: async (): Promise<Record<string, LogoBox>> => {
    const res = await fetch("/logo-boxes.json", { cache: "no-cache" });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) throw new Error("logo-boxes.json unavailable");
    return res.json();
  },
});

const SAMPLE = 320; // analysis resolution (longest side, px) — plenty for finding edges
const ALPHA_MIN = 24; // more transparent than this = background
const WHITE_MIN = 236; // all of R, G, B above this = white background (incl. JPEG noise)
const MARGIN = 0.03; // keep 3% around the logo so anti-aliased edges are never clipped

/** Full image, nothing trimmed: used when the image can't be analysed. */
export const fullBox = (img: HTMLImageElement): LogoBox => ({
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1,
});

/**
 * Finds the logo's bounding box in a loaded image by skipping white and transparent pixels.
 * A row or column only counts if a few pixels in it are "ink", so stray specks don't widen the box.
 * Dark or coloured backgrounds are kept (they're part of that logo's look).
 */
export function findLogoBox(img: HTMLImageElement): LogoBox {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return fullBox(img); // e.g. an SVG without a size
  const scale = Math.min(1, SAMPLE / Math.max(nw, nh));
  const cw = Math.max(1, Math.round(nw * scale));
  const ch = Math.max(1, Math.round(nh * scale));

  let data: Uint8ClampedArray;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fullBox(img);
    ctx.drawImage(img, 0, 0, cw, ch);
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return fullBox(img); // no CORS access to the pixels
  }

  const rows = new Uint16Array(ch);
  const cols = new Uint16Array(cw);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      if (data[i + 3] < ALPHA_MIN) continue;
      if (data[i] > WHITE_MIN && data[i + 1] > WHITE_MIN && data[i + 2] > WHITE_MIN) continue;
      rows[y]++;
      cols[x]++;
    }
  }

  const minRow = Math.max(1, Math.round(cw * 0.004));
  const minCol = Math.max(1, Math.round(ch * 0.004));
  let top = 0;
  while (top < ch && rows[top] < minRow) top++;
  let bottom = ch - 1;
  while (bottom > top && rows[bottom] < minRow) bottom--;
  let left = 0;
  while (left < cw && cols[left] < minCol) left++;
  let right = cw - 1;
  while (right > left && cols[right] < minCol) right--;
  if (top >= ch || left >= cw) return fullBox(img); // nothing but background (e.g. a white logo)

  const mx = (right - left + 1) * MARGIN;
  const my = (bottom - top + 1) * MARGIN;
  const x0 = Math.max(0, left - mx) / cw;
  const y0 = Math.max(0, top - my) / ch;
  const x1 = Math.min(cw, right + 1 + mx) / cw;
  const y1 = Math.min(ch, bottom + 1 + my) / ch;
  const w = x1 - x0;
  const h = y1 - y0;
  return { x: x0, y: y0, w, h, aspect: (w * nw) / (h * nh) };
}
