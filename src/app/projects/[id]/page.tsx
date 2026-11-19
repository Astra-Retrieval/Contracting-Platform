import Link from "next/link";
import { notFound } from "next/navigation";
import { openDispute } from "@/app/actions/disputes";
import { startConversation } from "@/app/actions/messages";
import { payMilestone } from "@/app/actions/payments";
import {
  addBudgetItem,
  addProjectPhoto,
  deleteBudgetItem,
  setProjectStatus,
  setProjectVisibility,
} from "@/app/actions/projects";
import { acceptQuote, rejectQuote } from "@/app/actions/quotes";
import { submitReview } from "@/app/actions/reviews";
import { DisputePanel, type Dispute } from "@/components/dispute-panel";
import { PhotoField } from "@/components/photo-picker";
import { PhotoUploader } from "@/components/photo-uploader";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  ButtonLink,
  Card,
  Empty,
  Flash,
  SectionTitle,
  Stars,
  Stat,
  StatusBadge,
  inputCls,
  type SearchParams,
} from "@/components/ui";
import { requireCustomer } from "@/lib/auth";
import { prosById } from "@/lib/data";
import { flash, money, photoUrl, shortDate } from "@/lib/format";
import { confirmCheckoutReturn } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

type Quote = {
  id: string;
  request_id: string;
  pro_id: string;
  amount_cents: number;
  timeline: string;
  scope: string;
  status: string;
  created_at: string;
};
type Milestone = {
  id: string;
  quote_id: string;
  title: string;
  amount_cents: number;
  refunded_cents: number;
  sort: number;
  status: string;
};

// Statuses where the customer has paid (less anything refunded).
const PAID = ["paid", "disputed", "refunded"];

export const metadata = { title: "Project" };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const viewer = await requireCustomer();
  const { id } = await params;
  const query = await searchParams;
  const here = `/projects/${id}`;

  // Coming back from Stripe Checkout: record the payment now rather than waiting for the webhook.
  if (typeof query.session_id === "string" && isStripeConfigured) {
    let paid = false;
    try {
      paid = await confirmCheckoutReturn(query.session_id);
    } catch (e) {
      console.error("Could not confirm checkout session", e);
    }
    flash(
      here,
      paid ? "notice" : "error",
      paid
        ? "Approved and paid. The payment went straight to your pro."
        : "We could not confirm that payment yet. Refresh in a moment.",
    );
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("customer_id", viewer.id)
    .maybeSingle();
  if (!project) notFound();

  const [
    { data: category },
    { data: photos },
    { data: requests },
    { data: quoteRows },
    { data: milestoneRows },
    { data: subs },
    { data: budgetItems },
    { data: myReviews },
    { data: disputeRows },
  ] = await Promise.all([
    project.category_id
      ? supabase.from("categories").select("name").eq("id", project.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("project_photos").select("id, storage_path").eq("project_id", id).order("created_at"),
    supabase.from("quote_requests").select("id, pro_id, status, source, created_at").eq("project_id", id).order("created_at"),
    supabase.from("quotes").select("*").eq("project_id", id).order("created_at"),
    supabase.from("milestones").select("*").eq("project_id", id).order("sort"),
    supabase.from("project_subs").select("id, quote_id, sub_id, scope, status").eq("project_id", id).eq("status", "accepted"),
    supabase.from("budget_items").select("id, label, planned_cents, quote_id").eq("project_id", id).order("created_at"),
    supabase.from("reviews").select("pro_id, rating, body").eq("project_id", id).eq("reviewer_id", viewer.id),
    supabase.from("disputes").select("*").eq("project_id", id).order("created_at"),
  ]);
  // Latest dispute per milestone.
  const disputeFor = new Map<string, Dispute>();
  for (const d of (disputeRows ?? []) as Dispute[]) disputeFor.set(d.milestone_id, d);

  const quotes = (quoteRows ?? []) as Quote[];
  const milestones = (milestoneRows ?? []) as Milestone[];
  const pros = await prosById(supabase, [
    ...(requests ?? []).map((r) => r.pro_id),
    ...(subs ?? []).map((s) => s.sub_id),
  ]);
  const proName = (pid: string) => pros.get(pid)?.business_name || "Pro";
  const milestonesFor = (quoteId: string) => milestones.filter((m) => m.quote_id === quoteId);

  const accepted = quotes.filter((q) => q.status === "accepted");
  const open = quotes.filter((q) => q.status === "submitted");
  const closed = ["completed", "cancelled"].includes(project.status);

  // Budget numbers
  const paidForQuote = (quoteId: string) =>
    milestonesFor(quoteId)
      .filter((m) => PAID.includes(m.status))
      .reduce((sum, m) => sum + Number(m.amount_cents) - Number(m.refunded_cents ?? 0), 0);
  const planned = (budgetItems ?? []).reduce((sum, b) => sum + Number(b.planned_cents), 0);
  const paid = accepted.reduce((sum, q) => sum + paidForQuote(q.id), 0);
  const budget = Number(project.budget_cents ?? 0);

  // Who can be reviewed: leads and subs on accepted quotes with at least one approved milestone.
  const reviewable: { proId: string; role: string }[] = [];
  for (const q of accepted) {
    if (!milestonesFor(q.id).some((m) => PAID.includes(m.status))) continue;
    reviewable.push({ proId: q.pro_id, role: "Contractor" });
    for (const s of (subs ?? []).filter((s) => s.quote_id === q.id)) {
      if (!reviewable.some((r) => r.proId === s.sub_id)) reviewable.push({ proId: s.sub_id, role: "Subcontractor" });
    }
  }

  return (
    <div className="page">
      <Flash params={query} />

      <header className="mb-8">
        <Link href="/projects" className="text-sm text-stone-500 hover:text-stone-800">
          ← My projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {[
                category?.name,
                [project.city, project.state].filter(Boolean).join(", "),
                project.target_start && `Start ${shortDate(project.target_start)}`,
                project.target_end && `Finish ${shortDate(project.target_end)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={project.status} />
            {project.status === "open" && accepted.length === 0 && (
              <form action={setProjectStatus}>
                <input type="hidden" name="project_id" value={id} />
                <input type="hidden" name="status" value="cancelled" />
                <SubmitButton variant="ghost" small confirm="Cancel this project?">
                  Cancel project
                </SubmitButton>
              </form>
            )}
            {project.status === "cancelled" && (
              <form action={setProjectStatus}>
                <input type="hidden" name="project_id" value={id} />
                <input type="hidden" name="status" value="open" />
                <SubmitButton variant="secondary" small>
                  Reopen
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
        {project.description && (
          <p className="mt-4 max-w-3xl whitespace-pre-wrap text-stone-700">{project.description}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {(photos ?? []).map((p) => (
            <a
              key={p.id}
              href={photoUrl(p.storage_path)}
              target="_blank"
              rel="noreferrer"
              className="block size-20 overflow-hidden rounded-lg border border-stone-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.storage_path)} alt="Project photo" className="size-full object-cover" />
            </a>
          ))}
          {!closed && (
            <PhotoUploader
              userId={viewer.id}
              folder={`projects/${id}`}
              onUploaded={addProjectPhoto.bind(null, id)}
              label="Add project photos"
            />
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------ Work in progress */}
      {accepted.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Work and payments</SectionTitle>
          <div className="space-y-4">
            {accepted.map((q) => {
              const quoteSubs = (subs ?? []).filter((s) => s.quote_id === q.id);
              return (
                <Card key={q.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link href={`/pros/${q.pro_id}`} className="font-semibold text-stone-900 hover:text-brand-700">
                        {proName(q.pro_id)}
                      </Link>
                      <p className="text-sm text-stone-500">
                        {money(q.amount_cents)} total · {money(paidForQuote(q.id))} paid
                        {q.timeline && ` · ${q.timeline}`}
                      </p>
                    </div>
                    <form action={startConversation}>
                      <input type="hidden" name="other_id" value={q.pro_id} />
                      <SubmitButton variant="secondary" small pendingText="Opening…">
                        Message
                      </SubmitButton>
                    </form>
                  </div>
                  <p className="mt-3 text-sm text-stone-600">
                    These milestones are the payment schedule. Your pro sends each bill when it comes
                    due; you check the work, then approve and pay. Payments go straight to the pro.
                  </p>
                  <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
                    {milestonesFor(q.id).map((m, i) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-medium text-stone-900">
                            {i + 1}. {m.title}
                          </p>
                          <div className="mt-1">
                            <StatusBadge kind="milestone" status={m.status} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums">{money(m.amount_cents)}</span>
                          {m.status === "billed" && (
                            <form action={payMilestone}>
                              <input type="hidden" name="milestone_id" value={m.id} />
                              <SubmitButton small pendingText="Opening checkout…">
                                Approve and pay
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                        {m.status === "billed" && (
                          <p className="w-full text-sm text-stone-600">
                            Your pro has billed this milestone. Paying it means you approve the work.
                            Not happy yet? Message your pro before paying.
                          </p>
                        )}
                        {m.status === "paid" && (
                          <details className="w-full text-sm">
                            <summary className="cursor-pointer text-stone-500 hover:text-stone-800">
                              Something wrong? Report a problem
                            </summary>
                            <form action={openDispute} className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3">
                              <input type="hidden" name="milestone_id" value={m.id} />
                              <textarea
                                name="reason"
                                required
                                minLength={10}
                                rows={3}
                                aria-label="What went wrong"
                                placeholder="What went wrong? Be specific: what was agreed and what you got."
                                className={inputCls}
                              />
                              <PhotoField
                                userId={viewer.id}
                                folder={`disputes/${m.id}`}
                                label="Add photos of the problem"
                              />
                              <p className="text-xs text-stone-500">
                                The pro is asked to respond and can offer to fix it or refund part of
                                the {money(m.amount_cents)} you paid. You can ask our team to decide if you
                                cannot agree.
                              </p>
                              <SubmitButton variant="danger" small pendingText="Reporting…">
                                Report problem
                              </SubmitButton>
                            </form>
                          </details>
                        )}
                        {disputeFor.has(m.id) && disputeFor.get(m.id)?.status !== "withdrawn" && (
                          <DisputePanel
                            dispute={disputeFor.get(m.id) as Dispute}
                            role="customer"
                            amountCents={Number(m.amount_cents)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                  {quoteSubs.length > 0 && (
                    <p className="mt-3 border-t border-stone-100 pt-3 text-sm text-stone-600">
                      Subcontractors on this job:{" "}
                      {quoteSubs.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ", "}
                          <Link href={`/pros/${s.sub_id}`} className="font-medium text-stone-900 hover:text-brand-700">
                            {proName(s.sub_id)}
                          </Link>
                          {s.scope && ` (${s.scope})`}
                        </span>
                      ))}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ Quotes */}
      <section className="mb-10">
        <SectionTitle
          action={
            !closed && (
              <ButtonLink href={`/pros?project=${id}`} small>
                Find pros to quote
              </ButtonLink>
            )
          }
        >
          Quotes
        </SectionTitle>

        {project.status === "open" && (
          <form
            action={setProjectVisibility}
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
          >
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="open_to_pros" value={project.open_to_pros ? "false" : "true"} />
            <p className="text-stone-700">
              {project.open_to_pros ? (
                <>
                  <span className="font-medium text-stone-900">Open to all pros.</span> Pros can find this
                  project in their feed and offer a quote. You can also invite pros yourself.
                </>
              ) : (
                <>
                  <span className="font-medium text-stone-900">Invite only.</span> Only pros you ask for a
                  quote can see this project.
                </>
              )}
            </p>
            <SubmitButton variant="secondary" small pendingText="Saving…">
              {project.open_to_pros ? "Make invite only" : "Open to all pros"}
            </SubmitButton>
          </form>
        )}

        {(requests ?? []).length === 0 ? (
          <Empty title="No quote requests yet">
            Browse pros and send this project to the ones you like. Ask a few so you can compare.
          </Empty>
        ) : (
          <>
            {open.length >= 2 && (
              <div className="mb-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="w-full min-w-xl text-left text-sm">
                  <caption className="sr-only">Side-by-side comparison of open quotes</caption>
                  <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Pro</th>
                      <th className="px-4 py-2.5 font-medium">Rating</th>
                      <th className="px-4 py-2.5 text-right font-medium">Price</th>
                      <th className="px-4 py-2.5 font-medium">Timeline</th>
                      <th className="px-4 py-2.5 font-medium">Payments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {[...open]
                      .sort((a, b) => Number(a.amount_cents) - Number(b.amount_cents))
                      .map((q) => {
                        const pro = pros.get(q.pro_id);
                        return (
                          <tr key={q.id}>
                            <td className="px-4 py-2.5 font-medium">{proName(q.pro_id)}</td>
                            <td className="px-4 py-2.5">
                              <Stars value={pro?.rating_avg ?? 0} count={pro?.rating_count ?? 0} />
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                              {money(q.amount_cents)}
                            </td>
                            <td className="px-4 py-2.5">{q.timeline || "Not given"}</td>
                            <td className="px-4 py-2.5">{milestonesFor(q.id).length} milestone(s)</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            <ul className="space-y-3">
              {(requests ?? []).map((r) => {
                const quote = quotes.filter((q) => q.request_id === r.id && q.status !== "withdrawn").at(-1);
                const pro = pros.get(r.pro_id);
                return (
                  <li key={r.id}>
                    <Card>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link href={`/pros/${r.pro_id}`} className="font-semibold text-stone-900 hover:text-brand-700">
                            {proName(r.pro_id)}
                          </Link>
                          <div className="mt-0.5">
                            <Stars value={pro?.rating_avg ?? 0} count={pro?.rating_count ?? 0} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={quote ? quote.status : r.status} />
                          <form action={startConversation}>
                            <input type="hidden" name="other_id" value={r.pro_id} />
                            <SubmitButton variant="ghost" small pendingText="Opening…">
                              Message
                            </SubmitButton>
                          </form>
                        </div>
                      </div>

                      {!quote && r.status === "pending" && (
                        <p className="mt-3 text-sm text-stone-500">
                          {r.source === "pro"
                            ? `Found your project on ${shortDate(r.created_at)} and is preparing a quote.`
                            : `Requested ${shortDate(r.created_at)}. Waiting for their quote.`}
                        </p>
                      )}

                      {quote && (
                        <div className="mt-4 border-t border-stone-100 pt-4">
                          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                            <p className="text-2xl font-bold tabular-nums">{money(quote.amount_cents)}</p>
                            {quote.timeline && (
                              <p className="text-sm text-stone-600">Timeline: {quote.timeline}</p>
                            )}
                          </div>
                          {quote.scope && (
                            <p className="mt-2 text-sm whitespace-pre-wrap text-stone-700">{quote.scope}</p>
                          )}
                          {quote.status !== "accepted" && (
                            <ul className="mt-3 space-y-1 text-sm text-stone-600">
                              {milestonesFor(quote.id).map((m, i) => (
                                <li key={m.id} className="flex justify-between gap-4">
                                  <span>
                                    {i + 1}. {m.title}
                                  </span>
                                  <span className="tabular-nums">{money(m.amount_cents)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {quote.status === "submitted" && !closed && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <form action={acceptQuote}>
                                <input type="hidden" name="quote_id" value={quote.id} />
                                <SubmitButton
                                  pendingText="Accepting…"
                                  confirm={`Accept this quote from ${proName(r.pro_id)} for ${money(quote.amount_cents)}?`}
                                >
                                  Accept quote
                                </SubmitButton>
                              </form>
                              <form action={rejectQuote}>
                                <input type="hidden" name="quote_id" value={quote.id} />
                                <SubmitButton variant="ghost">Decline</SubmitButton>
                              </form>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------ Budget */}
      <section id="budget" className="mb-10 scroll-mt-24">
        <SectionTitle>Budget tracker</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Budget" value={budget ? money(budget) : "Not set"} />
          <Stat label="Planned" value={money(planned)} hint="Accepted quotes plus your own lines" />
          <Stat label="Paid" value={money(paid)} />
          <Stat
            label={budget ? "Left in budget" : "Still to pay"}
            value={money(budget ? budget - planned : planned - paid)}
            hint={budget && planned > budget ? "Over budget" : undefined}
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-md text-left text-sm">
            <caption className="sr-only">Budget lines</caption>
            <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Line</th>
                <th className="px-4 py-2.5 text-right font-medium">Planned</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(budgetItems ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-stone-500">
                    Accepted quotes appear here automatically. Add your own lines for materials,
                    permits, or anything else.
                  </td>
                </tr>
              )}
              {(budgetItems ?? []).map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5">
                    {b.label} {b.quote_id && <Badge tone="green">Accepted quote</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(b.planned_cents)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {b.quote_id ? money(paidForQuote(b.quote_id)) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!b.quote_id && (
                      <form action={deleteBudgetItem}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="project_id" value={id} />
                        <SubmitButton variant="ghost" small pendingText="…">
                          Remove
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={addBudgetItem} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="project_id" value={id} />
          <input name="label" required aria-label="Budget line" placeholder="e.g. Tile and materials" className={`${inputCls} max-w-xs`} />
          <input name="planned" required aria-label="Planned amount" inputMode="decimal" placeholder="$ amount" className={`${inputCls} max-w-36`} />
          <SubmitButton variant="secondary" pendingText="Adding…">
            Add line
          </SubmitButton>
        </form>
      </section>

      {/* ------------------------------------------------------------ Reviews */}
      {reviewable.length > 0 && (
        <section>
          <SectionTitle>Review the pros on this project</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {reviewable.map(({ proId, role }) => {
              const existing = (myReviews ?? []).find((r) => r.pro_id === proId);
              return (
                <Card key={proId}>
                  <p className="font-semibold">
                    {proName(proId)} <Badge>{role}</Badge>
                  </p>
                  <form action={submitReview} className="mt-3 space-y-3">
                    <input type="hidden" name="project_id" value={id} />
                    <input type="hidden" name="pro_id" value={proId} />
                    <select
                      name="rating"
                      required
                      aria-label="Rating"
                      defaultValue={existing ? String(existing.rating) : ""}
                      className={`${inputCls} max-w-44`}
                    >
                      <option value="" disabled>
                        Rating
                      </option>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {"★".repeat(n)} ({n})
                        </option>
                      ))}
                    </select>
                    <textarea
                      name="body"
                      rows={3}
                      aria-label="Review"
                      defaultValue={existing?.body ?? ""}
                      placeholder="How did it go?"
                      className={inputCls}
                    />
                    <SubmitButton variant="secondary" pendingText="Saving…">
                      {existing ? "Update review" : "Post review"}
                    </SubmitButton>
                  </form>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
