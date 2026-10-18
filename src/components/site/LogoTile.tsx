import { useState, type CSSProperties } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { canTrim, findLogoBox, logoBoxKey, logoBoxesQuery, measureLogos, type LogoBox } from "@/lib/logo-trim";
import { cn } from "@/lib/utils";

/** Height share (0–1) for a logo of this aspect ratio: 1 for square-ish logos, less for wider
 *  blocky ones (ABB ≈ 0.8, Pilz ≈ 0.73), so area stays roughly constant. Very wide logos are
 *  limited by the tile's width anyway. */
const balance = (aspect: number) => Math.min(1, Math.sqrt(1.6 / aspect));

/**
 * A logo scaled to fill the area given by `className` (an absolutely positioned box), with the
 * empty margin inside the image file cut away, so every logo looks the same size whatever its file
 * looks like. The margin is measured once per logo at build time (src/lib/logo-trim.ts);
 * prerendered pages already carry the measurement, so logos never jump.
 * The original file is shown (just cropped), so SVG logos stay sharp.
 */
export function LogoImage({
  src,
  alt,
  className,
  eager,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  onError?: () => void;
}) {
  const client = useQueryClient();
  const trim = canTrim(src);
  // Box measured on this page (prerender / dev — and in a snapshot's embedded data) …
  const { data: measured } = useQuery<LogoBox>({ queryKey: logoBoxKey(src), queryFn: skipToken, staleTime: Infinity });
  // … otherwise the one published by the last build.
  const published = useQuery({ ...logoBoxesQuery, enabled: trim && !measureLogos && !measured });
  const box = measured ?? published.data?.[src];
  // Wait (invisibly) for the box only while it can still arrive; otherwise show the logo untrimmed.
  const pending = trim && !box && (measureLogos || published.isLoading);

  const measure = (img: HTMLImageElement | null) => {
    if (!img || !trim || !measureLogos || !img.complete || !img.naturalWidth) return;
    if (client.getQueryData(logoBoxKey(src))) return;
    client.setQueryData(logoBoxKey(src), findLogoBox(img));
  };

  // Logo area: as large as fits in the container while keeping the logo's own proportions — except
  // that compact, blocky logos are toned down a little, so they don't look heavier than long thin
  // wordmarks (which are limited by the width). Roughly equal visual area for every logo.
  // (`cq` units = size of the container, see `containerType` below.)
  const frame: CSSProperties | undefined = box && {
    width: `min(100cqw, 100cqh * ${box.aspect * balance(box.aspect)})`,
    height: `min(100cqh * ${balance(box.aspect)}, 100cqw / ${box.aspect})`,
  };
  // The whole image, scaled and shifted so exactly the logo area shows through the frame.
  const crop: CSSProperties | undefined = box && {
    position: "absolute",
    maxWidth: "none",
    width: `${100 / box.w}%`,
    height: `${100 / box.h}%`,
    left: `${(-box.x / box.w) * 100}%`,
    top: `${(-box.y / box.h) * 100}%`,
  };

  return (
    <div className={cn("absolute", className)} style={{ containerType: "size" }}>
      <div className="absolute inset-0 m-auto overflow-hidden" style={frame}>
        <img
          ref={measure}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          // CORS mode only where pixels are read (prerender / dev) — see measureLogos.
          crossOrigin={trim && measureLogos ? "anonymous" : undefined}
          onLoad={(e) => measure(e.currentTarget)}
          onError={onError}
          data-logo=""
          // Until its box is known, the logo stays invisible (it would otherwise jump when cropped).
          data-logo-pending={pending ? "" : undefined}
          className={cn(!crop && "h-full w-full object-contain", pending && "opacity-0")}
          style={crop}
        />
      </div>
    </div>
  );
}

/** Brand/client logo in a white tile; falls back to the name if there's no logo (or it fails to load). */
export function LogoTile({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      {logoUrl && !broken ? (
        // A small, even inset on every side (proportional to the tile), the logo fills the rest.
        <LogoImage src={logoUrl} alt={`${name} logo`} onError={() => setBroken(true)} className="inset-x-[8%] inset-y-[14%]" />
      ) : (
        <span className="px-2 text-center text-xs font-bold leading-tight text-muted-foreground">{name}</span>
      )}
    </div>
  );
}
