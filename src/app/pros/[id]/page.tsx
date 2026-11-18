import { notFound, redirect } from "next/navigation";
import { startConversation } from "@/app/actions/messages";
import { requestQuote } from "@/app/actions/projects";
import { toggleFavorite } from "@/app/actions/subs";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  ButtonLink,
  Card,
  Field,
  Flash,
  SectionTitle,
  Stars,
  inputCls,
  type SearchParams,
} from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { namesById } from "@/lib/data";
import { photoUrl, rateRange, shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function ProPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  if (!isSupabaseConfigured) redirect("/setup");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const viewer = await getViewer();

  const { data: pro } = await supabase.from("pro_profiles").select("*").eq("user_id", id).maybeSingle();
  if (!pro) notFound();

  const [{ data: links }, { data: photos }, { data: reviews }, { data: subRatings }] = await Promise.all([
    supabase.from("pro_categories").select("category_id").eq("pro_id", id),
    supabase.from("portfolio_photos").select("id, storage_path, caption").eq("pro_id", id).order("created_at"),
    supabase
      .from("reviews")
      .select("id, reviewer_id, rating, body, created_at")
      .eq("pro_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("sub_ratings")
      .select("id, lead_pro_id, rating, body, created_at")
      .eq("sub_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", (links ?? []).map((l) => l.category_id));
  const names = await namesById(supabase, [
    ...(reviews ?? []).map((r) => r.reviewer_id),
    ...(subRatings ?? []).map((r) => r.lead_pro_id),
  ]);

  const isSelf = viewer?.id === id;
  const back = `/pros/${id}`;

  // What the viewer can do here depends on who they are.
  let myProjects: { id: string; title: string }[] = [];
  let isFavorite = false;
  if (viewer?.role === "customer") {
    const { data } = await supabase
      .from("projects")
      .select("id, title")
      .eq("customer_id", viewer.id)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });
    myProjects = data ?? [];
  } else if (viewer?.role === "pro" && !isSelf) {
    const { data } = await supabase
      .from("favorite_subs")
      .select("sub_id")
      .eq("pro_id", viewer.id)
      .eq("sub_id", id)
      .maybeSingle();
    isFavorite = Boolean(data);
  }
  const preselected = typeof query.project === "string" ? query.project : "";

  const hourly = rateRange(pro.hourly_rate_min, pro.hourly_rate_max, " per hour");
  const jobs = rateRange(pro.job_min, pro.job_max);
  const facts: [string, string][] = [
    ["Hourly rate", hourly],
    ["Typical job size", jobs],
    ["Typical timeline", pro.typical_timeline],
    ["Service area", pro.service_radius_miles ? `Within ${pro.service_radius_miles} miles` : ""],
    ["Experience", pro.years_experience ? `${pro.years_experience} years` : ""],
    ["License", pro.license_number],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="page">
      <Flash params={query} />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">{pro.business_name || "Unnamed pro"}</h1>
            {pro.headline && <p className="mt-1 text-lg text-stone-600">{pro.headline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Stars value={pro.rating_avg} count={pro.rating_count} />
              {pro.sub_rating_count > 0 && (
                <Stars value={pro.sub_rating_avg} count={pro.sub_rating_count} label="as a sub" />
              )}
              <span className="text-sm text-stone-600">
                {[pro.city, pro.state].filter(Boolean).join(", ")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(cats ?? []).map((c) => (
                <Badge key={c.id}>{c.name}</Badge>
              ))}
              {pro.insured && <Badge tone="green">Insured</Badge>}
              {pro.license_number && <Badge tone="blue">Licensed</Badge>}
            </div>
          </header>

          {(photos ?? []).length > 0 && (
            <section>
              <SectionTitle>Past work</SectionTitle>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(photos ?? []).map((p) => (
                  <li key={p.id} className="overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                    <a href={photoUrl(p.storage_path)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl(p.storage_path)}
                        alt={p.caption || "Photo of past work"}
                        loading="lazy"
                        className="aspect-square size-full object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pro.bio && (
            <section>
              <SectionTitle>About</SectionTitle>
              <p className="whitespace-pre-wrap text-stone-700">{pro.bio}</p>
            </section>
          )}

          {(facts.length > 0 || pro.pricing_notes) && (
            <section>
              <SectionTitle>Pricing and timeline</SectionTitle>
              <Card>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</dt>
                      <dd className="mt-0.5 font-medium text-stone-900">{value}</dd>
                    </div>
                  ))}
                </dl>
                {pro.pricing_notes && (
                  <p className="mt-4 border-t border-stone-100 pt-4 text-sm whitespace-pre-wrap text-stone-700">
                    {pro.pricing_notes}
                  </p>
                )}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle>Customer reviews</SectionTitle>
            {(reviews ?? []).length === 0 ? (
              <p className="text-sm text-stone-500">No customer reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {(reviews ?? []).map((r) => (
                  <li key={r.id}>
                    <Card>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Stars value={r.rating} />
                        <span className="text-xs text-stone-500">
                          {names.get(r.reviewer_id) ?? "Customer"} · {shortDate(r.created_at)}
                        </span>
                      </div>
                      {r.body && <p className="mt-2 text-sm whitespace-pre-wrap text-stone-700">{r.body}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(subRatings ?? []).length > 0 && (
            <section>
              <SectionTitle>Ratings from contractors</SectionTitle>
              <ul className="space-y-3">
                {(subRatings ?? []).map((r) => (
                  <li key={r.id}>
                    <Card>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Stars value={r.rating} />
                          <Badge tone="green">Verified: worked together</Badge>
                        </span>
                        <span className="text-xs text-stone-500">
                          {names.get(r.lead_pro_id) ?? "Contractor"} · {shortDate(r.created_at)}
                        </span>
                      </div>
                      {r.body && <p className="mt-2 text-sm whitespace-pre-wrap text-stone-700">{r.body}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {isSelf && (
            <Card>
              <p className="text-sm text-stone-600">This is your public profile.</p>
              <ButtonLink href="/pro/profile" variant="secondary" className="mt-3 w-full">
                Edit profile
              </ButtonLink>
            </Card>
          )}

          {!viewer && (
            <Card>
              <p className="font-semibold">Want a quote from {pro.business_name}?</p>
              <p className="mt-1 text-sm text-stone-600">Create a free account to describe your project.</p>
              <ButtonLink href="/signup" className="mt-3 w-full">
                Get started
              </ButtonLink>
              <ButtonLink href="/login" variant="ghost" className="mt-1 w-full">
                Sign in
              </ButtonLink>
            </Card>
          )}

          {viewer?.role === "customer" && (
            <Card>
              <p className="font-semibold">Request a quote</p>
              {myProjects.length === 0 ? (
                <>
                  <p className="mt-1 text-sm text-stone-600">
                    Create a project first, then send it to the pros you like.
                  </p>
                  <ButtonLink href="/projects/new" className="mt-3 w-full">
                    Create a project
                  </ButtonLink>
                </>
              ) : (
                <form action={requestQuote} className="mt-3 space-y-3">
                  <input type="hidden" name="pro_id" value={id} />
                  <Field label="Project">
                    <select name="project_id" defaultValue={preselected} required className={inputCls}>
                      {myProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Note to the pro" hint="Optional. They will also see your project details.">
                    <textarea name="message" rows={3} className={inputCls} />
                  </Field>
                  <SubmitButton className="w-full" pendingText="Sending…">
                    Send quote request
                  </SubmitButton>
                </form>
              )}
            </Card>
          )}

          {viewer && !isSelf && (
            <Card className="space-y-2">
              <form action={startConversation}>
                <input type="hidden" name="other_id" value={id} />
                <SubmitButton variant="secondary" className="w-full" pendingText="Opening…">
                  Message {pro.business_name || "this pro"}
                </SubmitButton>
              </form>
              {viewer.role === "pro" && (
                <form action={toggleFavorite}>
                  <input type="hidden" name="sub_id" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton variant={isFavorite ? "ghost" : "dark"} className="w-full">
                    {isFavorite ? "★ In your favorite subs (remove)" : "☆ Add to favorite subs"}
                  </SubmitButton>
                </form>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
