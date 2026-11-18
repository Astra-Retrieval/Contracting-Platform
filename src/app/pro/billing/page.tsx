import {
  openBillingPortal,
  openPayoutDashboard,
  startPayoutOnboarding,
  startSubscription,
} from "@/app/actions/payments";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Flash, PageHeader, SectionTitle, Stat, type SearchParams } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { PRO_MONTHLY_PRICE_CENTS, TRIAL_DAYS, feePercentLabel, processingFeeLabel } from "@/lib/config";
import { flash, money, shortDate } from "@/lib/format";
import { fulfillCheckoutSession, syncConnectAccount } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing" };

const subscriptionLabels: Record<string, [string, "green" | "amber" | "red" | "gray"]> = {
  trialing: ["Free trial", "green"],
  active: ["Active", "green"],
  past_due: ["Payment overdue", "red"],
  unpaid: ["Unpaid", "red"],
  canceled: ["Cancelled", "gray"],
  incomplete: ["Incomplete", "amber"],
  incomplete_expired: ["Expired", "gray"],
  paused: ["Paused", "amber"],
  none: ["Not started", "amber"],
};

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requirePro();
  const params = await searchParams;
  const supabase = await createClient();

  // Coming back from subscription checkout.
  if (typeof params.session_id === "string" && isStripeConfigured) {
    let ok = false;
    try {
      const session = await getStripe().checkout.sessions.retrieve(params.session_id);
      if (session.metadata?.user_id === viewer.id) {
        await fulfillCheckoutSession(session);
        ok = true;
      }
    } catch (e) {
      console.error("Could not confirm subscription checkout", e);
    }
    flash(
      "/pro/billing",
      ok ? "notice" : "error",
      ok ? "Membership started. Your profile is now listed in search." : "We could not confirm your membership yet.",
    );
  }

  let { data: billing } = await supabase.from("pro_billing").select("*").eq("user_id", viewer.id).maybeSingle();

  // Keep payout status current (also covers the return from Stripe onboarding).
  if (isStripeConfigured && billing?.stripe_account_id && (!billing.payouts_enabled || params.connect)) {
    try {
      const account = await getStripe().accounts.retrieve(billing.stripe_account_id);
      const ready = await syncConnectAccount(account);
      billing = { ...billing, payouts_enabled: ready };
    } catch (e) {
      console.error("Could not refresh the payout account", e);
    }
  }

  // Money received: milestone payments as lead contractor, and bills paid to this pro as a sub.
  const [{ data: payments }, { data: paidBills }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, milestone_id, project_id, amount_cents, platform_fee_cents, refunded_cents, status, paid_at")
      .eq("pro_id", viewer.id)
      .in("status", ["succeeded", "refunded"])
      .order("paid_at", { ascending: false })
      .limit(50),
    supabase
      .from("sub_bills")
      .select("id, project_id, amount_cents, platform_fee_cents, note, paid_at")
      .eq("sub_id", viewer.id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(50),
  ]);
  const milestoneIds = (payments ?? []).map((p) => p.milestone_id);
  const projectIds = [...(payments ?? []), ...(paidBills ?? [])].map((r) => r.project_id);
  const [{ data: milestones }, { data: projects }] = await Promise.all([
    milestoneIds.length
      ? supabase.from("milestones").select("id, title").in("id", milestoneIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("projects").select("id, title").in("id", projectIds)
      : Promise.resolve({ data: [] }),
  ]);
  const milestoneById = new Map((milestones ?? []).map((m) => [m.id, m]));
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const received = [
    ...(payments ?? []).map((p) => ({
      id: p.id,
      date: p.paid_at as string,
      job: projectById.get(p.project_id)?.title ?? "Project",
      detail: milestoneById.get(p.milestone_id)?.title ?? "",
      role: "Lead",
      amount: Number(p.amount_cents),
      refunded: Number(p.refunded_cents),
      fee: Number(p.platform_fee_cents),
    })),
    ...(paidBills ?? []).map((b) => ({
      id: b.id,
      date: b.paid_at as string,
      job: projectById.get(b.project_id)?.title ?? "Project",
      detail: b.note as string,
      role: "Sub",
      amount: Number(b.amount_cents),
      refunded: 0,
      fee: Number(b.platform_fee_cents),
    })),
  ].sort((x, y) => (x.date < y.date ? 1 : -1));
  const totalPaid = received.reduce((n, r) => n + r.amount - r.refunded, 0);
  const totalFees = received.reduce((n, r) => n + r.fee, 0);

  const status = billing?.subscription_status ?? "none";
  const [statusLabel, statusTone] = subscriptionLabels[status] ?? [status, "gray"];
  const hasSubscription = ["trialing", "active", "past_due", "unpaid", "paused"].includes(status);

  return (
    <div className="page max-w-4xl!">
      <PageHeader title="Billing" subtitle="Your membership, getting paid, and earnings." />
      <Flash params={params} />
      {!isStripeConfigured && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payments are not connected on this site yet, so membership and payment setup cannot be started.
          Until then every pro profile is listed in search.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <SectionTitle action={<Badge tone={statusTone}>{statusLabel}</Badge>}>Membership</SectionTitle>
          <p className="text-3xl font-bold">
            ${PRO_MONTHLY_PRICE_CENTS / 100}
            <span className="text-base font-medium text-stone-500">/month</span>
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {status === "trialing" && billing?.trial_ends_at
              ? `Your free trial ends ${shortDate(billing.trial_ends_at)}.`
              : hasSubscription
                ? `Plus a ${feePercentLabel} platform fee and Stripe's card processing (about ${processingFeeLabel}) on payments you receive.`
                : `${TRIAL_DAYS}-day free trial for new members, then monthly. Plus a ${feePercentLabel} platform fee and Stripe's card processing (about ${processingFeeLabel}) on payments you receive as lead contractor. Your profile appears in search while your membership is active.`}
          </p>
          <div className="mt-4">
            {hasSubscription ? (
              <form action={openBillingPortal}>
                <SubmitButton variant="secondary" pendingText="Opening…">
                  Manage membership
                </SubmitButton>
              </form>
            ) : (
              <form action={startSubscription}>
                <SubmitButton pendingText="Opening checkout…">
                  {billing?.stripe_customer_id ? "Restart membership" : `Start ${TRIAL_DAYS}-day free trial`}
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle
            action={
              <Badge tone={billing?.payouts_enabled ? "green" : "amber"}>
                {billing?.payouts_enabled ? "Ready" : billing?.stripe_account_id ? "Setup incomplete" : "Not set up"}
              </Badge>
            }
          >
            Getting paid
          </SectionTitle>
          <p className="text-sm text-stone-600">
            {billing?.payouts_enabled
              ? "Customers pay straight into your own Stripe account when they approve a bill. Stripe pays out to your bank on its normal schedule."
              : "Set up your own Stripe account to send bills. Customers pay straight into it when they approve your work, and Stripe pays out to your bank. You need this before you can bill a job."}
          </p>
          <div className="mt-4">
            {billing?.payouts_enabled ? (
              <form action={openPayoutDashboard}>
                <SubmitButton variant="secondary" pendingText="Opening…">
                  Open your Stripe dashboard
                </SubmitButton>
              </form>
            ) : (
              <form action={startPayoutOnboarding}>
                <SubmitButton pendingText="Opening Stripe…">
                  {billing?.stripe_account_id ? "Continue payment setup" : "Set up payments"}
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Earnings</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Paid to you" value={money(totalPaid)} hint="Before fees, less refunds" />
          <Stat label="Platform fees" value={money(totalFees)} />
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-lg text-left text-sm">
            <caption className="sr-only">Payments you have received</caption>
            <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5 text-right font-medium">Platform fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {received.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-stone-500">
                    Nothing yet. Payments appear here when a bill you sent is paid.
                  </td>
                </tr>
              )}
              {received.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{shortDate(r.date)}</td>
                  <td className="px-4 py-2.5">
                    {r.job}
                    {r.detail && <span className="text-stone-500"> · {r.detail}</span>}
                  </td>
                  <td className="px-4 py-2.5">{r.role}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {money(r.amount - r.refunded)}
                    {r.refunded > 0 && (
                      <span className="block text-xs font-normal text-stone-500">{money(r.refunded)} refunded</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(r.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Stripe&apos;s card processing fee (about {processingFeeLabel}) is taken by Stripe from each payment
          and shows in your Stripe dashboard.
        </p>
      </div>
    </div>
  );
}
