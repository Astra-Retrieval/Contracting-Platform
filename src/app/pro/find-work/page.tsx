import Link from "next/link";
import { offerQuote } from "@/app/actions/projects";
import { PhotoStrip } from "@/components/photo-picker";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ButtonLink, Card, Empty, Flash, PageHeader, buttonCls, inputCls, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { getCategories } from "@/lib/data";
import { money, shortDate } from "@/lib/format";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Find work" };

type OpenProject = {
  id: string;
  title: string;
  description: string;
  category_id: number | null;
  city: string;
  state: string;
  budget_cents: number | null;
  target_start: string | null;
  target_end: string | null;
  created_at: string;
};

const clean = (s: string) => s.replace(/[,()%*\\"']/g, " ").trim();
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** Open projects any pro can offer to quote. */
export default async function FindWorkPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const q = clean(one(params.q));
  const location = clean(one(params.location));
  const categorySlug = one(params.category);

  const supabase = await createClient();
  const [categories, { data: pro }, { data: mine }] = await Promise.all([
    getCategories(supabase),
    supabase.from("pro_profiles").select("is_listed, city, state").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("quote_requests").select("id, project_id").eq("pro_id", viewer.id),
  ]);
  const category = categories.find((c) => c.slug === categorySlug);
  const member = !isStripeConfigured || Boolean(pro?.is_listed);

  // Row-level security shows a pro every open project the customer left open to pros.
  let query = supabase
    .from("projects")
    .select("id, title, description, category_id, city, state, budget_cents, target_start, target_end, created_at")
    .eq("status", "open")
    .eq("open_to_pros", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (category) query = query.eq("category_id", category.id);
  if (q) {
    const words = q.split(/\s+/).filter((w) => w.length >= 3);
    const terms = words.length ? words : [q];
    query = query.or(terms.flatMap((t) => [`title.ilike.%${t}%`, `description.ilike.%${t}%`]).join(","));
  }
  if (location) query = query.or(`city.ilike.%${location}%,state.ilike.${location}`);

  const { data } = await query;
  const projects = (data ?? []) as OpenProject[];
  const { data: photos } = projects.length
    ? await supabase
        .from("project_photos")
        .select("project_id, storage_path")
        .in("project_id", projects.map((p) => p.id))
        .order("created_at")
    : { data: [] };

  const requestFor = new Map((mine ?? []).map((r) => [r.project_id, r.id]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const photosFor = (id: string) =>
    (photos ?? []).filter((p) => p.project_id === id).map((p) => p.storage_path).slice(0, 6);
  const filtered = Boolean(q || location || category);

  return (
    <div className="page">
      <Flash params={params} />
      <PageHeader
        title="Find work"
        subtitle="Open projects from customers. Pick the ones you want and send a quote."
      />

      {!member && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-brand-300 bg-brand-50">
          <p className="text-sm text-stone-700">
            You can browse open projects now. Start your membership to send quotes.
          </p>
          <ButtonLink href="/pro/billing" small>
            Start membership
          </ButtonLink>
        </Card>
      )}

      <form className="mb-6 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input
          name="q"
          defaultValue={q}
          aria-label="Search projects"
          placeholder="Search, e.g. deck, bathroom, fence"
          className={inputCls}
        />
        <select name="category" defaultValue={categorySlug} aria-label="Trade" className={inputCls}>
          <option value="">Any trade</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          name="location"
          defaultValue={location}
          aria-label="City or state"
          placeholder={pro?.state ? `City or state, e.g. ${pro.state}` : "City or state"}
          className={inputCls}
        />
        <button className={buttonCls("primary")}>Search</button>
      </form>

      {projects.length === 0 ? (
        <Empty title={filtered ? "No open projects match that search" : "No open projects right now"}>
          {filtered ? (
            <Link href="/pro/find-work" className="font-semibold text-brand-700 hover:underline">
              Clear the search
            </Link>
          ) : (
            "New projects appear here as customers post them. Customers can also invite you directly, which shows under Leads & jobs."
          )}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => {
            const requestId = requestFor.get(p.id);
            return (
              <li key={p.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-stone-900">{p.title}</h2>
                      <p className="mt-0.5 text-sm text-stone-500">
                        {[
                          p.category_id && categoryName.get(p.category_id),
                          [p.city, p.state].filter(Boolean).join(", "),
                          `Posted ${shortDate(p.created_at)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.budget_cents ? (
                        <span className="text-right text-sm text-stone-500">
                          Budget{" "}
                          <span className="block text-lg font-bold text-stone-900 tabular-nums">
                            {money(p.budget_cents)}
                          </span>
                        </span>
                      ) : (
                        <Badge>No budget given</Badge>
                      )}
                    </div>
                  </div>
                  {p.description && (
                    <p className="mt-3 line-clamp-4 max-w-3xl text-sm whitespace-pre-wrap text-stone-700">
                      {p.description}
                    </p>
                  )}
                  <PhotoStrip paths={photosFor(p.id)} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
                    <p className="text-sm text-stone-500">
                      {[
                        p.target_start && `Start ${shortDate(p.target_start)}`,
                        p.target_end && `Finish by ${shortDate(p.target_end)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Dates are flexible"}
                    </p>
                    {requestId ? (
                      <ButtonLink href={`/pro/jobs/${requestId}`} variant="secondary" small>
                        In your leads: open
                      </ButtonLink>
                    ) : (
                      <form action={offerQuote}>
                        <input type="hidden" name="project_id" value={p.id} />
                        <SubmitButton small pendingText="Opening…">
                          Quote this project
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
