"use server";

import { redirect } from "next/navigation";
import { requireCustomer, requirePro } from "@/lib/auth";
import { APP_NAME, APP_URL, PRO_MONTHLY_PRICE_CENTS, TRIAL_DAYS, platformFee, subBillFee } from "@/lib/config";
import { displayName, notify, projectTitle } from "@/lib/email";
import { flash, money, text, toCents } from "@/lib/format";
import { createProAccount, proAccountSetupLink } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

const NOT_CONNECTED = "Payments are not connected yet. Add your Stripe keys to turn them on.";
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong with Stripe.");

type Admin = ReturnType<typeof createAdminClient>;

/** The Stripe account a pro is paid into, if it is ready to take payments. */
async function payableAccount(admin: Admin, proId: string) {
  const { data } = await admin
    .from("pro_billing")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", proId)
    .maybeSingle();
  return data?.stripe_account_id && data.payouts_enabled ? (data.stripe_account_id as string) : null;
}

// ---------------------------------------------------------------------------
// Milestone bills: pro sends, customer approves and pays
// ---------------------------------------------------------------------------

/** Lead pro sends (or recalls) the bill for a milestone that has come due. */
export async function sendMilestoneBill(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const milestoneId = text(formData.get("milestone_id"));
  const back = `/pro/jobs/${text(formData.get("request_id"))}`;
  const recall = formData.get("mode") === "recall";

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, quote_id, project_id, title, amount_cents")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) flash("/pro/jobs", "error", "Milestone not found.");
  const { data: quote } = await admin
    .from("quotes")
    .select("pro_id, status")
    .eq("id", milestone.quote_id)
    .maybeSingle();
  if (quote?.pro_id !== viewer.id) flash("/pro/jobs", "error", "Milestone not found.");

  if (recall) {
    const { data: recalled } = await admin
      .from("milestones")
      .update({ status: "pending", billed_at: null })
      .eq("id", milestoneId)
      .eq("status", "billed")
      .select("id")
      .maybeSingle();
    flash(back, recalled ? "notice" : "error", recalled ? "Bill recalled." : "This bill can no longer be recalled.");
  }

  if (quote.status !== "accepted") flash(back, "error", "The customer has not accepted this quote yet.");
  if (!isStripeConfigured) flash(back, "error", NOT_CONNECTED);
  if (!(await payableAccount(admin, viewer.id))) {
    flash("/pro/billing", "error", "Finish payment setup first so the customer can pay you.");
  }

  const { data: billed } = await admin
    .from("milestones")
    .update({ status: "billed", billed_at: new Date().toISOString() })
    .eq("id", milestoneId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!billed) flash(back, "error", "This milestone has already been billed.");

  const { data: project } = await admin
    .from("projects")
    .select("title, customer_id")
    .eq("id", milestone.project_id)
    .single();
  await notify(project?.customer_id, {
    subject: `Bill for ${money(milestone.amount_cents)}: ${milestone.title}`,
    lines: [
      `${await displayName(viewer.id)} sent you the bill for "${milestone.title}" on "${project?.title}": ${money(milestone.amount_cents)}.`,
      "Check the work, then approve and pay. If something is not right yet, message your pro before paying.",
    ],
    path: `/projects/${milestone.project_id}`,
    cta: "Review and pay",
  });
  flash(back, "notice", "Bill sent. The customer has been asked to approve the work and pay.");
}

/** Customer approves a billed milestone and pays it. The money goes straight to the pro. */
export async function payMilestone(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const milestoneId = text(formData.get("milestone_id"));

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, quote_id, project_id, title, amount_cents, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) flash("/projects", "error", "Milestone not found.");
  const back = `/projects/${milestone.project_id}`;

  const { data: project } = await admin
    .from("projects")
    .select("id, title, customer_id")
    .eq("id", milestone.project_id)
    .maybeSingle();
  if (!project || project.customer_id !== viewer.id) flash("/projects", "error", "Milestone not found.");

  const { data: quote } = await admin
    .from("quotes")
    .select("pro_id, status")
    .eq("id", milestone.quote_id)
    .single();
  if (quote?.status !== "accepted") flash(back, "error", "Accept the quote before paying.");
  if (milestone.status === "pending") flash(back, "error", "Your pro has not sent the bill for this milestone yet.");
  if (milestone.status !== "billed") flash(back, "error", "This milestone has already been paid.");
  if (!isStripeConfigured) flash(back, "error", NOT_CONNECTED);
  const accountId = await payableAccount(admin, quote.pro_id);
  if (!accountId) flash(back, "error", "This pro cannot take payments yet. Ask them to finish payment setup.");

  // Reuse the unpaid payment record if the customer abandoned an earlier checkout.
  let { data: payment } = await admin
    .from("payments")
    .select("id")
    .eq("milestone_id", milestoneId)
    .eq("status", "pending")
    .maybeSingle();
  if (!payment) {
    const created = await admin
      .from("payments")
      .insert({
        milestone_id: milestoneId,
        project_id: project.id,
        customer_id: viewer.id,
        pro_id: quote.pro_id,
        amount_cents: milestone.amount_cents,
      })
      .select("id")
      .single();
    payment = created.data;
  }
  if (!payment) flash(back, "error", "Could not start the payment.");

  let url: string | null = null;
  let failure: string | null = null;
  try {
    const metadata = { kind: "milestone", payment_id: payment.id, milestone_id: milestone.id };
    // Charged on the pro's own Stripe account; the platform fee comes off the top.
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: viewer.email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Number(milestone.amount_cents),
              product_data: { name: `${project.title}: ${milestone.title}` },
            },
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee(Number(milestone.amount_cents)),
          metadata,
        },
        metadata,
        success_url: `${APP_URL}${back}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}${back}`,
      },
      { stripeAccount: accountId },
    );
    await admin
      .from("payments")
      .update({ stripe_checkout_session_id: session.id, stripe_account_id: accountId })
      .eq("id", payment.id);
    url = session.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash(back, "error", failure ?? "Could not start the payment.");
  redirect(url);
}

// ---------------------------------------------------------------------------
// Sub bills: sub sends, lead contractor pays
// ---------------------------------------------------------------------------

/** A sub bills the lead contractor for some or all of their agreed amount. */
export async function sendSubBill(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const back = "/pro/subs";
  const amount = toCents(formData.get("amount"));

  const { data: role } = await admin
    .from("project_subs")
    .select("id, project_id, quote_id, lead_pro_id, sub_id, amount_cents, status")
    .eq("id", text(formData.get("project_sub_id")))
    .maybeSingle();
  if (!role || role.sub_id !== viewer.id || role.status !== "accepted") {
    flash(back, "error", "You can only bill for jobs you have accepted.");
  }
  const { data: quote } = await admin.from("quotes").select("status").eq("id", role.quote_id).maybeSingle();
  if (quote?.status !== "accepted") flash(back, "error", "The customer has not accepted this job yet.");
  if (!isStripeConfigured) flash(back, "error", NOT_CONNECTED);
  if (!(await payableAccount(admin, viewer.id))) {
    flash("/pro/billing", "error", "Finish payment setup first so the contractor can pay you.");
  }

  const { data: earlier } = await admin
    .from("sub_bills")
    .select("amount_cents")
    .eq("project_sub_id", role.id)
    .in("status", ["billed", "paid"]);
  const left = Number(role.amount_cents) - (earlier ?? []).reduce((sum, b) => sum + Number(b.amount_cents), 0);
  if (amount < 100) flash(back, "error", "Enter the amount you are billing.");
  if (amount > left) {
    flash(back, "error", `You have ${money(left)} left to bill on this job. Ask the contractor to raise your amount if the work grew.`);
  }

  const { error } = await admin.from("sub_bills").insert({
    project_sub_id: role.id,
    project_id: role.project_id,
    sub_id: viewer.id,
    lead_pro_id: role.lead_pro_id,
    note: text(formData.get("note")),
    amount_cents: amount,
  });
  if (error) flash(back, "error", error.message);

  const { data: request } = await admin
    .from("quote_requests")
    .select("id")
    .eq("project_id", role.project_id)
    .eq("pro_id", role.lead_pro_id)
    .maybeSingle();
  await notify(role.lead_pro_id, {
    subject: `Bill for ${money(amount)} from ${await displayName(viewer.id)}`,
    lines: [
      `${await displayName(viewer.id)} sent you a bill of ${money(amount)} for their work on "${await projectTitle(role.project_id)}".`,
      "Open the job to review and pay it.",
    ],
    path: request ? `/pro/jobs/${request.id}` : "/pro/jobs",
    cta: "Review and pay",
  });
  flash(back, "notice", "Bill sent to the contractor.");
}

/** A sub takes back a bill that has not been paid. */
export async function cancelSubBill(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const { data: cancelled } = await admin
    .from("sub_bills")
    .update({ status: "cancelled" })
    .eq("id", text(formData.get("bill_id")))
    .eq("sub_id", viewer.id)
    .eq("status", "billed")
    .select("id")
    .maybeSingle();
  flash("/pro/subs", cancelled ? "notice" : "error", cancelled ? "Bill cancelled." : "This bill can no longer be cancelled.");
}

/** Lead contractor pays a sub's bill. The money goes straight to the sub. */
export async function paySubBill(formData: FormData) {
  const viewer = await requirePro();
  const admin = createAdminClient();
  const back = `/pro/jobs/${text(formData.get("request_id"))}`;

  const { data: bill } = await admin
    .from("sub_bills")
    .select("id, project_id, sub_id, lead_pro_id, amount_cents, status")
    .eq("id", text(formData.get("bill_id")))
    .maybeSingle();
  if (!bill || bill.lead_pro_id !== viewer.id) flash("/pro/jobs", "error", "Bill not found.");
  if (bill.status !== "billed") flash(back, "error", "This bill has already been paid or cancelled.");
  if (!isStripeConfigured) flash(back, "error", NOT_CONNECTED);
  const accountId = await payableAccount(admin, bill.sub_id);
  if (!accountId) flash(back, "error", "This sub cannot take payments yet. Ask them to finish payment setup.");

  let url: string | null = null;
  let failure: string | null = null;
  try {
    const metadata = { kind: "sub_bill", sub_bill_id: bill.id };
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: viewer.email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: Number(bill.amount_cents),
              product_data: {
                name: `${await projectTitle(bill.project_id)}: ${await displayName(bill.sub_id)}`,
              },
            },
          },
        ],
        payment_intent_data: {
          application_fee_amount: subBillFee(Number(bill.amount_cents)),
          metadata,
        },
        metadata,
        success_url: `${APP_URL}${back}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}${back}`,
      },
      { stripeAccount: accountId },
    );
    await admin
      .from("sub_bills")
      .update({ stripe_checkout_session_id: session.id, stripe_account_id: accountId })
      .eq("id", bill.id);
    url = session.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash(back, "error", failure ?? "Could not start the payment.");
  redirect(url);
}

// ---------------------------------------------------------------------------
// Membership and payment setup
// ---------------------------------------------------------------------------

/** Pro starts the monthly subscription (with the free trial). */
export async function startSubscription() {
  const viewer = await requirePro();
  if (!isStripeConfigured) flash("/pro/billing", "error", NOT_CONNECTED);
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("pro_billing")
    .select("stripe_customer_id, subscription_status")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (billing && ["trialing", "active", "past_due"].includes(billing.subscription_status)) {
    flash("/pro/billing", "notice", "You already have a subscription.");
  }

  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  // The free trial is for first-time subscribers only.
  const firstTime = !billing?.stripe_customer_id;
  let url: string | null = null;
  let failure: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      ...(billing?.stripe_customer_id
        ? { customer: billing.stripe_customer_id }
        : { customer_email: viewer.email || undefined }),
      line_items: [
        priceId
          ? { quantity: 1, price: priceId }
          : {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: PRO_MONTHLY_PRICE_CENTS,
                recurring: { interval: "month" },
                product_data: { name: `${APP_NAME} pro membership` },
              },
            },
      ],
      subscription_data: {
        ...(firstTime ? { trial_period_days: TRIAL_DAYS } : {}),
        metadata: { user_id: viewer.id },
      },
      metadata: { kind: "subscription", user_id: viewer.id },
      success_url: `${APP_URL}/pro/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pro/billing`,
    });
    url = session.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash("/pro/billing", "error", failure ?? "Could not start checkout.");
  redirect(url);
}

/** Pro manages card, invoices or cancellation in Stripe's billing portal. */
export async function openBillingPortal() {
  const viewer = await requirePro();
  if (!isStripeConfigured) flash("/pro/billing", "error", NOT_CONNECTED);
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("pro_billing")
    .select("stripe_customer_id")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (!billing?.stripe_customer_id) flash("/pro/billing", "error", "Start your membership first.");

  let url: string | null = null;
  let failure: string | null = null;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${APP_URL}/pro/billing`,
    });
    url = session.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash("/pro/billing", "error", failure ?? "Could not open the billing portal.");
  redirect(url);
}

/** Pro sets up (or continues setting up) the Stripe account they are paid into. */
export async function startPayoutOnboarding() {
  const viewer = await requirePro();
  if (!isStripeConfigured) flash("/pro/billing", "error", NOT_CONNECTED);
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("pro_billing")
    .select("stripe_account_id")
    .eq("user_id", viewer.id)
    .maybeSingle();

  let url: string | null = null;
  let failure: string | null = null;
  try {
    let accountId = billing?.stripe_account_id as string | undefined;
    if (!accountId) {
      accountId = await createProAccount(viewer.id, viewer.email, await displayName(viewer.id));
      await admin
        .from("pro_billing")
        .upsert({ user_id: viewer.id, stripe_account_id: accountId });
    }
    url = await proAccountSetupLink(accountId);
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash("/pro/billing", "error", failure ?? "Could not start payment setup.");
  redirect(url);
}
