import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Product photo with a neutral placeholder when missing or broken. */
export function ProductImage({
  src,
  alt,
  className,
  imgClassName,
  iconClassName = "h-12 w-12",
  eager,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  iconClassName?: string;
  eager?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("flex items-center justify-center overflow-hidden bg-white", className)}>
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          // The main product photo is the page's largest element (LCP): fetch it first.
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => setBroken(true)}
          className={cn("h-full w-full object-contain", imgClassName)}
        />
      ) : (
        <Package className={cn("text-muted-foreground/30", iconClassName)} aria-hidden />
      )}
    </div>
  );
}
