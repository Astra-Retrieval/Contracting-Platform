import Link from "next/link";
import { joinWaitlist } from "@/app/actions/feedback";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Flash, inputCls, type SearchParams } from "@/components/ui";
import { APP_NAME, LAUNCH_STATE_NAME, isLaunchState, isSupabaseConfigured } from "@/lib/config";
import { getCategories } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Join the waitlist" };

const STATES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  );

export default async function WaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const categories = isSupabaseConfigured ? await getCategories(await createClient()) : [];

  return (
    <div className="page max-w-md!">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Join the pro waitlist</h1>
      <p className="mb-6 text-sm text-stone-600">
        {APP_NAME} is open in {LAUNCH_STATE_NAME} first, and more states are coming soon. If you
        work somewhere else, leave your details and we will email you when we open in your state.
      </p>
      <Flash params={params} />
      <Card>
        <form action={joinWaitlist} className="space-y-4">
          <Field label="Your name">
            <input name="name" required maxLength={120} autoComplete="name" className={inputCls} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <Field label="Main trade">
            <select name="trade" defaultValue="" className={inputCls}>
              <option value="">Choose a trade</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="City">
              <input name="city" maxLength={80} autoComplete="address-level2" className={inputCls} />
            </Field>
            <Field label="State">
              <select name="state" required defaultValue="" autoComplete="address-level1" className={inputCls}>
                <option value="" disabled>
                  Choose
                </option>
                {STATES.filter((s) => !isLaunchState(s)).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {/* Hidden from people; a filled-in value marks an automated submission. */}
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <SubmitButton className="w-full" pendingText="Joining…">
            Join the waitlist
          </SubmitButton>
          <p className="text-xs text-stone-500">
            We only use this to tell you when {APP_NAME} opens near you.
          </p>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-stone-600">
        Work in {LAUNCH_STATE_NAME.replace(" and ", " or ")}?{" "}
        <Link href="/signup?role=pro" className="font-semibold text-brand-700 hover:underline">
          Join as a pro now
        </Link>
      </p>
    </div>
  );
}
