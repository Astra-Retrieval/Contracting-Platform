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
const transferLabels: Record<string, [string, "green" | "amber" | "red" | "gray"]> = {
  paid: ["Paid", "green"],
  pending: ["Processing", "amber"],
  awaiting_payout_setup: ["Waiting for payout setup", "amber"],
  failed: ["Failed, will retry", "red"],
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

  const { data: transfers } = await supabase
    .from("transfers")
    .select("id, milestone_id, role, amount_cents, status, created_at")
    .eq("recipient_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const milestoneIds = (transfers ?? []).map((t) => t.milestone_id);
  const { data: milestones } = milestoneIds.length
    ? await supabase.from("milestones").select("id, title, project_id").in("id", milestoneIds)
    : { data: [] };
  const { data: projects } = (milestones ?? []).length
    ? await supabase.from("projects").select("id, title").in("id", (milestones ?? []).map((m) => m.project_id))
    : { data: [] };
  const milestoneById = new Map((milestones ?? []).map((m) => [m.id, m]));
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  const status = billing?.subscription_status ?? "none";
  const [statusLabel, statusTone] = subscriptionLabels[status] ?? [status, "gray"];
  const hasSubscription = ["trialing", "active", "past_due", "unpaid", "paused"].includes(status);
  const sum = (s: string[]) =>
    (transfers ?? []).filter((t) => s.includes(t.status)).reduce((n, t) => n + Number(t.amount_cents), 0);

  return (
    <div className="page max-w-4xl!">
      <PageHeader title="Billing" subtitle="Your membership, payouts and earnings." />
      <Flash params={params} />
      {!isStripeConfigured && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payments are not connected on this site yet, so membership and payouts cannot be started.
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
                ? `Plus a ${feePercentLabel} platform fee and Stripe's card processing (about ${processingFeeLabel}) on payments you receive as lead contractor.`
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
            Payouts
          </SectionTitle>
          <p className="text-sm text-stone-600">
            {billing?.payouts_enabled
              ? "Money from approved milestones is sent to your bank account through Stripe."
              : "Connect a bank account through Stripe to receive money from approved milestones. Anything you earn before then is held and sent once setup is finished."}
          </p>
          <div className="mt-4">
            {billing?.payouts_enabled ? (
              <form action={openPayoutDashboard}>
                <SubmitButton variant="secondary" pendingText="Opening…">
                  Open payout dashboard
                </SubmitButton>
              </form>
            ) : (
              <form action={startPayoutOnboarding}>
                <SubmitButton pendingText="Opening Stripe…">
                  {billing?.stripe_account_id ? "Continue payout setup" : "Set up payouts"}
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Earnings</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Paid out" value={money(sum(["paid"]))} />
          <Stat label="On the way" value={money(sum(["pending", "awaiting_payout_setup", "failed"]))} />
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-lg text-left text-sm">
            <caption className="sr-only">Payments released to you</caption>
            <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(transfers ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-stone-500">
                    Nothing yet. Payments appear here when a customer approves a milestone.
                  </td>
                </tr>
              )}
              {(transfers ?? []).map((t) => {
                const milestone = milestoneById.get(t.milestone_id);
                const project = milestone && projectById.get(milestone.project_id);
                const [label, tone] = transferLabels[t.status] ?? [t.status, "gray"];
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{shortDate(t.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {project?.title ?? "Project"}
                      {milestone && <span className="text-stone-500"> · {milestone.title}</span>}
                    </td>
                    <td className="px-4 py-2.5">{t.role === "lead" ? "Lead" : "Sub"}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(t.amount_cents)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={tone}>{label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
