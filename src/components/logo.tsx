/**
 * The Crew Orchard mark: a tree built from circles. Three canopy circles (the crew),
 * a trunk, and one peach for the fruit of the work.
 */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="14" y="19" width="4" height="11" rx="2" fill="#8a5a3c" />
      <circle cx="10" cy="14" r="8" fill="#84c998" />
      <circle cx="22" cy="14" r="8" fill="#4a9663" />
      <circle cx="16" cy="9" r="8" fill="#a6dbb4" />
      <circle cx="20.5" cy="15.5" r="3.2" fill="#ffb38a" />
    </svg>
  );
}
