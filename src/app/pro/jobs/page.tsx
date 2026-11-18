import Link from "next/link";
import { Card, Empty, Flash, PageHeader, SectionTitle, StatusBadge, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { namesById } from "@/lib/data";
import { money, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Leads & jobs" };

export default async function ProJobsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("quote_requests")
    .select("id, project_id, status, message, created_at")
    .eq("pro_id", viewer.id)
    .order("created_at", { ascending: false });
  const projectIds = (requests ?? []).map((r) => r.project_id);
  const [{ data: projects }, { data: quotes }] = projectIds.length
    ? await Promise.all([
        supabase.from("projects").select("id, title, customer_id, city, state").in("id", projectIds),
        supabase
          .from("quotes")
          .select("request_id, amount_cents, status")
          .eq("pro_id", viewer.id)
          .in("status", ["submitted", "accepted"]),
      ])
    : [{ data: [] }, { data: [] }];
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const names = await namesById(supabase, (projects ?? []).map((p) => p.customer_id));
  const quoteByRequest = new Map((quotes ?? []).map((q) => [q.request_id, q]));

  const groups: [string, string[], string][] = [
    ["Active jobs", ["accepted"], "Jobs appear here once a customer accepts your quote."],
    ["New requests", ["pending"], "No new requests right now."],
    ["Quotes sent", ["quoted"], "Quotes waiting on the customer show up here."],
    ["Closed", ["declined", "closed"], ""],
  ];

  return (
    <div className="page">
      <Flash params={params} />
      <PageHeader title="Leads & jobs" subtitle="Quote requests from customers and the jobs you have won." />
      {(requests ?? []).length === 0 ? (
        <Empty title="No quote requests yet">
          Customers find you through search. A complete profile with photos gets more requests.
          <div className="mt-3">
            <Link href="/pro/profile" className="font-semibold text-brand-700 hover:underline">
              Improve your profile
            </Link>
          </div>
        </Empty>
      ) : (
        <div className="space-y-8">
          {groups.map(([title, statuses, emptyText]) => {
            const rows = (requests ?? []).filter((r) => statuses.includes(r.status));
            if (!rows.length && !emptyText) return null;
            return (
              <section key={title}>
                <SectionTitle>
                  {title} <span className="font-normal text-stone-400">({rows.length})</span>
                </SectionTitle>
                {rows.length === 0 ? (
                  <p className="text-sm text-stone-500">{emptyText}</p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r) => {
                      const project = projectById.get(r.project_id);
                      const quote = quoteByRequest.get(r.id);
                      return (
                        <li key={r.id}>
                          <Link href={`/pro/jobs/${r.id}`} className="block">
                            <Card className="flex flex-wrap items-center justify-between gap-3 hover:border-brand-300">
                              <div>
                                <p className="font-semibold text-stone-900">{project?.title ?? "Project"}</p>
                                <p className="text-sm text-stone-500">
                                  {[
                                    project && names.get(project.customer_id),
                                    project && [project.city, project.state].filter(Boolean).join(", "),
                                    `Requested ${shortDate(r.created_at)}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                {quote && (
                                  <span className="font-semibold tabular-nums">{money(quote.amount_cents)}</span>
                                )}
                                <StatusBadge status={r.status} />
                              </div>
                            </Card>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
