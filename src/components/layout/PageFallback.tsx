import { Loader2 } from "lucide-react";

/** Shown only while a page's code downloads for the very first time (normally it is preloaded). */
export function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
