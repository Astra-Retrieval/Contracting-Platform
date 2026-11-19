"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer, requirePro } from "@/lib/auth";
import { displayName, notify } from "@/lib/email";
import { flash, photoPaths, text, toCents } from "@/lib/format";
import { isStripeConfigured } from "@/lib/stripe";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const viewer = await requireCustomer();
  const supabase = await createClient();

  const title = text(formData.get("title"));
  if (!title) flash("/projects/new", "error", "Give your project a title.");
  const budget = toCents(formData.get("budget"));
  const category = Number(formData.get("category_id"));

  const { data, error } = await supabase
    .from("projects")
    .insert({
      customer_id: viewer.id,
      title,
      description: text(formData.get("description")),
      category_id: Number.isInteger(category) && category > 0 ? category : null,
      city: text(formData.get("city")),
      state: text(formData.get("state")).toUpperCase().slice(0, 2),
      budget_cents: budget || null,
      target_start: text(formData.get("target_start")) || null,
      target_end: text(formData.get("target_end")) || null,
      open_to_pros: formData.get("open_to_pros") === "on",
    })
    .select("id")
    .single();
  if (error || !data) flash("/projects/new", "error", error?.message ?? "Could not create the project.");

  const photos = photoPaths(formData, viewer.id, 12);
  if (photos.length) {
    await supabase
      .from("project_photos")
      .insert(photos.map((storage_path) => ({ project_id: data.id, storage_path })));
  }

  flash(`/projects/${data.id}`, "notice", "Project created. Next, request quotes from pros.");
}

/** Customer chooses whether pros can find the project in the open feed. */
export async function setProjectVisibility(formData: FormData) {
  const viewer = await requireCustomer();
  const supabase = await createClient();
  const id = text(formData.get("project_id"));
  const open = formData.get("open_to_pros") === "true";
  await supabase.from("projects").update({ open_to_pros: open }).eq("id", id).eq("customer_id", viewer.id);
  flash(
    `/projects/${id}`,
    "notice",
    open
      ? "Pros on Crew Orchard can now find this project and offer a quote."
      : "This project is now hidden from the open feed. Only pros you invite can see it.",
  );
}

/** A pro found the project in the open feed and wants to quote it. */
export async function offerQuote(formData: FormData) {
  const viewer = await requirePro();
  const projectId = text(formData.get("project_id"));
  const back = "/pro/find-work";
  const admin = createAdminClient();

  const [{ data: pro }, { data: project }] = await Promise.all([
    admin.from("pro_profiles").select("is_listed").eq("user_id", viewer.id).maybeSingle(),
    admin
      .from("projects")
      .select("id, title, status, open_to_pros, customer_id")
      .eq("id", projectId)
      .maybeSingle(),
  ]);
  // Quoting is a member benefit. Without Stripe connected there are no memberships yet.
  if (isStripeConfigured && !pro?.is_listed) {
    flash("/pro/billing", "error", "Start your membership to quote projects from the feed.");
  }
  if (!project || project.status !== "open" || !project.open_to_pros) {
    flash(back, "error", "That project is no longer open for quotes.");
  }

  const { data: existing } = await admin
    .from("quote_requests")
    .select("id")
    .eq("project_id", projectId)
    .eq("pro_id", viewer.id)
    .maybeSingle();
  if (existing) redirect(`/pro/jobs/${existing.id}`);

  const { data: request, error } = await admin
    .from("quote_requests")
    .insert({ project_id: projectId, pro_id: viewer.id, source: "pro" })
    .select("id")
    .single();
  if (error || !request) flash(back, "error", error?.message ?? "Could not open that project.");

  const name = await displayName(viewer.id);
  await notify(project.customer_id, {
    subject: `${name} wants to quote "${project.title}"`,
    lines: [
      `${name} found your project "${project.title}" and is preparing a quote.`,
      "You will get another email when the quote arrives. You can look at their profile and reviews in the meantime.",
    ],
    path: `/projects/${projectId}`,
    cta: "Open the project",
  });
  revalidatePath(back);
  flash(`/pro/jobs/${request.id}`, "notice", "This project is now in your leads. Send your quote below.");
}

export async function setProjectStatus(formData: FormData) {
  const viewer = await requireCustomer();
  const supabase = await createClient();
  const id = text(formData.get("project_id"));
  const status = text(formData.get("status"));
  if (!["open", "cancelled"].includes(status)) return;
  await supabase.from("projects").update({ status }).eq("id", id).eq("customer_id", viewer.id);
  revalidatePath(`/projects/${id}`);
}

export async function addProjectPhoto(projectId: string, path: string) {
  const viewer = await requireCustomer();
  if (!path.startsWith(`${viewer.id}/`)) return;
  const supabase = await createClient();
  await supabase.from("project_photos").insert({ project_id: projectId, storage_path: path });
  revalidatePath(`/projects/${projectId}`);
}

export async function requestQuote(formData: FormData) {
  const viewer = await requireCustomer();
  const supabase = await createClient();
  const projectId = text(formData.get("project_id"));
  const proId = text(formData.get("pro_id"));
  const back = `/pros/${proId}`;
  if (!projectId) flash(back, "error", "Choose a project first.");

  const { data: project } = await supabase
    .from("projects")
    .select("id, status, title")
    .eq("id", projectId)
    .eq("customer_id", viewer.id)
    .maybeSingle();
  if (!project) flash(back, "error", "Project not found.");
  if (["completed", "cancelled"].includes(project.status)) {
    flash(back, "error", "That project is closed.");
  }

  const { data: request, error } = await supabase
    .from("quote_requests")
    .insert({ project_id: projectId, pro_id: proId, message: text(formData.get("message")) })
    .select("id")
    .single();
  if (error) {
    flash(
      back,
      "error",
      error.code === "23505" ? "You already asked this pro for a quote on that project." : error.message,
    );
  }
  await notify(proId, {
    subject: `New quote request: ${project.title}`,
    lines: [
      `${viewer.fullName || "A customer"} has asked you for a quote on "${project.title}".`,
      "Open the request to see the details and send your price and payment milestones.",
    ],
    path: request ? `/pro/jobs/${request.id}` : "/pro/jobs",
    cta: "View the request",
  });
  flash(`/projects/${projectId}`, "notice", "Quote request sent.");
}

export async function addBudgetItem(formData: FormData) {
  await requireCustomer();
  const supabase = await createClient();
  const projectId = text(formData.get("project_id"));
  const label = text(formData.get("label"));
  const planned = toCents(formData.get("planned"));
  if (!label || planned <= 0) {
    flash(`/projects/${projectId}`, "error", "Enter a label and an amount for the budget line.");
  }
  // Row-level security rejects this unless the viewer owns the project.
  const { error } = await supabase
    .from("budget_items")
    .insert({ project_id: projectId, label, planned_cents: planned });
  if (error) flash(`/projects/${projectId}`, "error", error.message);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}#budget`);
}

export async function deleteBudgetItem(formData: FormData) {
  await requireCustomer();
  const supabase = await createClient();
  const projectId = text(formData.get("project_id"));
  await supabase
    .from("budget_items")
    .delete()
    .eq("id", text(formData.get("id")))
    .is("quote_id", null);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}#budget`);
}
