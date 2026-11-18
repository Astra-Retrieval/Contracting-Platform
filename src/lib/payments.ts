import type Stripe from "stripe";
import { estimatedProcessingFee, platformFee } from "@/lib/config";
import { notify, projectTitle } from "@/lib/email";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

// All money movement lives in this file.
//
//   1. Customer pays a milestone through Stripe Checkout. The charge lands in the
//      platform's Stripe balance.                          -> milestone "funded"
//   2. The pro marks the work done.                        -> milestone "submitted"
//   3. The customer approves. The platform keeps its fee, Stripe's processing fee is
//      covered, and the rest is transferred: each accepted sub gets their share and
//      the lead pro gets what remains.                     -> milestone "released"
//
//   A dispute can end with part or all of the payment refunded to the customer first.
//   Stripe keeps its processing fee on refunds, so it is still deducted from what is left.
//
// Every function here is safe to call twice (webhook + browser return can both fire).

type Admin = ReturnType<typeof createAdminClient>;

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Tell everyone who was paid (or refunded) what happened when a milestone settles. */
export async function announceSettlement(s: Settlement, customerId?: string) {
  if (s.error || !s.projectId) return;
  const title = await projectTitle(s.projectId);
  for (const p of s.payouts ?? []) {
    await notify(p.recipient_id, {
      subject: `You've been paid ${usd(p.amount_cents)}`,
      lines: [
        `"${s.milestoneTitle}" on ${title} was settled and ${usd(p.amount_cents)} has been released to you.`,
        "It reaches your bank on Stripe's normal payout schedule. If you have not finished payout setup, it is held until you do.",
      ],
      path: "/pro/billing",
      cta: "See your earnings",
    });
  }
  if (customerId && (s.refundCents ?? 0) > 0) {
    await notify(customerId, {
      subject: `Refund of ${usd(s.refundCents ?? 0)} issued`,
      lines: [
        `${usd(s.refundCents ?? 0)} for "${s.milestoneTitle}" on ${title} has been refunded to your original payment method.`,
        "Refunds usually take 5 to 10 business days to appear.",
      ],
      path: `/projects/${s.projectId}`,
      cta: "Open the project",
    });
  }
}

const LISTED_STATUSES = ["trialing", "active"];

/** Apply the result of a finished Checkout session (milestone payment or subscription). */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();
  const kind = session.metadata?.kind;

  if (kind === "milestone" && session.payment_status === "paid") {
    const paymentId = session.metadata?.payment_id;
    if (!paymentId) return;
    const stripe = getStripe();
    const intent =
      typeof session.payment_intent === "string"
        ? await stripe.paymentIntents.retrieve(session.payment_intent)
        : session.payment_intent;
    const chargeId =
      typeof intent?.latest_charge === "string"
        ? intent.latest_charge
        : (intent?.latest_charge?.id ?? null);
    const processingFee = await stripeFeeForCharge(chargeId, session.amount_total ?? 0);

    const { data: payment } = await admin
      .from("payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: intent?.id ?? null,
        stripe_charge_id: chargeId,
        processing_fee_cents: processingFee,
        paid_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .eq("status", "pending")
      .select("milestone_id, project_id, pro_id, amount_cents")
      .maybeSingle();

    if (payment) {
      const { data: milestone } = await admin
        .from("milestones")
        .update({ status: "funded", funded_at: new Date().toISOString() })
        .eq("id", payment.milestone_id)
        .eq("status", "pending")
        .select("title")
        .maybeSingle();
      const { data: request } = await admin
        .from("quote_requests")
        .select("id")
        .eq("project_id", payment.project_id)
        .eq("pro_id", payment.pro_id)
        .maybeSingle();
      await notify(payment.pro_id, {
        subject: `Milestone paid: ${milestone?.title ?? "milestone"}`,
        lines: [
          `The customer has paid ${usd(Number(payment.amount_cents))} for "${milestone?.title ?? "a milestone"}" on ${await projectTitle(payment.project_id)}.`,
          "The money is held until they approve the finished work. You can start this milestone now.",
        ],
        path: request ? `/pro/jobs/${request.id}` : "/pro/jobs",
        cta: "Open the job",
      });
    }
  }

  if (kind === "subscription" && session.subscription) {
    const subscription =
      typeof session.subscription === "string"
        ? await getStripe().subscriptions.retrieve(session.subscription)
        : session.subscription;
    await syncSubscription(subscription, session.metadata?.user_id);
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

/** Mirror a Connect account's onboarding state, then pay out anything that was waiting on it. */
export async function syncConnectAccount(account: Stripe.Account) {
  const admin = createAdminClient();
  const ready = account.capabilities?.transfers === "active" && Boolean(account.details_submitted);

  const { data: billing } = await admin
    .from("pro_billing")
    .update({ payouts_enabled: ready, updated_at: new Date().toISOString() })
    .eq("stripe_account_id", account.id)
    .select("user_id")
    .maybeSingle();
  if (!billing) return ready;

  await admin.from("pro_profiles").update({ payouts_ready: ready }).eq("user_id", billing.user_id);
  if (ready) await processPendingTransfers(billing.user_id);
  return ready;
}

/** What Stripe actually charged to process a payment. Falls back to an estimate. */
async function stripeFeeForCharge(chargeId: string | null, amountCents: number) {
  if (chargeId) {
    try {
      const charge = await getStripe().charges.retrieve(chargeId, {
        expand: ["balance_transaction"],
      });
      const bt = charge.balance_transaction;
      if (bt && typeof bt !== "string") return bt.fee;
    } catch (e) {
      console.error("Could not read the Stripe fee for charge", chargeId, e);
    }
  }
  return estimatedProcessingFee(amountCents);
}

export type Settlement = {
  error?: string;
  projectId?: string;
  milestoneTitle?: string;
  refundCents?: number;
  payouts?: { recipient_id: string; role: "lead" | "sub"; amount_cents: number }[];
};

/**
 * Settle a paid milestone. Optionally refund part or all of it to the customer first
 * (dispute outcomes), then from what is left keep the platform fee, cover Stripe's
 * processing fee, pay accepted subs their share and pay the lead pro the remainder.
 *
 * `from` lists the milestone statuses this call is allowed to settle.
 */
export async function settleMilestone(
  milestoneId: string,
  opts: { refundCents?: number; from?: string[] } = {},
): Promise<Settlement> {
  const admin = createAdminClient();
  const from = opts.from ?? ["funded", "submitted"];

  const { data: milestone } = await admin
    .from("milestones")
    .select("id, quote_id, project_id, title, amount_cents, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return { error: "Milestone not found." };

  const { data: payment } = await admin
    .from("payments")
    .select("id, stripe_charge_id, processing_fee_cents")
    .eq("milestone_id", milestoneId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (!payment) return { error: "This milestone has not been paid yet." };

  const { data: quote } = await admin
    .from("quotes")
    .select("id, pro_id, amount_cents")
    .eq("id", milestone.quote_id)
    .single();
  if (!quote) return { error: "Quote not found." };

  const amount = Number(milestone.amount_cents);
  const refund = Math.min(amount, Math.max(0, Math.round(opts.refundCents ?? 0)));
  const remaining = amount - refund;
  const finalStatus = remaining > 0 ? "released" : "refunded";

  // Claim the settlement. If another request got here first, nothing is returned.
  const { data: claimed } = await admin
    .from("milestones")
    .update({ status: finalStatus, released_at: new Date().toISOString(), refunded_cents: refund })
    .eq("id", milestoneId)
    .in("status", from)
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "This milestone has already been settled or is not in the right state." };

  // Refund the customer first. If Stripe refuses, put the milestone back as it was.
  let refundId: string | null = null;
  if (refund > 0) {
    try {
      if (!payment.stripe_charge_id) throw new Error("No Stripe charge is recorded for this payment.");
      const result = await getStripe().refunds.create(
        { charge: payment.stripe_charge_id, amount: refund, metadata: { milestone_id: milestoneId } },
        { idempotencyKey: `refund_${milestoneId}_${refund}` },
      );
      refundId = result.id;
    } catch (e) {
      await admin
        .from("milestones")
        .update({ status: milestone.status, released_at: null, refunded_cents: 0 })
        .eq("id", milestoneId);
      return { error: `The refund failed: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }

  // Our cut is taken on what the pro side actually keeps. Stripe's fee is fixed at charge time.
  const fee = platformFee(remaining);
  const processing =
    Number(payment.processing_fee_cents) || (await stripeFeeForCharge(payment.stripe_charge_id, amount));

  const { data: subs } = await admin
    .from("project_subs")
    .select("sub_id, amount_cents")
    .eq("quote_id", quote.id)
    .eq("status", "accepted");

  // Each sub's agreed amount is spread across milestones in proportion to what is released.
  let available = Math.max(0, remaining - fee - processing);
  const rows: { recipient_id: string; role: "lead" | "sub"; amount_cents: number }[] = [];
  for (const sub of subs ?? []) {
    const share = Math.min(
      available,
      Math.floor((Number(sub.amount_cents) * remaining) / Number(quote.amount_cents)),
    );
    if (share > 0) {
      rows.push({ recipient_id: sub.sub_id, role: "sub", amount_cents: share });
      available -= share;
    }
  }
  if (available > 0) rows.push({ recipient_id: quote.pro_id, role: "lead", amount_cents: available });

  await admin
    .from("payments")
    .update({
      platform_fee_cents: fee,
      processing_fee_cents: processing,
      refunded_cents: refund,
      stripe_refund_id: refundId,
      ...(remaining === 0 ? { status: "refunded" } : {}),
    })
    .eq("id", payment.id);

  if (rows.length) {
    const { data: transfers } = await admin
      .from("transfers")
      .insert(rows.map((r) => ({ ...r, payment_id: payment.id, milestone_id: milestoneId })))
      .select("id");
    for (const t of transfers ?? []) await sendTransfer(admin, t.id);
  }

  // Close the project once every milestone on every accepted quote is settled.
  const { data: accepted } = await admin
    .from("quotes")
    .select("id")
    .eq("project_id", milestone.project_id)
    .eq("status", "accepted");
  const { count } = await admin
    .from("milestones")
    .select("id", { count: "exact", head: true })
    .in("quote_id", (accepted ?? []).map((q) => q.id))
    .not("status", "in", "(released,refunded)");
  if (count === 0) {
    await admin.from("projects").update({ status: "completed" }).eq("id", milestone.project_id);
  }
  return {
    projectId: milestone.project_id,
    milestoneTitle: milestone.title,
    refundCents: refund,
    payouts: rows,
  };
}

/** Send one recorded transfer to the recipient's Stripe account, if they have one. */
async function sendTransfer(admin: Admin, transferId: string) {
  const { data: transfer } = await admin
    .from("transfers")
    .select("id, payment_id, milestone_id, recipient_id, amount_cents, status")
    .eq("id", transferId)
    .maybeSingle();
  if (!transfer || transfer.status === "paid") return;

  const { data: billing } = await admin
    .from("pro_billing")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", transfer.recipient_id)
    .maybeSingle();
  if (!billing?.stripe_account_id || !billing.payouts_enabled) {
    await admin.from("transfers").update({ status: "awaiting_payout_setup" }).eq("id", transfer.id);
    return;
  }

  const { data: payment } = await admin
    .from("payments")
    .select("stripe_charge_id")
    .eq("id", transfer.payment_id)
    .single();

  try {
    const result = await getStripe().transfers.create(
      {
        amount: Number(transfer.amount_cents),
        currency: "usd",
        destination: billing.stripe_account_id,
        // Ties the transfer to the customer's charge so it can go out before the funds settle.
        ...(payment?.stripe_charge_id ? { source_transaction: payment.stripe_charge_id } : {}),
        transfer_group: `milestone_${transfer.milestone_id}`,
        metadata: { transfer_id: transfer.id, milestone_id: transfer.milestone_id },
      },
      { idempotencyKey: `transfer_${transfer.id}` },
    );
    await admin
      .from("transfers")
      .update({ status: "paid", stripe_transfer_id: result.id, error: null })
      .eq("id", transfer.id);
  } catch (e) {
    await admin
      .from("transfers")
      .update({ status: "failed", error: e instanceof Error ? e.message : "Transfer failed" })
      .eq("id", transfer.id);
  }
}

/** Retry transfers that were waiting for a pro to finish payout setup, or that failed. */
export async function processPendingTransfers(userId: string) {
  const admin = createAdminClient();
  const { data: waiting } = await admin
    .from("transfers")
    .select("id")
    .eq("recipient_id", userId)
    .in("status", ["awaiting_payout_setup", "failed", "pending"]);
  for (const t of waiting ?? []) await sendTransfer(admin, t.id);
}
