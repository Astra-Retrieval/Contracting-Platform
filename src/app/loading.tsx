// Shown at once while a page's data loads, so a click never looks like nothing happened.
export default function Loading() {
  return (
    <div className="page" role="status" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-brand-100" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-brand-100" />
      <div className="mt-8 space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-white/70" />
        <div className="h-24 animate-pulse rounded-xl bg-white/70" />
        <div className="h-24 animate-pulse rounded-xl bg-white/70" />
      </div>
    </div>
  );
}
