"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { notify } from "@/lib/email";
import { flash, text, toCents } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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
    })
    .select("id")
    .single();
  if (error || !data) flash("/projects/new", "error", error?.message ?? "Could not create the project.");

  flash(`/projects/${data.id}`, "notice", "Project created. Next, request quotes from pros.");
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
