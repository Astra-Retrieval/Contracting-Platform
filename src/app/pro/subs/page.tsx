import Link from "next/link";
import { startConversation } from "@/app/actions/messages";
import { respondToSubInvite, toggleFavorite } from "@/app/actions/subs";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, Empty, Flash, PageHeader, SectionTitle, Stars, StatusBadge, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { prosById } from "@/lib/data";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Subs" };

export default async function ProSubsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: favorites }, { data: roles }] = await Promise.all([
    supabase.from("favorite_subs").select("sub_id, created_at").eq("pro_id", viewer.id).order("created_at"),
    supabase
      .from("project_subs")
      .select("id, project_id, lead_pro_id, scope, amount_cents, status, created_at")
      .eq("sub_id", viewer.id)
      .in("status", ["invited", "accepted"])
      .order("created_at", { ascending: false }),
  ]);
  const pros = await prosById(supabase, [
    ...(favorites ?? []).map((f) => f.sub_id),
    ...(roles ?? []).map((r) => r.lead_pro_id),
  ]);
  const projectIds = (roles ?? []).map((r) => r.project_id);
  const { data: projects } = projectIds.length
    ? await supabase.from("projects").select("id, title, city, state").in("id", projectIds)
    : { data: [] };
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  return (
    <div className="page">
      <Flash params={params} />
      <PageHeader
        title="Subs"
        subtitle="The pros you like to work with, and the jobs other contractors have brought you onto."
        action={<ButtonLink href="/pros">Find pros</ButtonLink>}
      />

      <section className="mb-10">
        <SectionTitle>Jobs you are subbing on</SectionTitle>
        {(roles ?? []).length === 0 ? (
          <p className="text-sm text-stone-500">
            When another contractor adds you to a job, the invitation shows up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {(roles ?? []).map((r) => {
              const project = projectById.get(r.project_id);
              return (
                <li key={r.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-stone-900">{project?.title ?? "Project"}</p>
                        <p className="text-sm text-stone-600">
                          For{" "}
                          <Link href={`/pros/${r.lead_pro_id}`} className="font-medium hover:text-orange-700">
                            {pros.get(r.lead_pro_id)?.business_name || "a contractor"}
                          </Link>
                          {project && [project.city, project.state].filter(Boolean).length > 0 &&
                            ` · ${[project.city, project.state].filter(Boolean).join(", ")}`}
                        </p>
                        {r.scope && <p className="mt-1 text-sm text-stone-700">Your part: {r.scope}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums">{money(r.amount_cents)}</p>
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status === "invited" && (
                        <>
                          <form action={respondToSubInvite}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="response" value="accept" />
                            <SubmitButton small pendingText="Accepting…">
                              Accept
                            </SubmitButton>
                          </form>
                          <form action={respondToSubInvite}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="response" value="decline" />
                            <SubmitButton variant="ghost" small>
                              Decline
                            </SubmitButton>
                          </form>
                        </>
                      )}
                      <form action={startConversation}>
                        <input type="hidden" name="other_id" value={r.lead_pro_id} />
                        <SubmitButton variant="secondary" small pendingText="Opening…">
                          Message contractor
                        </SubmitButton>
                      </form>
                    </div>
                    {r.status === "accepted" && (
                      <p className="mt-3 text-xs text-stone-500">
                        You are paid your share automatically each time the customer approves a milestone.
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Your favorite subs</SectionTitle>
        {(favorites ?? []).length === 0 ? (
          <Empty title="No favorites yet">
            Open any pro&apos;s profile and choose &ldquo;Add to favorite subs&rdquo;. Favorites are a
            shortcut: you can add any pro on the platform to a job, and favorites show up first.
          </Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {(favorites ?? []).map((f) => {
              const pro = pros.get(f.sub_id);
              return (
                <li key={f.sub_id}>
                  <Card className="h-full">
                    <Link href={`/pros/${f.sub_id}`} className="font-semibold text-stone-900 hover:text-orange-700">
                      {pro?.business_name || "Pro"}
                    </Link>
                    {pro?.headline && <p className="text-sm text-stone-600">{pro.headline}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-4">
                      <Stars value={pro?.rating_avg ?? 0} count={pro?.rating_count ?? 0} />
                      {(pro?.sub_rating_count ?? 0) > 0 && (
                        <Stars value={pro?.sub_rating_avg ?? 0} count={pro?.sub_rating_count} label="as a sub" />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={startConversation}>
                        <input type="hidden" name="other_id" value={f.sub_id} />
                        <SubmitButton variant="secondary" small pendingText="Opening…">
                          Message
                        </SubmitButton>
                      </form>
                      <form action={toggleFavorite}>
                        <input type="hidden" name="sub_id" value={f.sub_id} />
                        <input type="hidden" name="back" value="/pro/subs" />
                        <SubmitButton variant="ghost" small>
                          Remove
                        </SubmitButton>
                      </form>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
