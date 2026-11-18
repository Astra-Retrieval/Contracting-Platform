import type Stripe from "stripe";
import { APP_URL } from "@/lib/config";
import { displayName, notify, projectTitle } from "@/lib/email";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

// All money movement lives in this file.
//
// The platform never holds anyone's money. Every pro has their own Stripe account
// (a "connected account") and is paid into it directly:
//
//   1. Milestones on a quote are a payment schedule. When one comes due the pro sends a
//      bill.                                               -> milestone "billed"
//   2. The customer approves the work and pays. The charge is made on the pro's Stripe
//      account, and the platform fee is taken off the top. -> milestone "paid"
//   3. Subs bill the lead contractor the same way, and the lead pays the sub's Stripe
//      account directly.
//
//   Stripe takes its own card processing fee from the pro who was paid, and Stripe (not the
//   platform) is responsible if a pro's balance goes negative.
//
//   A dispute on a paid milestone can end in a refund. Refunds come out of the pro's Stripe
//   balance, and the platform gives back its fee on the refunded part.
//
// Every function here is safe to call twice (webhook + browser return can both fire).

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const LISTED_STATUSES = ["trialing", "active"];

// ---------------------------------------------------------------------------
// Pro Stripe accounts
// ---------------------------------------------------------------------------

// The Express dashboard combined with Stripe carrying the risk is in Stripe's public preview,
// so creating those accounts needs the preview API version. Everything else uses the SDK default.
const EXPRESS_PREVIEW_API_VERSION = "2026-10-28.preview";

/**
 * Create the Stripe account a pro is paid into: Express dashboard, Stripe collects its own
 * fees from the pro and carries the risk of negative balances.
 */
export async function createProAccount(userId: string, email: string, name: string) {
  const account = await getStripe().v2.core.accounts.create(
    {
    contact_email: email || undefined,
    display_name: name || undefined,
    dashboard: "express",
    identity: { country: "us" },
    defaults: {
      responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
    },
    configuration: {
      merchant: { capabilities: { card_payments: { requested: true } } },
    },
    metadata: { user_id: userId },
    },
    { apiVersion: EXPRESS_PREVIEW_API_VERSION },
  );
  return account.id;
}

/** A short-lived secret that lets the browser show Stripe's setup form for this account. */
export async function proAccountSetupSession(accountId: string) {
  const session = await getStripe().accountSessions.create({
    account: accountId,
    components: { account_onboarding: { enabled: true } },
  });
  return session.client_secret;
}

/** A one-time link into the pro's Express dashboard on Stripe. */
export async function proDashboardLink(accountId: string) {
  const link = await getStripe().accounts.createLoginLink(accountId);
  return link.url;
}

/** Fallback when no publishable key is set: a one-time link to Stripe's hosted setup form. */
export async function proAccountSetupLink(accountId: string) {
  const link = await getStripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${APP_URL}/pro/billing`,
        return_url: `${APP_URL}/pro/billing?connect=return`,
      },
    },
  });
  return link.url;
}

/** Mirror a pro's Stripe account state: can it take payments yet? */
export async function syncConnectAccount(account: Stripe.Account) {
  const admin = createAdminClient();
  const ready = Boolean(account.charges_enabled && account.details_submitted);

  const { data: billing } = await admin
    .from("pro_billing")
    .update({ payouts_enabled: ready, updated_at: new Date().toISOString() })
    .eq("stripe_account_id", account.id)
    .select("user_id")
    .maybeSingle();
  if (!billing) return ready;

  await admin.from("pro_profiles").update({ payouts_ready: ready }).eq("user_id", billing.user_id);
  return ready;
}

// ---------------------------------------------------------------------------
// Checkout results
// ---------------------------------------------------------------------------

/**
 * Coming back from Stripe Checkout in the browser: find which Stripe account the session
 * belongs to, fetch it and record the result. Returns whether the payment went through.
 */
export async function confirmCheckoutReturn(sessionId: string) {
  const admin = createAdminClient();
  const [{ data: payment }, { data: bill }] = await Promise.all([
    admin.from("payments").select("stripe_account_id").eq("stripe_checkout_session_id", sessionId).maybeSingle(),
    admin.from("sub_bills").select("stripe_account_id").eq("stripe_checkout_session_id", sessionId).maybeSingle(),
  ]);
  const accountId = payment?.stripe_account_id ?? bill?.stripe_account_id ?? undefined;
  const session = await getStripe().checkout.sessions.retrieve(
    sessionId,
    undefined,
    accountId ? { stripeAccount: accountId } : undefined,
  );
  await fulfillCheckoutSession(session, accountId);
  return session.payment_status === "paid";
}

/** The charge behind a finished Checkout session. */
async function chargeForSession(session: Stripe.Checkout.Session, accountId?: string) {
  const intent =
    typeof session.payment_intent === "string"
      ? await getStripe().paymentIntents.retrieve(
          session.payment_intent,
          undefined,
          accountId ? { stripeAccount: accountId } : undefined,
        )
      : session.payment_intent;
  const chargeId =
    typeof intent?.latest_charge === "string" ? intent.latest_charge : (intent?.latest_charge?.id ?? null);
  return { intentId: intent?.id ?? null, chargeId, fee: Number(intent?.application_fee_amount ?? 0) };
}

/**
 * Apply the result of a finished Checkout session: a milestone payment, a sub's bill or a
 * membership. `accountId` is the pro's Stripe account the session was created on, if any.
 */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session, accountId?: string) {
  const admin = createAdminClient();
  const kind = session.metadata?.kind;

  if (kind === "milestone" && session.payment_status === "paid") {
    const paymentId = session.metadata?.payment_id;
    if (!paymentId) return;
    const { intentId, chargeId, fee } = await chargeForSession(session, accountId);

    const { data: payment } = await admin
      .from("payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: intentId,
        stripe_charge_id: chargeId,
        platform_fee_cents: fee,
        paid_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .eq("status", "pending")
      .select("milestone_id, project_id, pro_id, amount_cents")
      .maybeSingle();
    if (!payment) return;

    const { data: milestone } = await admin
      .from("milestones")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payment.milestone_id)
      .eq("status", "billed")
      .select("title")
      .maybeSingle();
    await closeProjectIfFinished(payment.project_id);

    const { data: request } = await admin
      .from("quote_requests")
      .select("id")
      .eq("project_id", payment.project_id)
      .eq("pro_id", payment.pro_id)
      .maybeSingle();
    await notify(payment.pro_id, {
      subject: `You've been paid: ${milestone?.title ?? "milestone"}`,
      lines: [
        `The customer approved "${milestone?.title ?? "a milestone"}" on ${await projectTitle(payment.project_id)} and paid ${usd(Number(payment.amount_cents))}.`,
        `${usd(Number(payment.amount_cents) - fee)} went to your Stripe account after the ${usd(fee)} platform fee. Stripe takes its card processing fee from that and pays the rest to your bank on its normal schedule.`,
      ],
      path: request ? `/pro/jobs/${request.id}` : "/pro/jobs",
      cta: "Open the job",
    });
  }

  if (kind === "sub_bill" && session.payment_status === "paid") {
    const billId = session.metadata?.sub_bill_id;
    if (!billId) return;
    const { intentId, chargeId, fee } = await chargeForSession(session, accountId);
    const { data: bill } = await admin
      .from("sub_bills")
      .update({
        status: "paid",
        stripe_payment_intent_id: intentId,
        stripe_charge_id: chargeId,
        platform_fee_cents: fee,
        paid_at: new Date().toISOString(),
      })
      .eq("id", billId)
      .eq("status", "billed")
      .select("sub_id, lead_pro_id, project_id, amount_cents")
      .maybeSingle();
    if (!bill) return;
    await notify(bill.sub_id, {
      subject: `You've been paid ${usd(Number(bill.amount_cents))}`,
      lines: [
        `${await displayName(bill.lead_pro_id)} paid your bill of ${usd(Number(bill.amount_cents))} for ${await projectTitle(bill.project_id)}.`,
        fee > 0
          ? `${usd(Number(bill.amount_cents) - fee)} went to your Stripe account after the ${usd(fee)} platform fee. Stripe takes its card processing fee from that and pays the rest to your bank on its normal schedule.`
          : "It went to your Stripe account. Stripe takes its card processing fee from that and pays the rest to your bank on its normal schedule.",
      ],
      path: "/pro/subs",
      cta: "See your sub jobs",
    });
  }

  if (kind === "subscription" && session.subscription) {
    const subscription =
      typeof session.subscription === "string"
        ? await getStripe().subscriptions.retrieve(session.subscription)
        : session.subscription;
    await syncSubscription(subscription, session.metadata?.user_id);
  }
}

/** Close the project once every milestone on every accepted quote is paid or refunded. */
async function closeProjectIfFinished(projectId: string) {
  const admin = createAdminClient();
  const { data: accepted } = await admin
    .from("quotes")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "accepted");
  if (!accepted?.length) return;
  const { count } = await admin
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .in("quote_id", accepted.map((q) => q.id))
    .not("status", "in", "(paid,refunded)");
  if (count === 0) {
    await admin.from("projects").update({ status: "completed" }).eq("id", projectId);
  }
}

/** Mirror a Stripe subscription onto the pro's billing row and search listing. */
export async function syncSubscription(subscription: Stripe.Subscription, userIdHint?: string) {
  const admin = createAdminClient();
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  let userId = userIdHint || subscription.metadata?.user_id;
  if (!userId) {
    const { data } = await admin
      .from("pro_billing")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) return;

  await admin.from("pro_billing").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    trial_ends_at: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  });
  await admin
    .from("pro_profiles")
    .update({ is_listed: LISTED_STATUSES.includes(subscription.status) })
    .eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// Dispute outcomes
// ---------------------------------------------------------------------------

export type DisputeOutcome = {
  error?: string;
  projectId?: string;
  milestoneTitle?: string;
  refundCents?: number;
};

/**
 * Close a disputed milestone. Refunds `refundCents` to the customer from the pro's Stripe
 * balance (the platform returns its fee on that part), then marks the milestone paid, or
 * refunded if all of it went back.
 */
export async function closeDisputedMilestone(milestoneId: string, refundCents: number): Promise<DisputeOutcome> {
  const admin = createAdminClient();
  const { data: milestone } = await admin
    .from("milestones")
    .select("id, project_id, title, amount_cents, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { error: "Milestone not found." };

  const { data: payment } = await admin
    .from("payments")
    .select("id, stripe_charge_id, stripe_account_id, platform_fee_cents")
    .eq("milestone_id", milestoneId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (!payment) return { error: "This milestone has not been paid yet." };

  const amount = Number(milestone.amount_cents);
  const refund = Math.min(amount, Math.max(0, Math.round(refundCents)));
  const finalStatus = refund >= amount ? "refunded" : "paid";

  // Claim the outcome. If another request got here first, nothing is returned.
  const { data: claimed } = await admin
    .from("milestones")
    .update({ status: finalStatus, refunded_cents: refund, status_before_dispute: null })
    .eq("id", milestoneId)
    .eq("status", "disputed")
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "This dispute has already been closed." };

  if (refund > 0) {
    try {
      if (!payment.stripe_charge_id) throw new Error("No Stripe charge is recorded for this payment.");
      const onProAccount = Boolean(payment.stripe_account_id);
      const result = await getStripe().refunds.create(
        {
          charge: payment.stripe_charge_id,
          amount: refund,
          metadata: { milestone_id: milestoneId },
          // Give back the platform fee on the refunded part.
          ...(onProAccount ? { refund_application_fee: true } : {}),
        },
        {
          idempotencyKey: `refund_${milestoneId}_${refund}`,
          ...(onProAccount ? { stripeAccount: payment.stripe_account_id as string } : {}),
        },
      );
      const fee = Number(payment.platform_fee_cents);
      await admin
        .from("payments")
        .update({
          refunded_cents: refund,
          stripe_refund_id: result.id,
          platform_fee_cents: fee - Math.round((fee * refund) / amount),
          ...(refund >= amount ? { status: "refunded" } : {}),
        })
        .eq("id", payment.id);
    } catch (e) {
      // Stripe refused: put the dispute back so it can be tried again.
      await admin
        .from("milestones")
        .update({ status: "disputed", refunded_cents: 0, status_before_dispute: "paid" })
        .eq("id", milestoneId);
      return { error: `The refund failed: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }

  await closeProjectIfFinished(milestone.project_id);
  return { projectId: milestone.project_id, milestoneTitle: milestone.title, refundCents: refund };
}

/** Tell the customer their refund is on its way. */
export async function announceRefund(outcome: DisputeOutcome, customerId: string) {
  if (outcome.error || !outcome.projectId || !(outcome.refundCents ?? 0)) return;
  await notify(customerId, {
    subject: `Refund of ${usd(outcome.refundCents ?? 0)} issued`,
    lines: [
      `${usd(outcome.refundCents ?? 0)} for "${outcome.milestoneTitle}" on ${await projectTitle(outcome.projectId)} has been refunded to your original payment method.`,
      "Refunds usually take 5 to 10 business days to appear.",
    ],
    path: `/projects/${outcome.projectId}`,
    cta: "Open the project",
  });
}
