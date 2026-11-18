import Link from "next/link";
import { adminResolveDispute } from "@/app/actions/disputes";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, Field, Flash, PageHeader, SectionTitle, inputCls, type SearchParams } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { money, shortDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Disputes" };

export default async function AdminDisputesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = await searchParams;
  // Admins see every dispute, so this page reads with the service-role client.
  const admin = createAdminClient();

  const { data: disputes } = await admin
    .from("disputes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = disputes ?? [];
  const [{ data: milestones }, { data: projects }, { data: people }, { data: pros }] = rows.length
    ? await Promise.all([
        admin.from("milestones").select("id, title, amount_cents").in("id", rows.map((d) => d.milestone_id)),
        admin.from("projects").select("id, title").in("id", rows.map((d) => d.project_id)),
        admin.from("profiles").select("id, full_name").in("id", rows.map((d) => d.customer_id)),
        admin.from("pro_profiles").select("user_id, business_name").in("user_id", rows.map((d) => d.pro_id)),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const milestone = new Map((milestones ?? []).map((m) => [m.id, m]));
  const project = new Map((projects ?? []).map((p) => [p.id, p.title as string]));
  const customer = new Map((people ?? []).map((p) => [p.id, p.full_name as string]));
  const pro = new Map((pros ?? []).map((p) => [p.user_id, p.business_name as string]));

  // Escalated first: those are the ones waiting on a decision.
  const open = rows
    .filter((d) => ["open", "escalated"].includes(d.status))
    .sort((a, b) => Number(b.status === "escalated") - Number(a.status === "escalated"));
  const closed = rows.filter((d) => !["open", "escalated"].includes(d.status));

  return (
    <div className="page max-w-4xl!">
      <Flash params={params} />
      <PageHeader
        title="Disputes"
        subtitle="Platform staff only. Decide how a disputed payment is split between the customer and the pro."
      />

      <SectionTitle>
        Open <span className="font-normal text-stone-400">({open.length})</span>
      </SectionTitle>
      {open.length === 0 ? (
        <Empty title="No open disputes" />
      ) : (
        <ul className="space-y-4">
          {open.map((d) => {
            const m = milestone.get(d.milestone_id);
            const amount = Number(m?.amount_cents ?? 0);
            return (
              <li key={d.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {project.get(d.project_id) ?? "Project"} · {m?.title ?? "Milestone"}
                      </p>
                      <p className="text-sm text-stone-600">
                        {customer.get(d.customer_id) || "Customer"} vs{" "}
                        <Link href={`/pros/${d.pro_id}`} className="font-medium hover:text-orange-700">
                          {pro.get(d.pro_id) || "Pro"}
                        </Link>{" "}
                        · opened {shortDate(d.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">{money(amount)}</p>
                      <Badge tone={d.status === "escalated" ? "red" : "amber"}>
                        {d.status === "escalated" ? "Needs your decision" : "Parties still talking"}
                      </Badge>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-4 border-t border-stone-100 pt-4 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">Customer says</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-stone-800">{d.reason}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">Pro says</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-stone-800">
                        {d.pro_response || "No reply yet."}
                        {d.proposed_refund_cents != null && (
                          <span className="mt-1 block font-medium">
                            Offered refund: {money(d.proposed_refund_cents)}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <form action={adminResolveDispute} className="mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                    <input type="hidden" name="dispute_id" value={d.id} />
                    <Field label="Refund to customer ($)" hint={`0 to ${money(amount)}. The rest is released.`}>
                      <input name="refund" required inputMode="decimal" placeholder="0.00" className={inputCls} />
                    </Field>
                    <Field label="Decision note" hint="Both sides are emailed this.">
                      <input name="note" required minLength={10} className={inputCls} />
                    </Field>
                    <SubmitButton
                      variant="dark"
                      pendingText="Resolving…"
                      confirm="Apply this decision? The refund and payout happen immediately and cannot be undone."
                    >
                      Decide
                    </SubmitButton>
                  </form>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 && (
        <div className="mt-10">
          <SectionTitle>Closed</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-xl text-left text-sm">
              <caption className="sr-only">Closed disputes</caption>
              <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Closed</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Outcome</th>
                  <th className="px-4 py-2.5 text-right font-medium">Refunded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {closed.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{shortDate(d.resolved_at)}</td>
                    <td className="px-4 py-2.5">
                      {project.get(d.project_id) ?? "Project"}
                      <span className="text-stone-500"> · {milestone.get(d.milestone_id)?.title}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {d.status === "withdrawn" ? "Withdrawn by customer" : d.resolution_note || "Resolved"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.status === "resolved" ? money(d.refund_cents ?? 0) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
