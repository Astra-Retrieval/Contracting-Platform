# Trade Platform

A marketplace where homeowners run a project from idea to final payment, and where
contractors, subs and handymen win work, build crews and get paid. "Trade Platform" is a
placeholder name; change `NEXT_PUBLIC_APP_NAME` to rename the whole site.

Built with Next.js (App Router), Supabase (Postgres, auth, storage, realtime) and Stripe
(Connect for marketplace payments, Billing for the pro subscription).

## What is in the app

| Area | Where |
| --- | --- |
| Landing page, search by trade / location / rating / price | `/`, `/pros` |
| Public pro profile: pricing, timeline, photos, reviews, verified sub ratings | `/pros/[id]` |
| Sign up as a customer or a pro, sign in | `/signup`, `/login` |
| Customer: create projects, request quotes, compare, accept | `/projects`, `/projects/new`, `/projects/[id]` |
| Customer: pay milestones, approve work, budget tracker, reviews | `/projects/[id]` |
| Pro: profile editor with trades and photo gallery | `/pro/profile` |
| Pro: quote requests, quoting with milestones, active jobs | `/pro/jobs`, `/pro/jobs/[id]` |
| Pro: favorite subs, add subs to a quote, sub invitations, rate subs | `/pro/subs`, `/pro/jobs/[id]` |
| Pro: membership, payout setup, earnings | `/pro/billing` |
| Real-time messaging between any two members | `/messages` |
| Disputes: report a problem, reply and refund offer, staff decision | `/projects/[id]`, `/pro/jobs/[id]`, `/admin/disputes` |
| Email notifications for every key event | `src/lib/email.ts` |
| Stripe webhook | `/api/stripe/webhook` |

Pricing and fees live in `src/lib/config.ts`: $29/month after a 30-day trial, and a 5%
platform fee on every milestone payment. Stripe's processing fee is separate: the actual fee
for each payment is read from Stripe and deducted from the lead pro's payout, so the platform
keeps its full 5%.

A map of every page and how they connect is in `docs/site-map.html` (also published as an
artifact). Add an entry to `UPDATES` in that file whenever pages change.

## Setup

You need Node.js 20 or newer.

### 1. Install and configure

```bash
npm install
```

Fill in `.env.local` (copy it from `.env.example` if it does not exist). Each value is
explained in that file.

### 2. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and run it.
   It creates every table, the access rules, the photo storage bucket and the trade categories.
3. **Project Settings -> API**: copy the project URL, the anon (publishable) key and the
   service-role (secret) key into `.env.local`.
4. **Authentication -> URL Configuration**: set the Site URL to your app URL and add
   `<your app URL>/auth/callback` to the redirect URLs. For local work that is
   `http://localhost:3000` and `http://localhost:3000/auth/callback`.
5. Optional for local testing: turn off **Confirm email** under Authentication -> Sign In /
   Providers -> Email, so new accounts can sign in straight away.

### 3. Stripe

Use test mode until launch.

1. **Developers -> API keys**: copy the secret key (`sk_test_...`) into `STRIPE_SECRET_KEY`.
2. **Connect**: turn Connect on for the account (platform profile: marketplace, Express
   accounts). This is what lets the platform pay pros and subs.
3. **Settings -> Billing -> Customer portal**: activate the portal so pros can manage their
   membership.
4. **Webhooks**: add an endpoint at `<your app URL>/api/stripe/webhook` listening for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted` and (for connected accounts) `account.updated`.
   Put the signing secret in `STRIPE_WEBHOOK_SECRET`. If you create two endpoints, list both
   secrets separated by a comma.

   For local work, the Stripe CLI forwards events and prints a secret to use:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   The app also confirms payments when the customer returns from checkout, so local testing
   works without the webhook. Production needs it.

The app runs without Stripe: everything except membership, payouts and milestone payments
works, and every pro is listed in search until Stripe is connected.

### 4. Email (Resend)

1. Create an account at resend.com and verify the domain you will send from.
2. Create an API key and put it in `RESEND_API_KEY`. Set `EMAIL_FROM` to an address on the
   verified domain, and `ADMIN_EMAIL` to where dispute alerts for staff should go.

Without a key the app works normally and logs each email it would have sent.

### 5. Make yourself an admin

Admins decide disputes at `/admin/disputes`. After signing up, run this in the Supabase SQL
editor with your own email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000. The `/setup` page shows which connections are still missing.

## How money moves

1. A pro sends a quote split into milestones. The customer accepts it.
2. The customer pays a milestone through Stripe Checkout. The money sits in the platform's
   Stripe balance and the milestone shows as paid.
3. The pro marks the milestone complete. The customer approves it.
4. On approval the server keeps the 5% platform fee, deducts Stripe's processing fee, and
   sends Stripe transfers: each accepted sub gets their agreed amount in proportion to the
   milestone, and the lead pro gets the rest.
5. If a recipient has not finished payout setup, their transfer waits and is sent as soon as
   they do.

### Disputes

Instead of approving, a customer can report a problem on a paid milestone. The payment is put
on hold and the pro is emailed. The pro replies and can offer a refund. It then ends one of
four ways: the customer accepts the offer, releases the payment in full, withdraws the
dispute, or either side asks the platform to decide and an admin sets the refund. Any refund
goes back to the customer's card through Stripe and the remainder is released as in step 4.
Stripe keeps its processing fee on refunds, so on a full refund the platform absorbs it.

The logic is in `src/lib/payments.ts`.

## Security model

- Row-level security is on for every table. Users can only read rows they are a party to.
- Users can write only a short list of tables and columns (their own profile fields,
  projects, budget lines, favorites, messages, quote requests).
- Quotes, milestones, sub invitations, payments, transfers and reviews are written only by
  server actions using the service-role key, after checking the signed-in user. A pro cannot
  mark themselves subscribed, edit their rating, or release a payment from the browser.

## Before taking real payments

- Have a lawyer review the payment flow and write the terms and privacy policy
  (`/terms` and `/privacy` are placeholders).
- Check contractor licensing rules for your launch state.
- Switch to live Stripe keys and a live webhook endpoint.
- Write a dispute policy (time limits, what evidence counts) and link it from the terms.
- Handle card chargebacks: a customer disputing a charge with their bank is separate from the
  on-platform dispute flow and is not handled yet.

## Project layout

```
supabase/migrations/0001_init.sql   Database schema, access rules, seed categories
src/lib/config.ts                   Name, fee, price, trial length
src/lib/payments.ts                 Checkout fulfilment, milestone settlement, refunds, transfers
src/lib/email.ts                    Notification emails (Resend)
docs/site-map.html                  Page map with change log
src/lib/supabase/                   Supabase clients (user, service-role, browser)
src/app/actions/                    Server actions (all writes)
src/app/                            Pages
src/components/                     Shared UI, chat, photo uploader, milestone editor
```
