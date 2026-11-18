"use server";

import { redirect } from "next/navigation";
import { requireCustomer, requirePro } from "@/lib/auth";
import { APP_NAME, APP_URL, PRO_MONTHLY_PRICE_CENTS, TRIAL_DAYS } from "@/lib/config";
import { flash, text } from "@/lib/format";
import { announceSettlement, settleMilestone } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

const NOT_CONNECTED = "Payments are not connected yet. Add your Stripe keys to turn them on.";
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong with Stripe.");

/** Customer pays one milestone through Stripe Checkout. */
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
  if (milestone.status !== "pending") flash(back, "error", "This milestone has already been paid.");
  if (!isStripeConfigured) flash(back, "error", NOT_CONNECTED);

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
    const session = await getStripe().checkout.sessions.create({
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
        transfer_group: `milestone_${milestone.id}`,
        metadata: { payment_id: payment.id, milestone_id: milestone.id },
      },
      metadata: { kind: "milestone", payment_id: payment.id, milestone_id: milestone.id },
      success_url: `${APP_URL}${back}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}${back}`,
    });
    await admin
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", payment.id);
    url = session.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash(back, "error", failure ?? "Could not start the payment.");
  redirect(url);
}

/** Customer approves finished work, which releases the money to the pro and subs. */
export async function approveMilestone(formData: FormData) {
  const viewer = await requireCustomer();
  const admin = createAdminClient();
  const milestoneId = text(formData.get("milestone_id"));

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, project_id")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) flash("/projects", "error", "Milestone not found.");
  const back = `/projects/${milestone.project_id}`;
  const { data: project } = await admin
    .from("projects")
    .select("customer_id")
    .eq("id", milestone.project_id)
    .maybeSingle();
  if (project?.customer_id !== viewer.id) flash("/projects", "error", "Milestone not found.");
  if (!isStripeConfigured) flash(back, "error", NOT_CONNECTED);

  const result = await settleMilestone(milestoneId);
  if (result.error) flash(back, "error", result.error);
  await announceSettlement(result);
  flash(back, "notice", "Approved. The payment has been released.");
}

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

/** Pro sets up (or continues setting up) the Stripe account that receives payouts. */
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
    const stripe = getStripe();
    let accountId = billing?.stripe_account_id as string | undefined;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: viewer.email || undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { user_id: viewer.id },
      });
      accountId = account.id;
      await admin
        .from("pro_billing")
        .upsert({ user_id: viewer.id, stripe_account_id: accountId });
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${APP_URL}/pro/billing`,
      return_url: `${APP_URL}/pro/billing?connect=return`,
    });
    url = link.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash("/pro/billing", "error", failure ?? "Could not start payout setup.");
  redirect(url);
}

/** Pro opens their Stripe Express dashboard to see payouts and bank details. */
export async function openPayoutDashboard() {
  const viewer = await requirePro();
  if (!isStripeConfigured) flash("/pro/billing", "error", NOT_CONNECTED);
  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("pro_billing")
    .select("stripe_account_id")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (!billing?.stripe_account_id) flash("/pro/billing", "error", "Set up payouts first.");

  let url: string | null = null;
  let failure: string | null = null;
  try {
    const link = await getStripe().accounts.createLoginLink(billing.stripe_account_id);
    url = link.url;
  } catch (e) {
    failure = message(e);
  }
  if (failure || !url) flash("/pro/billing", "error", failure ?? "Could not open the payout dashboard.");
  redirect(url);
}
