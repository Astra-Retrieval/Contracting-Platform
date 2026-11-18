import Link from "next/link";
import { ButtonLink, buttonCls, inputCls } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { APP_NAME, PRO_MONTHLY_PRICE_CENTS, TRIAL_DAYS, feePercentLabel } from "@/lib/config";

const categories = [
  ["general-contractor", "General contracting"],
  ["handyman", "Handyman"],
  ["carpentry", "Carpentry"],
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["painting", "Painting"],
  ["kitchen-remodel", "Kitchen remodeling"],
  ["bathroom-remodel", "Bathroom remodeling"],
  ["flooring", "Flooring"],
  ["roofing", "Roofing"],
  ["decks-fences", "Decks & fences"],
  ["landscaping", "Landscaping"],
];

// Pastel tints cycled across the trade tiles.
const tileTints = ["bg-brand-100", "bg-peach-100", "bg-lilac-100", "bg-sky-100", "bg-butter-100", "bg-blush-100"];

const customerSteps = [
  ["Describe your project", "A bookshelf install or a full renovation. Add photos, a budget, and your dates."],
  ["Compare quotes", "Ask as many pros as you like. See price, timeline, and payment schedule side by side."],
  ["Pay as work gets done", "Your pro bills each milestone as it comes due. You check the work, then approve and pay on the platform."],
];
const proSteps = [
  ["Show your work", "A profile with your trades, typical pricing, timeline, and photos of past jobs."],
  ["Build your crew", "Save your favorite subs, add them to a quote, and rate the ones who deliver."],
  ["Get paid on time", "Send a bill when a milestone is due. The customer pays straight into your own Stripe account."],
];

export default async function Home() {
  const viewer = await getViewer();
  const price = `$${PRO_MONTHLY_PRICE_CENTS / 100}`;

  return (
    <>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-wide text-brand-700 uppercase">
              From a bookshelf to a whole-house renovation
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-balance text-stone-900 md:text-5xl">
              Find the right pro, agree on a price, and pay as the work gets done.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-stone-600">
              {APP_NAME} runs your project end to end: quotes, budget, messages, milestone payments,
              and reviews you can trust, all in one place.
            </p>
            <form action="/pros" className="mt-8 flex max-w-xl gap-2">
              <input
                name="q"
                aria-label="What do you need done?"
                placeholder="What do you need done? e.g. tile a bathroom"
                className={inputCls}
              />
              <button className={buttonCls("primary")}>Search</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {viewer ? (
                <ButtonLink href="/dashboard" variant="dark">
                  Go to your dashboard
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/signup" variant="dark">
                    Start a project
                  </ButtonLink>
                  <ButtonLink href="/signup?role=pro" variant="secondary">
                    Join as a pro
                  </ButtonLink>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
              Example project
            </p>
            <p className="mt-1 font-semibold text-stone-900">Hall bathroom remodel</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                ["Deposit", "$2,400", "Approved and paid", "bg-emerald-100 text-emerald-800"],
                ["Rough plumbing & tile", "$4,800", "Bill sent, payment due", "bg-sky-100 text-sky-800"],
                ["Fixtures & final walkthrough", "$4,800", "Scheduled", "bg-stone-200 text-stone-700"],
              ].map(([name, amount, status, tone]) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2.5"
                >
                  <span>
                    <span className="block font-medium text-stone-900">{name}</span>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${tone}`}>
                      {status}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{amount}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-stone-600">
              <div className="rounded-lg bg-white p-2">
                <p className="text-base font-bold text-stone-900 tabular-nums">$12,000</p>Budget
              </div>
              <div className="rounded-lg bg-white p-2">
                <p className="text-base font-bold text-stone-900 tabular-nums">$7,200</p>Paid
              </div>
              <div className="rounded-lg bg-white p-2">
                <p className="text-base font-bold text-stone-900 tabular-nums">$4,800</p>Remaining
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">Browse by trade</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map(([slug, name], i) => (
            <Link
              key={slug}
              href={`/pros?category=${slug}`}
              className={`rounded-xl px-4 py-3.5 text-sm font-medium text-stone-800 ring-1 ring-black/5 hover:ring-brand-400 ${tileTints[i % tileTints.length]}`}
            >
              {name}
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 md:grid-cols-2">
          {[
            ["For homeowners", customerSteps],
            ["For contractors, subs, and handymen", proSteps],
          ].map(([title, steps]) => (
            <div key={title as string}>
              <h2 className="text-2xl font-bold tracking-tight">{title as string}</h2>
              <ol className="mt-6 space-y-5">
                {(steps as string[][]).map(([name, body], i) => (
                  <li key={name} className="flex gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-200 text-sm font-bold text-brand-950">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-stone-900">{name}</p>
                      <p className="mt-1 text-sm text-stone-600">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-6 rounded-2xl bg-brand-100 p-8 text-stone-900 md:grid-cols-[1.4fr_1fr] md:p-10">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Simple pricing for pros</h2>
            <p className="mt-3 max-w-lg text-stone-700">
              No pay-per-lead. One flat membership and a small fee only when you get paid. Free for
              homeowners, always.
            </p>
            <ButtonLink href="/signup?role=pro" className="mt-6">
              Start your {TRIAL_DAYS}-day free trial
            </ButtonLink>
          </div>
          <dl className="grid grid-cols-2 gap-4 self-center">
            <div className="rounded-xl bg-white/80 p-4">
              <dt className="text-sm text-stone-600">Membership</dt>
              <dd className="mt-1 text-3xl font-bold">
                {price}
                <span className="text-base font-medium text-stone-600">/mo</span>
              </dd>
            </div>
            <div className="rounded-xl bg-white/80 p-4">
              <dt className="text-sm text-stone-600">Per payment</dt>
              <dd className="mt-1 text-3xl font-bold">{feePercentLabel}</dd>
              <dd className="mt-1 text-xs text-stone-600">plus card processing</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
