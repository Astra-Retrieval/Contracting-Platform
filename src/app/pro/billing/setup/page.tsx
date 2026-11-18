import Link from "next/link";
import { redirect } from "next/navigation";
import { PayoutOnboarding } from "@/components/payout-onboarding";
import { Card, PageHeader } from "@/components/ui";
import { requirePro } from "@/lib/auth";
import { STRIPE_PUBLISHABLE_KEY } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payment setup" };

export default async function PayoutSetupPage() {
  const viewer = await requirePro();
  const supabase = await createClient();
  const { data: billing } = await supabase
    .from("pro_billing")
    .select("stripe_account_id")
    .eq("user_id", viewer.id)
    .maybeSingle();
  // The account is created by the "Set up payments" button on the Billing page.
  if (!billing?.stripe_account_id || !STRIPE_PUBLISHABLE_KEY) redirect("/pro/billing");

  return (
    <div className="page page-narrow">
      <Link href="/pro/billing" className="text-sm text-stone-500 hover:text-stone-800">
        ← Billing
      </Link>
      <PageHeader
        title="Payment setup"
        subtitle="Stripe verifies your business and bank account so customers can pay you. Your details go to Stripe, not to us."
      />
      <Card>
        <PayoutOnboarding publishableKey={STRIPE_PUBLISHABLE_KEY} />
      </Card>
    </div>
  );
}
