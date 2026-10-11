export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-muted">{label}</p>
      <div className="h-16 animate-pulse rounded-md bg-panel-2" />
      <div className="h-16 animate-pulse rounded-md bg-panel-2" />
      <div className="h-16 w-2/3 animate-pulse rounded-md bg-panel-2" />
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-danger/40 bg-danger/10 p-4" role="alert">
      <p className="text-sm text-paper">{message}</p>
      {onRetry ? (
        <button type="button" className="mt-3 text-sm text-brass underline" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center">
      <p className="font-serif text-xl text-paper">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}
