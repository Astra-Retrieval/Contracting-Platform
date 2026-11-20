import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Flash, cn, inputCls, type SearchParams } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { CREDENTIAL_TYPES, tradeNeedsDocs } from "@/lib/credentials";
import { getCategories } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import {
  LAUNCH_STATE_NAME,
  PRO_MONTHLY_PRICE_CENTS,
  TRIAL_DAYS,
  feePercentLabel,
  isSupabaseConfigured,
} from "@/lib/config";

export const metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured) redirect("/setup");
  if (await getViewer()) redirect("/dashboard");
  const params = await searchParams;
  const categories = await getCategories(await createClient());
  const role = params.role === "pro" ? "pro" : "customer";

  const tab = (value: string, label: string, hint: string) => (
    <Link
      href={`/signup?role=${value}`}
      aria-current={role === value ? "true" : undefined}
      className={cn(
        "flex-1 rounded-lg border px-4 py-3 text-left",
        role === value
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
          : "border-stone-200 bg-white hover:bg-stone-50",
      )}
    >
      <span className="block text-sm font-semibold text-stone-900">{label}</span>
      <span className="block text-xs text-stone-600">{hint}</span>
    </Link>
  );

  return (
    <div className="page max-w-md!">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Create an account</h1>
      <Flash params={params} />
      <div className="mb-4 flex gap-3">
        {tab("customer", "I need work done", "Free for homeowners")}
        {tab("pro", "I'm a pro", "Contractor, sub, or handyman")}
      </div>
      <Card>
        <form action={signUp} className="space-y-4">
          <input type="hidden" name="role" value={role} />
          <Field label="Your name">
            <input name="full_name" required autoComplete="name" className={inputCls} />
          </Field>
          {role === "pro" && (
            <Field label="Business name" hint="Shown on your public profile. You can change it later.">
              <input name="business_name" autoComplete="organization" className={inputCls} />
            </Field>
          )}
          {role === "pro" && (
            <>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-stone-800">What work do you do?</legend>
                <p className="mb-2 text-xs text-stone-500">
                  Tick every trade you take on. <span className="text-red-700">⚑</span> means South
                  Carolina requires a license or registration for it.
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-stone-700">
                      <input type="checkbox" name="trade" value={c.id} className="size-4 accent-brand-600" />
                      {c.name}
                      {tradeNeedsDocs(c.slug) && (
                        <span title="South Carolina requires a license or registration for this trade" className="text-red-700">
                          ⚑
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-stone-800">
                  Which licenses and insurance do you have?
                </legend>
                <p className="mb-2 text-xs text-stone-500">
                  Tick what you hold now. After you sign up you upload each one, and customers can
                  check them. You can join without them, but your profile and quotes will carry a
                  warning until you add proof.
                </p>
                <div className="space-y-2">
                  {CREDENTIAL_TYPES.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm text-stone-700">
                      <input type="checkbox" name="doc" value={t.id} className="size-4 accent-brand-600" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputCls}
            />
          </Field>
          <SubmitButton className="w-full" pendingText="Creating account…">
            Create account
          </SubmitButton>
          {role === "pro" && (
            <p className="rounded-lg bg-brand-50 p-3 text-xs text-stone-700">
              We are open in {LAUNCH_STATE_NAME} first, with more states coming soon. Work somewhere
              else?{" "}
              <Link href="/waitlist" className="font-semibold text-brand-700 underline">
                Join the waitlist
              </Link>{" "}
              and we will email you when we open in your state.
            </p>
          )}
          {role === "pro" && (
            <p className="text-xs text-stone-500">
              Pro membership is ${PRO_MONTHLY_PRICE_CENTS / 100}/month after a {TRIAL_DAYS}-day free
              trial, plus a {feePercentLabel} platform fee and card processing on payments you receive. You start the trial from your
              billing page; no card is needed to create an account.
            </p>
          )}
          <p className="text-xs text-stone-500">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </p>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
