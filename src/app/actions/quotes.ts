"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer, requirePro } from "@/lib/auth";
import { displayName, notify, projectTitle } from "@/lib/email";
import {
  cleanEstimate,
  cleanTemplate,
  customerBreakdown,
  isItemized,
  parseJson,
  totals,
  type TemplateData,
} from "@/lib/estimate";
import { flash, money, text, toCents } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

// Quotes and milestones are written with the service-role client, so every action
// here first checks that the signed-in user is the right party.

/** Pro submits (or revises) a quote with its payment milestones. */
export async function submitQuote(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  const back = `/pro/jobs/${requestId}`;

  const { data: request } = await admin
    .from("quote_requests")
    .select("id, project_id, pro_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.pro_id !== viewer.id) flash("/pro/jobs", "error", "Request not found.");
  if (!["pending", "quoted"].includes(request.status)) {
    flash(back, "error", "This request is no longer open for quotes.");
  }

  const titles = formData.getAll("milestone_title").map((v) => text(v));
  const amounts = formData.getAll("milestone_amount").map((v) => toCents(v));
  const milestones = titles
    .map((title, i) => ({ title, amount_cents: amounts[i] ?? 0, sort: i }))
    .filter((m) => m.title || m.amount_cents);
  if (!milestones.length) flash(back, "error", "Add at least one milestone.");
  if (milestones.some((m) => !m.title || m.amount_cents < 100)) {
    flash(back, "error", "Every milestone needs a name and an amount of at least $1.");
  }
  const total = milestones.reduce((sum, m) => sum + m.amount_cents, 0);

  // The estimate arrives from the browser, so it is cleaned and totalled again here.
  const estimate = cleanEstimate(parseJson(formData.get("estimate")));
  const itemized = formData.get("itemized") === "true" && isItemized(estimate);
  if (!itemized) estimate.sections = [];
  if (itemized && totals(estimate).total !== total) {
    flash(
      back,
      "error",
      `The milestones add up to ${money(total)} but the estimate comes to ${money(totals(estimate).total)}. Make the milestone shares add up to 100%.`,
    );
  }
  const scope = text(formData.get("scope"));
  const timeline = text(formData.get("timeline"));

  // A revised quote replaces the earlier one, along with any sub invites made on it.
  const { data: replaced } = await admin
    .from("quotes")
    .update({ status: "withdrawn" })
    .eq("request_id", requestId)
    .eq("status", "submitted")
    .select("id");
  if (replaced?.length) {
    await admin
      .from("project_subs")
      .update({ status: "removed" })
      .in("quote_id", replaced.map((q) => q.id));
  }

  const { data: quote, error } = await admin
    .from("quotes")
    .insert({
      request_id: requestId,
      project_id: request.project_id,
      pro_id: viewer.id,
      amount_cents: total,
      timeline,
      scope,
      breakdown: customerBreakdown(estimate),
    })
    .select("id")
    .single();
  if (error || !quote) flash(back, "error", error?.message ?? "Could not save the quote.");

  await admin.from("milestones").insert(
    milestones.map((m) => ({ ...m, quote_id: quote.id, project_id: request.project_id })),
  );
  await admin.from("quote_requests").update({ status: "quoted" }).eq("id", requestId);

  // The pro's private working copy, so a revised quote can start from this one.
  const template: TemplateData = {
    estimate,
    scope,
    timeline,
    milestones: milestones.map((m) => ({
      title: m.title,
      amountCents: m.amount_cents,
      pct: Math.round((m.amount_cents / total) * 10000) / 100,
    })),
  };
  await admin.from("quote_estimates").insert({ quote_id: quote.id, pro_id: viewer.id, data: template });
  const templateName = text(formData.get("template_name")).slice(0, 80);
  if (templateName) {
    await admin.from("estimate_templates").insert({ pro_id: viewer.id, name: templateName, data: template });
  }

  const { data: project } = await admin
    .from("projects")
    .select("title, customer_id")
    .eq("id", request.project_id)
    .single();
  await notify(project?.customer_id, {
    subject: `New quote for ${project?.title}: ${money(total)}`,
    lines: [
      `${await displayName(viewer.id)} sent a quote of ${money(total)} for "${project?.title}".`,
      "Open your project to see the scope, timeline, and payment milestones, and to compare it with your other quotes.",
    ],
    path: `/projects/${request.project_id}`,
    cta: "Review the quote",
  });

  flash(
    back,
    "notice",
    templateName ? `Quote sent to the customer, and saved as the template "${templateName}".` : "Quote sent to the customer.",
  );
}

export async function declineRequest(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const requestId = text(formData.get("request_id"));
  const { data: declined } = await admin
    .from("quote_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .eq("pro_id", viewer.id)
    .in("status", ["pending", "quoted"])
    .select("project_id")
    .maybeSingle();
  if (declined) {
    const { data: project } = await admin
      .from("projects")
      .select("title, customer_id")
      .eq("id", declined.project_id)
      .single();
    await notify(project?.customer_id, {
      subject: `${await displayName(viewer.id)} can't take on ${project?.title}`,
      lines: [
        `${await displayName(viewer.id)} declined your quote request for "${project?.title}".`,
        "You can request quotes from other pros at any time.",
      ],
      path: `/pros?project=${declined.project_id}`,
      cta: "Find other pros",
    });
  }
  await admin
    .from("quotes")
    .update({ status: "withdrawn" })
    .eq("request_id", requestId)
    .eq("pro_id", viewer.id)
    .eq("status", "submitted");
  flash("/pro/jobs", "notice", "Request declined.");
}

/** Customer accepts a quote: it joins the project and its budget. */
export async function acceptQuote(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const quoteId = text(formData.get("quote_id"));

  const { data: quote } = await admin
    .from("quotes")
    .select("id, request_id, project_id, pro_id, amount_cents, status")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) flash("/projects", "error", "Quote not found.");
  const back = `/projects/${quote.project_id}`;

  const { data: project } = await admin
    .from("projects")
    .select("id, customer_id")
    .eq("id", quote.project_id)
    .maybeSingle();
  if (!project || project.customer_id !== viewer.id) flash("/projects", "error", "Quote not found.");
  if (quote.status !== "submitted") flash(back, "error", "This quote can no longer be accepted.");

  const { data: pro } = await admin
    .from("pro_profiles")
    .select("business_name")
    .eq("user_id", quote.pro_id)
    .single();

  await admin.from("quotes").update({ status: "accepted" }).eq("id", quote.id);
  await admin.from("quote_requests").update({ status: "accepted" }).eq("id", quote.request_id);
  await admin.from("projects").update({ status: "in_progress" }).eq("id", quote.project_id);
  await admin.from("budget_items").upsert(
    {
      project_id: quote.project_id,
      quote_id: quote.id,
      label: pro?.business_name || "Accepted quote",
      planned_cents: quote.amount_cents,
    },
    { onConflict: "quote_id" },
  );

  await notify(quote.pro_id, {
    subject: `Your quote was accepted: ${await projectTitle(quote.project_id)}`,
    lines: [
      `${viewer.fullName || "The customer"} accepted your quote of ${money(quote.amount_cents)} for "${await projectTitle(quote.project_id)}".`,
      "Send the bill for each milestone from the job page when it comes due. Finish payment setup first so the customer can pay you.",
    ],
    path: `/pro/jobs/${quote.request_id}`,
    cta: "Open the job",
  });
  flash(back, "notice", "Quote accepted and added to your budget. Pay the first milestone to get started.");
}

export async function rejectQuote(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const quoteId = text(formData.get("quote_id"));
  const { data: quote } = await admin
    .from("quotes")
    .select("id, request_id, project_id, pro_id, status")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return;
  const { data: project } = await admin
    .from("projects")
    .select("customer_id")
    .eq("id", quote.project_id)
    .maybeSingle();
  if (project?.customer_id !== viewer.id || quote.status !== "submitted") return;

  await admin.from("quotes").update({ status: "rejected" }).eq("id", quote.id);
  await admin.from("quote_requests").update({ status: "closed" }).eq("id", quote.request_id);
  await notify(quote.pro_id, {
    subject: `Update on your quote for ${await projectTitle(quote.project_id)}`,
    lines: [`The customer decided not to go ahead with your quote for "${await projectTitle(quote.project_id)}".`],
    path: "/pro/jobs",
    cta: "See your leads",
  });
  revalidatePath(`/projects/${quote.project_id}`);
}

/** Create or update a saved estimate template from the template editor. */
export async function saveTemplate(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const id = text(formData.get("template_id"));
  const back = id ? `/pro/templates/${id}` : "/pro/templates/new";
  const name = text(formData.get("name")).slice(0, 80);
  if (!name) flash(back, "error", "Give the template a name.");

  const estimate = cleanEstimate(parseJson(formData.get("estimate")));
  if (formData.get("itemized") !== "true") estimate.sections = [];
  const titles = formData.getAll("milestone_title").map((v) => text(v));
  const amounts = formData.getAll("milestone_amount").map((v) => toCents(v));
  const sum = amounts.reduce((a, b) => a + b, 0);
  // An itemized template sends each milestone's share directly, which still works when no prices are filled in yet.
  const shares = formData.getAll("milestone_pct").map((v) => parseFloat(String(v)) || 0);
  const data = cleanTemplate({
    estimate,
    scope: text(formData.get("scope")),
    timeline: text(formData.get("timeline")),
    milestones: titles
      .map((title, i) => ({
        title,
        amountCents: amounts[i] ?? 0,
        pct:
          shares.length === titles.length
            ? shares[i]
            : sum
              ? Math.round(((amounts[i] ?? 0) / sum) * 10000) / 100
              : Math.round(10000 / titles.length) / 100,
      }))
      .filter((m) => m.title),
  });

  if (id) {
    const { error } = await admin
      .from("estimate_templates")
      .update({ name, data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("pro_id", viewer.id);
    if (error) flash(back, "error", error.message);
  } else {
    const { count } = await admin
      .from("estimate_templates")
      .select("id", { count: "exact", head: true })
      .eq("pro_id", viewer.id);
    if ((count ?? 0) >= 100) flash("/pro/templates", "error", "You have 100 templates. Delete one before adding another.");
    const { error } = await admin.from("estimate_templates").insert({ pro_id: viewer.id, name, data });
    if (error) flash(back, "error", error.message);
  }
  revalidatePath("/pro/templates");
  flash("/pro/templates", "notice", `Template "${name}" saved.`);
}

export async function deleteTemplate(formData: FormData) {
  const viewer = await requirePro();
  await createAdminClient()
    .from("estimate_templates")
    .delete()
    .eq("id", text(formData.get("template_id")))
    .eq("pro_id", viewer.id);
  revalidatePath("/pro/templates");
  flash("/pro/templates", "notice", "Template deleted.");
}
