import { changeEmail, changePassword, updateAccount } from "@/app/actions/account";
import { openBillingPortal } from "@/app/actions/payments";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, Field, Flash, PageHeader, SectionTitle, inputCls, type SearchParams } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const supabase = await createClient();
  const isPro = viewer.role === "pro";
  const [{ data: profile }, { data: billing }] = await Promise.all([
    supabase.from("profiles").select("full_name, city, state").eq("id", viewer.id).maybeSingle(),
    isPro
      ? supabase
          .from("pro_billing")
          .select("stripe_customer_id, stripe_account_id")
          .eq("user_id", viewer.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" subtitle="Your account details, sign-in, and payment methods." />
      <Flash params={params} />

      <section className="mb-8">
        <SectionTitle>Your details</SectionTitle>
        <Card>
          <form action={updateAccount} className="space-y-4">
            <Field label="Your name">
              <input
                name="full_name"
                required
                maxLength={120}
                autoComplete="name"
                defaultValue={profile?.full_name ?? ""}
                className={inputCls}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="City">
                <input
                  name="city"
                  autoComplete="address-level2"
                  defaultValue={profile?.city ?? ""}
                  className={inputCls}
                />
              </Field>
              <Field label="State">
                <input
                  name="state"
                  maxLength={2}
                  placeholder="e.g. SC"
                  autoComplete="address-level1"
                  defaultValue={profile?.state ?? ""}
                  className={inputCls}
                />
              </Field>
            </div>
            <p className="text-xs text-stone-500">
              {isPro
                ? "This is your own name and location. Your business name, service area, and trades are on your profile."
                : "New projects start with this location filled in. You can change it on each project."}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {isPro && (
                <ButtonLink href="/pro/profile" variant="secondary">
                  Edit business profile
                </ButtonLink>
              )}
              <SubmitButton pendingText="Saving…">Save details</SubmitButton>
            </div>
          </form>
        </Card>
      </section>

      <section className="mb-8">
        <SectionTitle>Payment methods</SectionTitle>
        <Card className="space-y-4 text-sm text-stone-700">
          {isPro ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-stone-900">Card for your membership</p>
                  <p className="text-stone-600">
                    Change the card, see invoices, or cancel. This opens Stripe&apos;s secure page.
                  </p>
                </div>
                {billing?.stripe_customer_id ? (
                  <form action={openBillingPortal}>
                    <SubmitButton variant="secondary" small pendingText="Opening…">
                      Manage card
                    </SubmitButton>
                  </form>
                ) : (
                  <ButtonLink href="/pro/billing" variant="secondary" small>
                    Start membership
                  </ButtonLink>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                <div>
                  <p className="font-medium text-stone-900">Bank account for getting paid</p>
                  <p className="text-stone-600">
                    Your payout bank account and tax details are kept by Stripe, not by Crew Orchard.
                  </p>
                </div>
                <ButtonLink href="/pro/billing" variant="secondary" small>
                  {billing?.stripe_account_id ? "Open billing" : "Set up payments"}
                </ButtonLink>
              </div>
            </>
          ) : (
            <p>
              Crew Orchard does not keep your card. You enter it on Stripe&apos;s secure checkout page each
              time you approve and pay a bill, so there is no saved card to update here. Stripe may
              offer to remember it for you at checkout.
            </p>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <SectionTitle>Email</SectionTitle>
        <Card>
          <form action={changeEmail} className="space-y-4">
            <p className="text-sm text-stone-600">
              You sign in with <span className="font-medium text-stone-900">{viewer.email}</span>.
              Notifications go there too.
            </p>
            <Field label="New email address" hint="We send a confirmation link to the new address first.">
              <input name="email" type="email" required autoComplete="email" className={inputCls} />
            </Field>
            <div className="flex justify-end">
              <SubmitButton variant="secondary" pendingText="Sending…">
                Change email
              </SubmitButton>
            </div>
          </form>
        </Card>
      </section>

      <section>
        <SectionTitle>Password</SectionTitle>
        <Card>
          <form action={changePassword} className="space-y-4">
            <Field label="Current password">
              <input
                name="current_password"
                type="password"
                required
                autoComplete="current-password"
                className={inputCls}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input
                name="new_password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputCls}
              />
            </Field>
            <div className="flex justify-end">
              <SubmitButton variant="secondary" pendingText="Changing…">
                Change password
              </SubmitButton>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
