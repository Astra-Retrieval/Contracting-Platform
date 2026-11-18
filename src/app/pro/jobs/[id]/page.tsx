import Link from "next/link";
import { notFound } from "next/navigation";
import { startConversation } from "@/app/actions/messages";
import { paySubBill, sendMilestoneBill } from "@/app/actions/payments";
import { declineRequest, submitQuote } from "@/app/actions/quotes";
import { submitSubRating } from "@/app/actions/reviews";
import { inviteSub, removeSub } from "@/app/actions/subs";
import { DisputePanel, type Dispute } from "@/components/dispute-panel";
import { MilestoneEditor } from "@/components/milestone-editor";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  Card,
  Field,
  Flash,
  SectionTitle,
  StatusBadge,
  inputCls,
  type SearchParams,
} from "@/components/ui";
import { requirePro } from "@/lib/auth";
import {
  PLATFORM_FEE_BPS,
  PROCESSING_FEE_BPS,
  PROCESSING_FEE_FIXED_CENTS,
  estimatedProcessingFee,
  platformFee,
  processingFeeLabel,
} from "@/lib/config";
import { namesById, prosById } from "@/lib/data";
import { flash, money, photoUrl, shortDate } from "@/lib/format";
import { confirmCheckoutReturn } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

type Milestone = { id: string; quote_id: string; title: string; amount_cents: number; status: string };

export const metadata = { title: "Job" };

export default async function ProJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const viewer = await requirePro();
  const { id } = await params;
  const query = await searchParams;

  // Coming back from paying a sub's bill: record it now rather than waiting for the webhook.
  if (typeof query.session_id === "string" && isStripeConfigured) {
    let paid = false;
    try {
      paid = await confirmCheckoutReturn(query.session_id);
    } catch (e) {
      console.error("Could not confirm checkout session", e);
    }
    flash(
      `/pro/jobs/${id}`,
      paid ? "notice" : "error",
      paid ? "Paid. The payment went straight to your sub." : "We could not confirm that payment yet. Refresh in a moment.",
    );
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("id", id)
    .eq("pro_id", viewer.id)
    .maybeSingle();
  if (!request) notFound();

  const [{ data: project }, { data: photos }, { data: quotes }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", request.project_id).maybeSingle(),
    supabase.from("project_photos").select("id, storage_path").eq("project_id", request.project_id),
    supabase.from("quotes").select("*").eq("request_id", id).order("created_at"),
  ]);
  if (!project) notFound();

  // The quote that matters: the accepted one, else the latest one still open.
  const quote =
    (quotes ?? []).find((q) => q.status === "accepted") ??
    (quotes ?? []).filter((q) => q.status === "submitted").at(-1) ??
    null;

  // Subs can be anyone on the platform. Favorites are offered first; a search adds more.
  const subQuery = (typeof query.sub_q === "string" ? query.sub_q : "").replace(/[,()%*\\"']/g, " ").trim();
  const { data: searchHits } = subQuery
    ? await supabase
        .from("pro_profiles")
        .select("user_id")
        .neq("user_id", viewer.id)
        .neq("business_name", "")
        .or(`business_name.ilike.%${subQuery}%,headline.ilike.%${subQuery}%,city.ilike.%${subQuery}%`)
        .limit(12)
    : { data: [] };

  const [{ data: milestoneRows }, { data: subs }, { data: favorites }, { data: myRatings }, { data: disputeRows }] = await Promise.all([
    quote
      ? supabase.from("milestones").select("*").eq("quote_id", quote.id).order("sort")
      : Promise.resolve({ data: [] }),
    quote
      ? supabase.from("project_subs").select("*").eq("quote_id", quote.id).neq("status", "removed").order("created_at")
      : Promise.resolve({ data: [] }),
    supabase.from("favorite_subs").select("sub_id").eq("pro_id", viewer.id),
    supabase.from("sub_ratings").select("sub_id, rating, body").eq("project_id", project.id).eq("lead_pro_id", viewer.id),
    supabase.from("disputes").select("*").eq("project_id", project.id).eq("pro_id", viewer.id).order("created_at"),
  ]);
  const [{ data: subBills }, { data: myBilling }] = await Promise.all([
    (subs ?? []).length
      ? supabase
          .from("sub_bills")
          .select("id, project_sub_id, amount_cents, note, status, created_at")
          .in("project_sub_id", (subs ?? []).map((s) => s.id))
          .neq("status", "cancelled")
          .order("created_at")
      : Promise.resolve({ data: [] }),
    supabase.from("pro_billing").select("payouts_enabled").eq("user_id", viewer.id).maybeSingle(),
  ]);
  const canBill = Boolean(myBilling?.payouts_enabled);
  const disputeFor = new Map<string, Dispute>();
  for (const d of (disputeRows ?? []) as Dispute[]) disputeFor.set(d.milestone_id, d);
  const milestones = (milestoneRows ?? []) as Milestone[];
  const subPros = await prosById(supabase, [
    ...(subs ?? []).map((s) => s.sub_id),
    ...(favorites ?? []).map((f) => f.sub_id),
    ...(searchHits ?? []).map((h) => h.user_id),
  ]);
  const customerName = (await namesById(supabase, [project.customer_id])).get(project.customer_id) ?? "Customer";

  const canQuote = ["pending", "quoted"].includes(request.status);
  const isAccepted = quote?.status === "accepted";

  const total = Number(quote?.amount_cents ?? 0);
  const fee = platformFee(total) + estimatedProcessingFee(total, milestones.length || 1);
  const subTotal = (subs ?? [])
    .filter((s) => ["invited", "accepted"].includes(s.status))
    .reduce((sum, s) => sum + Number(s.amount_cents), 0);
  const onJob = (pid: string) =>
    (subs ?? []).some((s) => s.sub_id === pid && ["invited", "accepted"].includes(s.status));
  const favoriteOptions = (favorites ?? []).map((f) => f.sub_id as string).filter((pid) => !onJob(pid));
  const searchOptions = (searchHits ?? [])
    .map((h) => h.user_id as string)
    .filter((pid) => !onJob(pid) && !favoriteOptions.includes(pid));
  const subLabel = (pid: string) => {
    const p = subPros.get(pid);
    return [p?.business_name || "Pro", [p?.city, p?.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  };

  return (
    <div className="page">
      <Flash params={query} />
      <Link href="/pro/jobs" className="text-sm text-stone-500 hover:text-stone-800">
        ← Leads & jobs
      </Link>

      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* ------------------------------------------------------- The project */}
        <div className="min-w-0 space-y-6">
          <header>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
              <StatusBadge status={request.status} />
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {[
                customerName,
                [project.city, project.state].filter(Boolean).join(", "),
                project.budget_cents && `Budget ${money(project.budget_cents)}`,
                project.target_start && `Start ${shortDate(project.target_start)}`,
                project.target_end && `Finish ${shortDate(project.target_end)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          <Card>
            <SectionTitle
              action={
                <form action={startConversation}>
                  <input type="hidden" name="other_id" value={project.customer_id} />
                  <SubmitButton variant="secondary" small pendingText="Opening…">
                    Message customer
                  </SubmitButton>
                </form>
              }
            >
              What the customer wants
            </SectionTitle>
            <p className="whitespace-pre-wrap text-stone-700">
              {project.description || "No description provided."}
            </p>
            {request.message && (
              <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
                <span className="font-medium">Note to you:</span> {request.message}
              </p>
            )}
            {(photos ?? []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {(photos ?? []).map((p) => (
                  <a
                    key={p.id}
                    href={photoUrl(p.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="block size-24 overflow-hidden rounded-lg border border-stone-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.storage_path)} alt="Project photo" className="size-full object-cover" />
                  </a>
                ))}
              </div>
            )}
          </Card>

          {/* --------------------------------------------------- Current quote */}
          {quote && (
            <Card>
              <SectionTitle action={<StatusBadge status={quote.status} />}>
                {isAccepted ? "Your accepted quote" : "Your quote"}
              </SectionTitle>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p className="text-2xl font-bold tabular-nums">{money(total)}</p>
                <p className="text-sm text-stone-600">
                  You keep about {money(total - fee - subTotal)} after the {PLATFORM_FEE_BPS / 100}%
                  platform fee and Stripe&apos;s card processing ({processingFeeLabel} per payment)
                  {subTotal > 0 && `, and ${money(subTotal)} you pay your subs`}
                </p>
              </div>
              {quote.timeline && <p className="mt-1 text-sm text-stone-600">Timeline: {quote.timeline}</p>}
              {quote.scope && <p className="mt-2 text-sm whitespace-pre-wrap text-stone-700">{quote.scope}</p>}

              <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
                {milestones.map((m, i) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-stone-900">
                        {i + 1}. {m.title}
                      </p>
                      {isAccepted && (
                        <div className="mt-1">
                          <StatusBadge kind="milestone" status={m.status} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{money(m.amount_cents)}</span>
                      {isAccepted && m.status === "pending" && canBill && (
                        <form action={sendMilestoneBill}>
                          <input type="hidden" name="milestone_id" value={m.id} />
                          <input type="hidden" name="request_id" value={id} />
                          <SubmitButton
                            small
                            pendingText="Sending…"
                            confirm={`Send the customer the bill for "${m.title}" (${money(m.amount_cents)})?`}
                          >
                            Send bill
                          </SubmitButton>
                        </form>
                      )}
                      {isAccepted && m.status === "billed" && (
                        <form action={sendMilestoneBill}>
                          <input type="hidden" name="milestone_id" value={m.id} />
                          <input type="hidden" name="request_id" value={id} />
                          <input type="hidden" name="mode" value="recall" />
                          <SubmitButton small variant="ghost" pendingText="Recalling…">
                            Recall bill
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                    {disputeFor.has(m.id) && disputeFor.get(m.id)?.status !== "withdrawn" && (
                      <DisputePanel
                        dispute={disputeFor.get(m.id) as Dispute}
                        role="pro"
                        amountCents={Number(m.amount_cents)}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {isAccepted && milestones.some((m) => m.status === "pending") && (
                <p className="mt-2 text-xs text-stone-500">
                  {canBill ? (
                    <>
                      Send each bill when it comes due. The customer approves the work and pays, and
                      the money goes straight to your Stripe account, less the platform fee.
                    </>
                  ) : (
                    <>
                      <Link href="/pro/billing" className="font-semibold text-brand-700 hover:underline">
                        Finish payment setup
                      </Link>{" "}
                      to send bills on this job.
                    </>
                  )}
                </p>
              )}
            </Card>
          )}

          {/* --------------------------------------------------- Quote form */}
          {canQuote && (
            <Card>
              <SectionTitle>{quote ? "Send a revised quote" : "Send a quote"}</SectionTitle>
              {quote && (
                <p className="mb-3 text-sm text-stone-500">
                  A new quote replaces the one above. Subs you invited will need to be invited again.
                </p>
              )}
              <form action={submitQuote} className="space-y-4">
                <input type="hidden" name="request_id" value={id} />
                <Field label="Scope of work" hint="What is included, what is not, and any assumptions.">
                  <textarea name="scope" rows={5} required className={inputCls} />
                </Field>
                <Field label="Timeline" hint="e.g. Can start in 2 weeks; about 5 working days on site.">
                  <input name="timeline" maxLength={200} className={inputCls} />
                </Field>
                <div>
                  <p className="mb-1 text-sm font-medium text-stone-800">Payment milestones</p>
                  <p className="mb-2 text-xs text-stone-500">
                    Milestones are the payment schedule the customer sees. You send the bill for
                    each one when it comes due, and they approve the work and pay.
                  </p>
                  <MilestoneEditor
                    feeBps={PLATFORM_FEE_BPS}
                    processingBps={PROCESSING_FEE_BPS}
                    processingFixedCents={PROCESSING_FEE_FIXED_CENTS}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <SubmitButton pendingText="Sending…">{quote ? "Send revised quote" : "Send quote"}</SubmitButton>
                </div>
              </form>
              <form action={declineRequest} className="mt-3 border-t border-stone-100 pt-3 text-right">
                <input type="hidden" name="request_id" value={id} />
                <SubmitButton variant="ghost" small confirm="Decline this request?">
                  Not a fit? Decline this request
                </SubmitButton>
              </form>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------- Subs */}
        <aside className="space-y-4">
          <Card>
            <SectionTitle>Subs on this job</SectionTitle>
            {!quote ? (
              <p className="text-sm text-stone-500">Send a quote first, then add the subs you want on it.</p>
            ) : (
              <>
                {(subs ?? []).length === 0 ? (
                  <p className="text-sm text-stone-500">No subs added yet.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {(subs ?? []).map((s) => {
                      const mine = (myRatings ?? []).find((r) => r.sub_id === s.sub_id);
                      return (
                        <li key={s.id} className="py-3 first:pt-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Link href={`/pros/${s.sub_id}`} className="font-medium text-stone-900 hover:text-brand-700">
                                {subPros.get(s.sub_id)?.business_name || "Pro"}
                              </Link>
                              <p className="text-sm text-stone-600">
                                {money(s.amount_cents)}
                                {s.scope && ` · ${s.scope}`}
                              </p>
                            </div>
                            <StatusBadge status={s.status} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <form action={startConversation}>
                              <input type="hidden" name="other_id" value={s.sub_id} />
                              <SubmitButton variant="secondary" small pendingText="Opening…">
                                Message
                              </SubmitButton>
                            </form>
                            {s.status !== "declined" && (
                              <form action={removeSub}>
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="request_id" value={id} />
                                <SubmitButton variant="ghost" small confirm="Remove this sub from the job?">
                                  Remove
                                </SubmitButton>
                              </form>
                            )}
                          </div>
                          {(subBills ?? [])
                            .filter((b) => b.project_sub_id === s.id)
                            .map((b) => (
                              <div
                                key={b.id}
                                className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                              >
                                <div>
                                  <p className="font-medium text-stone-900 tabular-nums">
                                    Bill: {money(b.amount_cents)}
                                  </p>
                                  <p className="text-xs text-stone-500">
                                    {shortDate(b.created_at)}
                                    {b.note && ` · ${b.note}`}
                                  </p>
                                </div>
                                {b.status === "paid" ? (
                                  <Badge tone="green">Paid</Badge>
                                ) : (
                                  <form action={paySubBill}>
                                    <input type="hidden" name="bill_id" value={b.id} />
                                    <input type="hidden" name="request_id" value={id} />
                                    <SubmitButton small pendingText="Opening checkout…">
                                      Pay
                                    </SubmitButton>
                                  </form>
                                )}
                              </div>
                            ))}
                          {isAccepted && s.status === "accepted" && (
                            <form action={submitSubRating} className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3">
                              <input type="hidden" name="project_sub_id" value={s.id} />
                              <input type="hidden" name="request_id" value={id} />
                              <p className="flex items-center gap-2 text-xs font-medium text-stone-700">
                                Rate this sub <Badge tone="green">Verified</Badge>
                              </p>
                              <select
                                name="rating"
                                required
                                aria-label="Rating"
                                defaultValue={mine ? String(mine.rating) : ""}
                                className={inputCls}
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
                                rows={2}
                                aria-label="Comments"
                                defaultValue={mine?.body ?? ""}
                                placeholder="Quality, reliability, communication"
                                className={inputCls}
                              />
                              <SubmitButton variant="secondary" small pendingText="Saving…">
                                {mine ? "Update rating" : "Save rating"}
                              </SubmitButton>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {["submitted", "accepted"].includes(quote.status) && (
                  <div className="mt-4 border-t border-stone-100 pt-4">
                    <p className="mb-2 text-sm font-medium text-stone-800">Add a sub</p>
                    <form className="mb-3 flex gap-2">
                      <input
                        name="sub_q"
                        defaultValue={subQuery}
                        aria-label="Search all pros"
                        placeholder="Search all pros by name, trade, or city"
                        className={inputCls}
                      />
                      <button className="rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 hover:bg-stone-50">
                        Search
                      </button>
                    </form>
                    {subQuery && searchOptions.length === 0 && (
                      <p className="mb-3 text-sm text-stone-500">
                        No other pros match &ldquo;{subQuery}&rdquo;.{" "}
                        <Link href="/pros" className="font-semibold text-brand-700 hover:underline">
                          Browse all pros
                        </Link>
                      </p>
                    )}
                    {favoriteOptions.length + searchOptions.length === 0 ? (
                      <p className="text-sm text-stone-500">
                        Search for any pro on the platform above. Pros you save as favorites show up
                        here without searching.
                      </p>
                    ) : (
                      <form action={inviteSub} className="space-y-3">
                        <input type="hidden" name="request_id" value={id} />
                        <input type="hidden" name="quote_id" value={quote.id} />
                        <select
                          name="sub_id"
                          required
                          defaultValue={searchOptions.length === 1 ? searchOptions[0] : ""}
                          aria-label="Sub"
                          className={inputCls}
                        >
                          <option value="" disabled>
                            Choose a pro
                          </option>
                          {searchOptions.length > 0 && (
                            <optgroup label="Search results">
                              {searchOptions.map((pid) => (
                                <option key={pid} value={pid}>
                                  {subLabel(pid)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {favoriteOptions.length > 0 && (
                            <optgroup label="Your favorites">
                              {favoriteOptions.map((pid) => (
                                <option key={pid} value={pid}>
                                  {subLabel(pid)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <input name="scope" aria-label="Scope" placeholder="Their part of the job, e.g. rough plumbing" className={inputCls} />
                        <input name="amount" required aria-label="Amount" inputMode="decimal" placeholder="$ amount they are paid" className={inputCls} />
                        <p className="text-xs text-stone-500">
                          Paid automatically from each milestone, in proportion to its size. About{" "}
                          {money(Math.max(0, total - fee - subTotal))} is still unassigned on this quote.
                        </p>
                        <SubmitButton variant="dark" className="w-full" pendingText="Inviting…">
                          Invite to this job
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
