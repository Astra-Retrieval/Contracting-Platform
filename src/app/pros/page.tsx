import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Empty, PageHeader, Stars, buttonCls, inputCls, type SearchParams } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/config";
import { getCategories } from "@/lib/data";
import { photoUrl, rateRange } from "@/lib/format";
import { isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Find pros" };

type Pro = {
  user_id: string;
  business_name: string;
  headline: string;
  city: string;
  state: string;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  job_min: number | null;
  job_max: number | null;
  typical_timeline: string;
  insured: boolean;
  license_number: string;
  rating_avg: number;
  rating_count: number;
};

// Strip characters that have meaning inside a PostgREST filter string.
const clean = (s: string) => s.replace(/[,()%*\\"']/g, " ").trim();
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function ProsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) redirect("/setup");
  const params = await searchParams;
  const q = clean(one(params.q));
  const categorySlug = one(params.category);
  const location = clean(one(params.location));
  const minRating = Number(one(params.min_rating)) || 0;
  const maxRate = Number(one(params.max_rate)) || 0;
  const projectId = one(params.project);

  const supabase = await createClient();
  const categories = await getCategories(supabase);
  const category = categories.find((c) => c.slug === categorySlug);

  let query = supabase
    .from("pro_profiles")
    .select(
      "user_id, business_name, headline, city, state, hourly_rate_min, hourly_rate_max, job_min, job_max, typical_timeline, insured, license_number, rating_avg, rating_count",
    )
    .neq("business_name", "")
    .order("rating_avg", { ascending: false })
    .order("rating_count", { ascending: false })
    .limit(60);

  // Until Stripe is connected there are no subscriptions, so everyone is listed.
  if (isStripeConfigured) query = query.eq("is_listed", true);

  let empty = false;
  if (category) {
    const { data } = await supabase
      .from("pro_categories")
      .select("pro_id")
      .eq("category_id", category.id);
    const ids = (data ?? []).map((r) => r.pro_id);
    if (ids.length) query = query.in("user_id", ids);
    else empty = true;
  }

  if (q) {
    // Match any word against the profile text, or against a trade name.
    const words = q.split(/\s+/).filter((w) => w.length >= 3);
    const terms = words.length ? words : [q];
    const matchedCategoryIds = categories
      .filter((c) => terms.some((t) => c.name.toLowerCase().includes(t.toLowerCase())))
      .map((c) => c.id);
    let tradeProIds: string[] = [];
    if (matchedCategoryIds.length) {
      const { data } = await supabase
        .from("pro_categories")
        .select("pro_id")
        .in("category_id", matchedCategoryIds);
      tradeProIds = [...new Set((data ?? []).map((r) => r.pro_id as string))];
    }
    const clauses = terms.flatMap((t) => [
      `business_name.ilike.%${t}%`,
      `headline.ilike.%${t}%`,
      `bio.ilike.%${t}%`,
    ]);
    if (tradeProIds.length) clauses.push(`user_id.in.(${tradeProIds.join(",")})`);
    query = query.or(clauses.join(","));
  }
  if (location) {
    query = query.or(`city.ilike.%${location}%,state.ilike.${location},zip.eq.${location}`);
  }
  if (minRating) query = query.gte("rating_avg", minRating);
  if (maxRate) query = query.lte("hourly_rate_min", maxRate);

  const { data } = empty ? { data: [] } : await query;
  const pros = (data ?? []) as Pro[];
  const ids = pros.map((p) => p.user_id);

  const [{ data: links }, { data: photos }] = ids.length
    ? await Promise.all([
        supabase.from("pro_categories").select("pro_id, category_id").in("pro_id", ids),
        supabase
          .from("portfolio_photos")
          .select("pro_id, storage_path")
          .in("pro_id", ids)
          .order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const tradesByPro = new Map<string, string[]>();
  for (const l of links ?? []) {
    tradesByPro.set(l.pro_id, [...(tradesByPro.get(l.pro_id) ?? []), categoryName.get(l.category_id) ?? ""]);
  }
  const coverByPro = new Map<string, string>();
  for (const p of photos ?? []) if (!coverByPro.has(p.pro_id)) coverByPro.set(p.pro_id, p.storage_path);

  const suffix = projectId ? `?project=${projectId}` : "";

  return (
    <div className="page">
      <PageHeader
        title={category ? category.name : "Find pros"}
        subtitle={
          projectId
            ? "Open a profile to request a quote for your project."
            : "Contractors, subs and handymen. Filter by trade, location, rating and price."
        }
      />

      <form className="mb-6 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
        {projectId && <input type="hidden" name="project" value={projectId} />}
        <input
          name="q"
          defaultValue={q}
          aria-label="Keyword"
          placeholder="Keyword, e.g. tile"
          className={`${inputCls} lg:col-span-2`}
        />
        <select name="category" defaultValue={categorySlug} aria-label="Trade" className={inputCls}>
          <option value="">All trades</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          name="location"
          defaultValue={location}
          aria-label="City, state or ZIP"
          placeholder="City, state or ZIP"
          className={inputCls}
        />
        <select
          name="min_rating"
          defaultValue={minRating ? String(minRating) : ""}
          aria-label="Minimum rating"
          className={inputCls}
        >
          <option value="">Any rating</option>
          <option value="4.5">4.5 stars and up</option>
          <option value="4">4 stars and up</option>
          <option value="3">3 stars and up</option>
        </select>
        <div className="flex gap-2">
          <select
            name="max_rate"
            defaultValue={maxRate ? String(maxRate) : ""}
            aria-label="Maximum hourly rate"
            className={inputCls}
          >
            <option value="">Any rate</option>
            <option value="50">Up to $50/hr</option>
            <option value="75">Up to $75/hr</option>
            <option value="100">Up to $100/hr</option>
            <option value="150">Up to $150/hr</option>
          </select>
          <button className={buttonCls("dark")}>Search</button>
        </div>
      </form>

      {pros.length === 0 ? (
        <Empty title="No pros match those filters">
          Try a different trade or a wider location.{" "}
          <Link href={`/pros${suffix}`} className="font-semibold text-brand-700 hover:underline">
            Clear filters
          </Link>
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pros.map((pro) => {
            const cover = coverByPro.get(pro.user_id);
            const hourly = rateRange(pro.hourly_rate_min, pro.hourly_rate_max, "/hr");
            const jobs = rateRange(pro.job_min, pro.job_max);
            return (
              <li key={pro.user_id}>
                <Link href={`/pros/${pro.user_id}${suffix}`} className="group block h-full">
                  <Card className="h-full overflow-hidden p-0! transition-shadow group-hover:shadow-md">
                    <div className="aspect-[16/9] bg-stone-100">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl(cover)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-3xl font-bold text-stone-300">
                          {pro.business_name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-stone-900 group-hover:text-brand-700">
                        {pro.business_name}
                      </p>
                      {pro.headline && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">{pro.headline}</p>
                      )}
                      <div className="mt-2">
                        <Stars value={pro.rating_avg} count={pro.rating_count} />
                      </div>
                      <p className="mt-2 text-sm text-stone-600">
                        {[pro.city, pro.state].filter(Boolean).join(", ") || "Location not set"}
                        {hourly && ` · ${hourly}`}
                        {!hourly && jobs && ` · Jobs ${jobs}`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(tradesByPro.get(pro.user_id) ?? []).slice(0, 3).map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                        {pro.insured && <Badge tone="green">Insured</Badge>}
                        {pro.license_number && <Badge tone="blue">Licensed</Badge>}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
