import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

export const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-xs placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50";
const buttonVariants = {
  primary: "bg-brand-300 text-brand-950 hover:bg-brand-400",
  dark: "bg-brand-800 text-white hover:bg-brand-900",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  ghost: "text-stone-700 hover:bg-stone-100",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};
type Variant = keyof typeof buttonVariants;

export const buttonCls = (variant: Variant = "primary", small = false) =>
  cn(buttonBase, buttonVariants[variant], small && "px-3 py-1.5 text-xs");

export function ButtonLink({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; small?: boolean }) {
  return <Link className={cn(buttonCls(variant, small), className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-stone-200 bg-white p-5 shadow-xs", className)}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-stone-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-stone-900">{children}</h2>
      {action}
    </div>
  );
}

const tones = {
  gray: "bg-stone-100 text-stone-700",
  orange: "bg-peach-100 text-peach-900",
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-sky-100 text-sky-900",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
};
type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const statusMap: Record<string, [string, Tone]> = {
  // projects
  open: ["Open", "blue"],
  in_progress: ["In progress", "orange"],
  completed: ["Completed", "green"],
  cancelled: ["Cancelled", "gray"],
  // quote requests and quotes
  pending: ["Awaiting quote", "amber"],
  quoted: ["Quote sent", "blue"],
  declined: ["Declined", "gray"],
  accepted: ["Accepted", "green"],
  closed: ["Closed", "gray"],
  submitted: ["Submitted", "blue"],
  rejected: ["Not selected", "gray"],
  withdrawn: ["Replaced", "gray"],
  // subs
  invited: ["Invited", "amber"],
  removed: ["Removed", "gray"],
};
const milestoneMap: Record<string, [string, Tone]> = {
  pending: ["Scheduled", "gray"],
  billed: ["Bill sent, payment due", "blue"],
  paid: ["Approved and paid", "green"],
  disputed: ["Paid, problem reported", "red"],
  refunded: ["Refunded", "gray"],
};

export function StatusBadge({ status, kind }: { status: string; kind?: "milestone" }) {
  const [label, tone] = (kind === "milestone" ? milestoneMap : statusMap)[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Stars({ value, count, label }: { value: number; count?: number; label?: string }) {
  const rounded = Math.round(Number(value) || 0);
  if (count === 0) return <span className="text-sm text-stone-500">No {label ?? "reviews"} yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden className="tracking-tight text-amber-500">
        {"★".repeat(rounded)}
        <span className="text-stone-300">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className="font-medium text-stone-800">{Number(value).toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-stone-500">
          ({count} {label ?? (count === 1 ? "review" : "reviews")})
        </span>
      )}
    </span>
  );
}

export function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const error = typeof params.error === "string" ? params.error : null;
  const notice = typeof params.notice === "string" ? params.notice : null;
  if (!error && !notice) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "mb-5 rounded-lg border px-4 py-3 text-sm",
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-900",
      )}
    >
      {error ?? notice}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
      <p className="font-medium text-stone-800">{title}</p>
      {children && <div className="mt-2 text-sm text-stone-600">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
