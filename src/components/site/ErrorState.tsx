import { AlertTriangle } from "lucide-react";

export function ErrorState({ message = "Something went wrong while loading this page.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="glass-panel mx-auto max-w-lg p-8 text-center" data-error-state="">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-primary" />
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="glow-button-outline rounded-lg px-5 py-2 text-sm">
          Try again
        </button>
      )}
    </div>
  );
}
