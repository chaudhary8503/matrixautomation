import { supabase } from "@/lib/supabase";
import { slugify } from "./slug";

export type Bucket = "images" | "documents";

export const LIMITS: Record<Bucket, { bytes: number; label: string; accept: string }> = {
  images: { bytes: 5 * 1024 * 1024, label: "5 MB", accept: "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" },
  documents: { bytes: 20 * 1024 * 1024, label: "20 MB", accept: "application/pdf" },
};

const MAX_DIMENSION = 1600;

/**
 * Shrinks big photos before upload (max 1600px, WebP) so pages stay fast.
 * Logos, SVGs, GIFs and already-small images are uploaded untouched.
 */
export async function prepareImage(file: File, { keepSmall = true } = {}): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  if (keepSmall && scale === 1 && file.size < 600 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

/** Uploads a file to `<bucket>/<folder>/<time>-<name>` and returns its public URL. */
export async function uploadFile(bucket: Bucket, folder: string, original: File): Promise<string> {
  const file = bucket === "images" ? await prepareImage(original) : original;
  if (file.size > LIMITS[bucket].bytes) throw new Error(`The file is too large (max ${LIMITS[bucket].label}).`);
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
  const base = slugify(file.name.replace(/\.[^.]+$/, "")).slice(0, 50) || "file";
  const path = `${folder.replace(/^\/+|\/+$/g, "")}/${Date.now().toString(36)}-${base}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** If `url` points into our own storage, returns {bucket, path}. */
export function parseStorageUrl(url: string | null | undefined): { bucket: Bucket; path: string } | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/(images|documents)\/([^?#]+)/);
  if (!m) return null;
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, "");
  if (!url.startsWith(base)) return null;
  return { bucket: m[1] as Bucket, path: decodeURIComponent(m[2]) };
}

/** Deletes files we stored ourselves. Never throws — a leftover file is harmless. */
export async function removeStoredFiles(urls: (string | null | undefined)[]) {
  const byBucket = new Map<Bucket, string[]>();
  for (const u of urls) {
    const p = parseStorageUrl(u);
    if (p) byBucket.set(p.bucket, [...(byBucket.get(p.bucket) ?? []), p.path]);
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) console.warn("Could not delete old files", paths, error);
  }
}

/** Lists PDFs in a folder of the documents bucket (used for unassigned migrated files). */
export async function listDocuments(folder: string) {
  const { data, error } = await supabase.storage.from("documents").list(folder, { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
    .map((f) => ({
      name: f.name,
      path: `${folder}/${f.name}`,
      url: supabase.storage.from("documents").getPublicUrl(`${folder}/${f.name}`).data.publicUrl,
    }));
}
