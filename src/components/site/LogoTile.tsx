import { useState } from "react";
import { cn } from "@/lib/utils";

/** Brand/client logo in a white tile; falls back to the name if there's no logo (or it fails to load). */
export function LogoTile({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      {logoUrl && !broken ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-auto max-h-full w-auto max-w-full object-contain p-2"
        />
      ) : (
        <span className="px-2 text-center text-xs font-bold leading-tight text-muted-foreground">{name}</span>
      )}
    </div>
  );
}
