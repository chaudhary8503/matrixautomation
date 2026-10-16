import { m } from "framer-motion";
import { cn } from "@/lib/utils";

export type Chip = { value: string; label: string; count?: number };

/** Row of category buttons. `value` "" means "All". */
export function FilterChips({
  chips,
  value,
  onChange,
  label,
}: {
  chips: Chip[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const active = c.value === value;
        return (
          <m.button
            key={c.value || "__all"}
            type="button"
            whileTap={{ scale: 0.95 }}
            aria-pressed={active}
            onClick={() => onChange(c.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-medium transition-all duration-300",
              active
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {c.label}
            {c.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-mono text-[10px]",
                  active ? "bg-white/20" : "bg-background/70 text-muted-foreground",
                )}
              >
                {c.count}
              </span>
            )}
          </m.button>
        );
      })}
    </div>
  );
}
