import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, Flash, PageHeader, SectionTitle, Stat, StatusBadge, type SearchParams } from "@/components/ui";
import { requireViewer, type Viewer } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  return (
    <div className="page">
      <Flash params={params} />
      {viewer.role === "pro" ? <ProDashboard viewer={viewer} /> : <CustomerDashboard viewer={viewer} />}
    </div>
  );
}

async function CustomerDashboard({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, budget_cents, created_at")
    .eq("customer_id", viewer.id)
    .order("created_at", { ascending: false });
  const ids = (projects ?? []).map((p) => p.id);
  const [{ data: quotes }, { data: milestones }] = ids.length
    ? await Promise.all([
        supabase.from("quotes").select("id, project_id, status").in("project_id", ids),
        supabase.from("milestones").select("id, project_id, amount_cents, refunded_cents, status").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const toReview = (quotes ?? []).filter((q) => q.status === "submitted");
  const toApprove = (milestones ?? []).filter((m) => m.status === "billed");
  const paid = (milestones ?? [])
    .filter((m) => ["paid", "disputed", "refunded"].includes(m.status))
    .reduce((sum, m) => sum + Number(m.amount_cents) - Number(m.refunded_cents ?? 0), 0);
  const active = (projects ?? []).filter((p) => ["open", "in_progress"].includes(p.status));

  return (
    <>
      <PageHeader
        title={`Welcome${viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}`}
        subtitle="Your projects at a glance."
        action={<ButtonLink href="/projects/new">New project</ButtonLink>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active projects" value={active.length} />
        <Stat label="Quotes to review" value={toReview.length} />
        <Stat label="Bills to approve" value={toApprove.length} />
        <Stat label="Paid so far" value={money(paid)} />
      </div>

      <div className="mt-8">
        <SectionTitle action={<Link href="/projects" className="text-sm font-semibold text-brand-700 hover:underline">All projects</Link>}>
          Recent projects
        </SectionTitle>
        {(projects ?? []).length === 0 ? (
          <Empty title="No projects yet">
            Describe what you want done, then ask pros for quotes.
            <div className="mt-4">
              <ButtonLink href="/projects/new">Create your first project</ButtonLink>
            </div>
          </Empty>
        ) : (
          <ul className="space-y-2">
            {(projects ?? []).slice(0, 6).map((p) => {
              const waiting = toReview.filter((q) => q.project_id === p.id).length;
              const approve = toApprove.filter((m) => m.project_id === p.id).length;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="block">
                    <Card className="flex flex-wrap items-center justify-between gap-3 hover:border-brand-300">
                      <div>
                        <p className="font-semibold text-stone-900">{p.title}</p>
                        <p className="text-sm text-stone-500">Created {shortDate(p.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {waiting > 0 && <Badge tone="blue">{waiting} to review</Badge>}
                        {approve > 0 && <Badge tone="orange">{approve} to approve</Badge>}
                        <StatusBadge status={p.status} />
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

async function ProDashboard({ viewer }: { viewer: Viewer }) {
  const supabase = await createClient();
  const [{ data: pro }, { data: billing }, { data: requests }, { data: invites }, { data: payments }, { data: paidBills }, { count: photoCount }] =
    await Promise.all([
      supabase.from("pro_profiles").select("*").eq("user_id", viewer.id).maybeSingle(),
      supabase.from("pro_billing").select("subscription_status, payouts_enabled").eq("user_id", viewer.id).maybeSingle(),
      supabase.from("quote_requests").select("id, status").eq("pro_id", viewer.id),
      supabase.from("project_subs").select("id, status").eq("sub_id", viewer.id),
      supabase.from("payments").select("amount_cents, refunded_cents").eq("pro_id", viewer.id).in("status", ["succeeded", "refunded"]),
      supabase.from("sub_bills").select("amount_cents").eq("sub_id", viewer.id).eq("status", "paid"),
      supabase.from("portfolio_photos").select("id", { count: "exact", head: true }).eq("pro_id", viewer.id),
    ]);

  const count = (status: string) => (requests ?? []).filter((r) => r.status === status).length;
  const earned =
    (payments ?? []).reduce((sum, p) => sum + Number(p.amount_cents) - Number(p.refunded_cents), 0) +
    (paidBills ?? []).reduce((sum, b) => sum + Number(b.amount_cents), 0);
  const pendingInvites = (invites ?? []).filter((i) => i.status === "invited").length;
  const subscribed = ["trialing", "active"].includes(billing?.subscription_status ?? "");

  const checklist: [string, boolean, string, string][] = [
    ["Complete your profile", Boolean(pro?.business_name && pro?.bio && pro?.city), "/pro/profile", "Add a bio, location and pricing"],
    ["Add photos of your work", (photoCount ?? 0) > 0, "/pro/profile#photos", "Profiles with photos get more requests"],
    ["Start your membership", subscribed, "/pro/billing", "Free for the first 30 days"],
    ["Set up payments", Boolean(billing?.payouts_enabled), "/pro/billing", "Needed before you can send a bill"],
  ];
  const remaining = checklist.filter(([, done]) => !done);

  return (
    <>
      <PageHeader
        title={pro?.business_name || "Your dashboard"}
        subtitle="Leads, jobs and earnings."
        action={<ButtonLink href={`/pros/${viewer.id}`} variant="secondary">View public profile</ButtonLink>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New requests" value={count("pending")} />
        <Stat label="Active jobs" value={count("accepted")} />
        <Stat label="Sub invitations" value={pendingInvites} />
        <Stat label="Paid to you" value={money(earned)} />
      </div>

      {remaining.length > 0 && (
        <div className="mt-8">
          <SectionTitle>Get set up</SectionTitle>
          {!isStripeConfigured && (
            <p className="mb-3 text-sm text-stone-500">
              Payments are not connected on this site yet, so membership and billing are unavailable.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {checklist.map(([label, done, href, hint]) => (
              <li key={label}>
                <Link href={href} className="block">
                  <Card className="flex items-center gap-3 hover:border-brand-300">
                    <span
                      aria-hidden
                      className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : "border-2 border-stone-300 text-transparent"}`}
                    >
                      ✓
                    </span>
                    <span>
                      <span className="block font-medium text-stone-900">
                        {label}
                        <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
                      </span>
                      <span className="block text-sm text-stone-500">{hint}</span>
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <ButtonLink href="/pro/jobs" variant="dark">Leads & jobs</ButtonLink>
        <ButtonLink href="/pro/subs" variant="secondary">Your subs</ButtonLink>
        <ButtonLink href="/pros" variant="secondary">Find subs to work with</ButtonLink>
      </div>
    </>
  );
}
