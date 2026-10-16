import { Input } from "@/components/ui/input";
import { SLUG_RE } from "../slug";

/** Slug field with the URL prefix shown in front. */
export function SlugInput({ id, value, onChange, prefix }: { id?: string; value: string; onChange: (v: string) => void; prefix: string }) {
  const invalid = value !== "" && !SLUG_RE.test(value);
  return (
    <div>
      <div className="flex rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <span className="hidden items-center whitespace-nowrap border-r border-input bg-muted px-3 font-mono text-xs text-muted-foreground sm:flex">{prefix}</span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          className="border-0 font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-invalid={invalid}
        />
      </div>
      {invalid && <p className="mt-1 text-xs text-destructive">Only lowercase letters, numbers and single dashes.</p>}
    </div>
  );
}
