import { FileText, Download } from "lucide-react";
import type { CategoryDocument } from "@/types/database";
import { cn } from "@/lib/utils";

/** Downloadable PDFs attached to a category (manuals, data sheets, approvals…). */
export function DocumentList({ docs, className }: { docs: CategoryDocument[]; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)}>
      {docs.map((d) => (
        <li key={d.id}>
          <a
            href={d.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors hover:border-primary/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{d.title}</span>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{d.doc_type}</span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          </a>
        </li>
      ))}
    </ul>
  );
}
