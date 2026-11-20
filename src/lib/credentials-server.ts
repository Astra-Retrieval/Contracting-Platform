import { CREDENTIAL_COLUMNS, evaluate, type Credential } from "@/lib/credentials";
import { createAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;

/** A pro's trades and documents, read with the service role. */
export async function loadProDocs(admin: Admin, proId: string) {
  const [{ data: links }, { data: creds }] = await Promise.all([
    admin.from("pro_categories").select("categories (slug, name)").eq("pro_id", proId),
    admin.from("pro_credentials").select(CREDENTIAL_COLUMNS).eq("pro_id", proId).order("created_at"),
  ]);
  const trades = (links ?? [])
    .map((l) => l.categories as unknown as { slug: string; name: string } | null)
    .filter((c): c is { slug: string; name: string } => Boolean(c));
  return { trades, credentials: (creds ?? []) as Credential[] };
}

/** Recalculates the summary shown in search and on profiles. Call after any change. */
export async function refreshDocsStatus(proId: string, admin: Admin = createAdminClient()) {
  const { trades, credentials } = await loadProDocs(admin, proId);
  const result = evaluate(trades, credentials);
  await admin.from("pro_profiles").update({ docs_status: result.status }).eq("user_id", proId);
  return result;
}
