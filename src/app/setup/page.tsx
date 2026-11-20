import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/config";
import { isEmailConfigured } from "@/lib/email";
import { isStripeConfigured } from "@/lib/stripe";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  const checks: [string, boolean, string][] = [
    [
      "Supabase URL and anon key",
      isSupabaseConfigured,
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ],
    ["Supabase service-role key", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), "SUPABASE_SERVICE_ROLE_KEY"],
    ["Stripe secret key", isStripeConfigured, "STRIPE_SECRET_KEY"],
    ["Stripe publishable key", Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY), "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    ["Stripe webhook secret", Boolean(process.env.STRIPE_WEBHOOK_SECRET), "STRIPE_WEBHOOK_SECRET"],
    ["Email notifications (optional)", isEmailConfigured, "RESEND_API_KEY and EMAIL_FROM"],
    ["Staff address for alerts (optional)", Boolean(process.env.ADMIN_EMAIL), "ADMIN_EMAIL"],
    ["Daily document expiry job", Boolean(process.env.CRON_SECRET), "CRON_SECRET"],
  ];
  const ready = checks.slice(0, 2).every(([, ok]) => ok);

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Finish connecting the app"
        subtitle="The site needs a database and a payment processor before accounts and projects work."
      />
      <Card>
        <ul className="divide-y divide-stone-100">
          {checks.map(([label, ok, env]) => (
            <li key={label} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-medium text-stone-900">{label}</p>
                <p className="font-mono text-xs text-stone-500">{env}</p>
              </div>
              <Badge tone={ok ? "green" : "amber"}>{ok ? "Connected" : "Missing"}</Badge>
            </li>
          ))}
        </ul>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-stone-700">
          <li>
            Copy <code className="font-mono">.env.example</code> to{" "}
            <code className="font-mono">.env.local</code> and fill in the values.
          </li>
          <li>
            Run <code className="font-mono">supabase/migrations/0001_init.sql</code> in the Supabase
            SQL editor.
          </li>
          <li>Restart the dev server.</li>
        </ol>
        <p className="mt-4 text-sm text-stone-600">
          Full steps are in the README. Stripe is only needed for subscriptions and payments, and
          email only for notifications; the rest of the app works without them.
        </p>
        {ready && (
          <ButtonLink href="/" className="mt-5">
            Go to the site
          </ButtonLink>
        )}
      </Card>
    </div>
  );
}
