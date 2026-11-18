import { cache } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type Role = "customer" | "pro";
export type Viewer = { id: string; email: string; role: Role; fullName: string; isAdmin: boolean };

/** The signed-in user, or null. Cached for the duration of one request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email ?? "",
    role: (profile?.role as Role) ?? "customer",
    fullName: profile?.full_name ?? "",
    isAdmin: Boolean(profile?.is_admin),
  };
});

export async function requireViewer(): Promise<Viewer> {
  if (!isSupabaseConfigured) redirect("/setup");
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requirePro(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "pro") redirect("/dashboard");
  return viewer;
}

/** Platform staff. Granted by setting profiles.is_admin = true in the database. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) redirect("/dashboard");
  return viewer;
}

export async function requireCustomer(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "customer") redirect("/dashboard");
  return viewer;
}
