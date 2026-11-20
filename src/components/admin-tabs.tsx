import Link from "next/link";
import { cn } from "@/components/ui";

const tabs = [
  ["/admin", "Overview"],
  ["/admin/disputes", "Disputes"],
  ["/admin/credentials", "Documents"],
  ["/admin/reviews", "Reviews"],
  ["/admin/feedback", "Feature requests"],
  ["/admin/waitlist", "Waitlist"],
] as const;

/** Links between the staff pages. */
export function AdminTabs({ current }: { current: (typeof tabs)[number][0] }) {
  return (
    <nav aria-label="Staff pages" className="mb-6 flex flex-wrap gap-1 border-b border-stone-200 pb-3 text-sm">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium",
            href === current ? "bg-brand-200 text-brand-950" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
