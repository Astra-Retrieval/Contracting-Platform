import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ProSummary = {
  user_id: string;
  business_name: string;
  headline: string;
  city: string;
  state: string;
  rating_avg: number;
  rating_count: number;
  sub_rating_avg: number;
  sub_rating_count: number;
  payouts_ready: boolean;
};

const PRO_SUMMARY =
  "user_id, business_name, headline, city, state, rating_avg, rating_count, sub_rating_avg, sub_rating_count, payouts_ready";

/** Look up pros by id and return them keyed by id. */
export async function prosById(supabase: Client, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ProSummary>();
  if (!unique.length) return map;
  const { data } = await supabase.from("pro_profiles").select(PRO_SUMMARY).in("user_id", unique);
  for (const row of (data ?? []) as ProSummary[]) map.set(row.user_id, row);
  return map;
}

/** Look up display names for any users (customers or pros), keyed by id. */
export async function namesById(supabase: Client, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const [{ data: people }, pros] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").in("id", unique),
    prosById(supabase, unique),
  ]);
  for (const p of people ?? []) {
    map.set(p.id, pros.get(p.id)?.business_name || p.full_name || "Member");
  }
  return map;
}

export async function getCategories(supabase: Client) {
  const { data } = await supabase.from("categories").select("id, slug, name").order("sort");
  return (data ?? []) as { id: number; slug: string; name: string }[];
}
