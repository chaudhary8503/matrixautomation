import type { ReactNode } from "react";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  highlight?: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  as?: "h1" | "h2";
  className?: string;
};

/** "Eyebrow / Title <gradient>Highlight</gradient> / description" block used across the site. */
export function SectionHeading({ eyebrow, title, highlight, description, align = "center", as = "h2", className }: Props) {
  const H = as;
  const center = align === "center";
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      {...(as === "h1" ? { animate: { opacity: 1, y: 0 } } : { whileInView: { opacity: 1, y: 0 }, viewport: { once: true } })}
      className={cn(center ? "mb-12 text-center" : "mb-10", className)}
    >
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <H
        className={cn(
          as === "h1" ? "mb-3 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl" : "mb-3 text-3xl font-bold lg:text-4xl",
        )}
      >
        {title}
        {highlight && (
          <>
            {" "}
            <span className="text-gradient-primary">{highlight}</span>
          </>
        )}
      </H>
      {description && (
        <p className={cn("text-muted-foreground", center ? "mx-auto max-w-lg" : "max-w-xl")}>{description}</p>
      )}
    </m.div>
  );
}
