"use server";

import { revalidatePath } from "next/cache";
import { requirePro } from "@/lib/auth";
import { flash, text, toInt } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function updateProProfile(formData: FormData) {
  const viewer = await requirePro();
  const supabase = await createClient();

  const businessName = text(formData.get("business_name"));
  if (!businessName) flash("/pro/profile", "error", "A business name is required.");

  const { error } = await supabase
    .from("pro_profiles")
    .update({
      business_name: businessName,
      headline: text(formData.get("headline")),
      bio: text(formData.get("bio")),
      city: text(formData.get("city")),
      state: text(formData.get("state")).toUpperCase().slice(0, 2),
      zip: text(formData.get("zip")),
      service_radius_miles: toInt(formData.get("service_radius_miles")),
      years_experience: toInt(formData.get("years_experience")),
      hourly_rate_min: toInt(formData.get("hourly_rate_min")),
      hourly_rate_max: toInt(formData.get("hourly_rate_max")),
      job_min: toInt(formData.get("job_min")),
      job_max: toInt(formData.get("job_max")),
      pricing_notes: text(formData.get("pricing_notes")),
      typical_timeline: text(formData.get("typical_timeline")),
      license_number: text(formData.get("license_number")),
      insured: formData.get("insured") === "on",
    })
    .eq("user_id", viewer.id);
  if (error) flash("/pro/profile", "error", error.message);

  const fullName = text(formData.get("full_name"));
  if (fullName) await supabase.from("profiles").update({ full_name: fullName }).eq("id", viewer.id);

  // Replace the category list with what was ticked.
  const categoryIds = formData.getAll("category").map((v) => Number(v)).filter(Number.isInteger);
  await supabase.from("pro_categories").delete().eq("pro_id", viewer.id);
  if (categoryIds.length) {
    await supabase
      .from("pro_categories")
      .insert(categoryIds.map((category_id) => ({ pro_id: viewer.id, category_id })));
  }

  revalidatePath("/pros");
  flash("/pro/profile", "notice", "Profile saved.");
}

export async function addPortfolioPhoto(path: string) {
  const viewer = await requirePro();
  if (!path.startsWith(`${viewer.id}/`)) return;
  const supabase = await createClient();
  await supabase.from("portfolio_photos").insert({ pro_id: viewer.id, storage_path: path });
  revalidatePath("/pro/profile");
}

export async function deletePortfolioPhoto(formData: FormData) {
  const viewer = await requirePro();
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("portfolio_photos")
    .select("id, storage_path")
    .eq("id", text(formData.get("id")))
    .eq("pro_id", viewer.id)
    .maybeSingle();
  if (photo) {
    await supabase.storage.from("photos").remove([photo.storage_path]);
    await supabase.from("portfolio_photos").delete().eq("id", photo.id);
  }
  revalidatePath("/pro/profile");
}
