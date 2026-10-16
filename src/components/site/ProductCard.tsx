import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import type { ProductCardData } from "@/lib/queries";
import { ProductImage } from "./ProductImage";

/** First line of the description (the product family, e.g. "ECT Signal Isolator and Converter"). */
export function summary(description: string | null) {
  return description?.split("\n").find((l) => l.trim())?.trim() ?? null;
}

/** Plain element with a CSS hover lift — grids can hold hundreds of these, so no animation component per card. */
export function ProductCard({ product, showBrand = true }: { product: ProductCardData; showBrand?: boolean }) {
  const blurb = summary(product.description);
  return (
    <div className="transition-transform duration-300 ease-out hover:-translate-y-[5px] motion-reduce:hover:translate-y-0">
      <Link to={`/products/${product.slug}`} className="glass-panel-hover group flex h-full flex-col overflow-hidden">
        <ProductImage
          src={product.image_url}
          alt={product.name}
          className="h-44 border-b border-border/60 p-3"
          imgClassName="transition-transform duration-500 group-hover:scale-105"
        />
        <div className="flex flex-1 flex-col p-5">
          <h3 className="mb-1 break-words text-sm font-bold text-foreground transition-colors group-hover:text-primary">
            {product.name}
          </h3>
          {showBrand && product.brand && (
            <span className="mb-2 text-xs font-medium text-primary">{product.brand.name}</span>
          )}
          {blurb && <p className="mb-4 line-clamp-3 flex-1 text-xs text-muted-foreground">{blurb}</p>}
          <div className="mt-auto flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-muted-foreground">{product.category?.name}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
          </div>
        </div>
      </Link>
    </div>
  );
}
