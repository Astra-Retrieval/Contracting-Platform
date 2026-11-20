# Crew Orchard

A marketplace where homeowners run a project from idea to final payment, and where
contractors, subs and handymen win work, build crews and get paid. It covers jobs from a
single bookshelf install to a whole-house renovation.

The name is set in one place: `NEXT_PUBLIC_APP_NAME`.

**The goal.** Be the best place for customers to find a contractor, and for contractors and
subs to find work.

**Long-term vision.** Once the first city is online and bringing in revenue, Crew Orchard
grows from a marketplace into the tool a contractor runs their business on:

- **Project management for contractors**: calendar, tasks, change orders, daily logs,
  documents, sub scheduling, and job costing, all tied to the jobs won on the platform.
- **Parts and materials ordering built in**: build a materials list from a quote, order
  from suppliers inside the job, and track cost and delivery against the budget.

Neither is being built yet. The order is: first city live, then revenue, then these. The
detailed lists are in [To do](#16-to-do) under "Later".

**Contents**

1. [What it does](#1-what-it-does)
2. [Who uses it](#2-who-uses-it)
3. [Every page](#3-every-page)
4. [How a project flows](#4-how-a-project-flows)
5. [How money moves](#5-how-money-moves)
6. [Disputes](#6-disputes)
7. [Email notifications](#7-email-notifications)
8. [What it is built with](#8-what-it-is-built-with)
9. [The database](#9-the-database)
10. [Security model](#10-security-model)
11. [Setup](#11-setup)
12. [Settings reference](#12-settings-reference)
13. [Changing the look](#13-changing-the-look)
14. [Project layout](#14-project-layout)
15. [Status: what is tested and what is not](#15-status-what-is-tested-and-what-is-not)
16. [To do](#16-to-do)
17. [Related documents](#17-related-documents)

---

## 1. What it does

| For customers | For pros |
| --- | --- |
| Describe a project with photos, budget and dates | A public profile with trades, pricing, timeline and photos |
| Search pros by trade, location, rating and price | Receive quote requests and reply with a price and payment milestones |
| Request quotes from several pros and compare them side by side | Add any pro on the platform to a job as a sub, with a scope and an amount |
| Track planned and paid amounts in a budget tracker | Keep a list of favorite subs as a shortcut |
| Get a bill for each milestone as it comes due, then approve the work and pay | Send the bill for each milestone; the payment goes straight to the pro's own Stripe account |
| Report a problem with paid work and ask for a refund | Reply to disputes and offer a refund |
| | Subs bill the lead contractor on the platform and are paid the same way |
| Review the contractor and the subs | Rate subs who worked a job; those ratings are marked "verified" |
| Message any pro | Message customers and other pros |

**Pricing.** Customers use the platform for free. Pros pay $29 a month after a 30-day free
trial, plus a 5% platform fee on what customers pay them. There is no platform fee when a
lead contractor pays a sub's bill. Stripe's card processing fee is separate; Stripe takes it
from the pro who was paid, so the platform keeps its full 5%. All of these numbers live in
`src/lib/config.ts` (`SUB_BILL_FEE_BPS` can add a fee on sub bills).

## 2. Who uses it

| Role | How you get it | What it can do |
| --- | --- | --- |
| Customer | Choose "I need work done" at sign-up | Projects, quote requests, payments, reviews |
| Pro | Choose "I'm a pro" at sign-up | Profile, quoting, jobs, subs, billing. The same account can be lead contractor on one job and a sub on another |
| Admin | Set by hand in the database (see [Setup](#11-setup)) | Everything their account type can do, plus deciding disputes |

## 3. Every page

| Page | Address | Who | What happens there |
| --- | --- | --- | --- |
| Home | `/` | Anyone | Landing page, browse by trade, pricing |
| Find pros | `/pros` | Anyone | Search with filters |
| Pro profile | `/pros/[id]` | Anyone | Public profile; request a quote, message, add to favorites |
| Create account | `/signup` | Signed out | Sign up as customer or pro |
| Sign in | `/login` | Signed out | Email and password |
| Reset password | `/forgot-password`, `/reset-password` | Anyone | Email a reset link, then choose a new password |
| Pro waitlist | `/waitlist` | Anyone | Pros outside South Carolina ask to be told when their state opens |
| Dashboard | `/dashboard` | Signed in | Different view for customers and pros |
| My projects | `/projects` | Customer | List of projects |
| New project | `/projects/new` | Customer | Create a project with photos; choose whether pros can find it |
| Project | `/projects/[id]` | Customer | Quotes, milestones, payments, budget, disputes, reviews |
| Edit profile | `/pro/profile` | Pro | Profile fields, trades, photos |
| Licenses and insurance | `/pro/credentials` | Pro | Upload documents; see what the state requires for your trades |
| Find work | `/pro/find-work` | Pro | Search open projects and offer to quote them |
| Leads & jobs | `/pro/jobs` | Pro | Quote requests and active jobs |
| Lead / job | `/pro/jobs/[id]` | Pro | Build and send a quote, manage milestones, add and rate subs, answer disputes |
| Estimate templates | `/pro/templates`, `/pro/templates/[id]` | Pro | Saved estimates to start quotes from |
| Subs | `/pro/subs` | Pro | Sub invitations and favorite subs |
| Billing | `/pro/billing` | Pro | Membership, Stripe account setup, payments received |
| Payment setup | `/pro/billing/setup` | Pro | Stripe's account setup form, shown inside the site |
| Messages | `/messages`, `/messages/[id]` | Signed in | Conversations and live chat, with photos |
| Settings | `/settings` | Signed in | Name, location, email, password, and where payment methods are managed |
| Request a feature | `/feedback` | Signed in | Send an idea and see its status |
| Staff overview | `/admin` | Admin | Counts and links to the staff pages |
| Disputes | `/admin/disputes` | Admin | Decide disputes |
| Documents | `/admin/credentials` | Admin | Check uploaded licenses and insurance; approve or reject |
| Review moderation | `/admin/reviews` | Admin | Hide or restore a review |
| Feature requests | `/admin/feedback` | Admin | Set a status and reply to the member |
| Waitlist | `/admin/waitlist` | Admin | Pros waiting for their state |
| Setup check | `/setup` | Anyone | Shows which connections are missing |
| Terms, Privacy | `/terms`, `/privacy` | Anyone | Placeholders |
| Stripe webhook | `/api/stripe/webhook` | Stripe | Background updates from Stripe |
| Daily document check | `/api/cron/credentials` | Vercel schedule | Expiry reminders and marking documents expired |
| Email confirmation | `/auth/callback` | New members | Landing point for the confirmation link |

A visual version with sample screens is in `docs/site-map.html`.

## 4. How a project flows

1. **Customer creates a project** with a title, description, trade, budget, location and dates.
2. **Customer requests quotes** by opening pro profiles and sending the project to each one.
3. **Each pro replies with a quote**: scope, timeline, and a list of payment milestones. The
   quote total is the sum of the milestones. A pro can send a revised quote, which replaces
   the earlier one.
4. **The pro can add subs** to the quote. Each sub gets a scope and an agreed amount, and has
   to accept the invitation.
5. **Customer compares and accepts** a quote. It is added to the project's budget
   automatically. A project can have more than one accepted quote (for example a plumber and
   a painter hired separately).
6. **Work proceeds milestone by milestone**: the milestones are the payment schedule. When
   one comes due the pro sends the bill, and the customer approves the work and pays.
7. **Subs bill the lead contractor** for their part, in one bill or several, and the lead
   pays them on the platform.
8. **Reviews**: once a milestone has been paid, the customer can review the contractor
   and each sub, and the contractor can rate each sub.

A milestone moves through these states:

| State | Meaning | Who moves it on |
| --- | --- | --- |
| Scheduled | On the payment schedule, not billed yet | Pro sends the bill |
| Bill sent, payment due | Pro has asked for payment | Customer approves and pays (pro can recall the bill) |
| Approved and paid | Money went to the pro | Final, unless a problem is reported |
| Paid, problem reported | Customer reported a problem after paying | See [Disputes](#6-disputes) |
| Refunded | Whole payment went back to the customer | Final |

### Building a quote

A pro prices a quote in one of two ways, and can switch between them:

- **Simple price**: type the payment milestones; the total is their sum.
- **Itemized estimate**: sections (for example Demolition, Framing, Finishes), each with
  line items. A line has a description, a type (labor, materials, equipment, subcontractor,
  other), a quantity and unit, the pro's cost per unit, and a markup. On top of the lines
  the pro can add a contingency percentage, sales tax on materials, and a discount. The
  builder shows cost, markup, total, and profit as the pro types.

**What the customer sees is the pro's choice**: the total only, section totals, line items
with section prices, or line items with prices. A section can be hidden, in which case it
is folded into "Other work". The pro can also list what is and is not included and how
long the price is good for. The total and the payment milestones are always sent. The pro's
costs and markup are never sent: they are kept in a private table, and the customer's copy
is built on the server.

In an itemized quote each milestone is a share of the total, so the milestones always add
up. Any quote can be saved as a **template** when it is sent, and templates can be created
and edited at `/pro/templates`. Sending a revised quote starts from the previous one.

### Licenses and insurance

Pros can join and quote without any documents, but the site is plain about what is missing.

- **At sign-up** a pro ticks their trades and the documents they hold. A trade with a ⚑
  flag is one where South Carolina requires a license or registration.
- **Uploading** (`/pro/credentials`): each document has a type, number, name on the
  document, classification, expiry date, and a photo or PDF. The file is private (only the
  pro and staff can open it). The details are public.
- **What customers see**: a pro's profile lists every document with its number, holder,
  expiry date, status, and a link and instructions to check it with the issuer. Each quote
  shows the same list with a reminder to check before accepting.
- **The warning**: a pro whose trades need a state license and who has not provided one
  carries a red "No proof of license provided" label on their profile, in search, and on
  every quote. An uploaded document clears the warning at once and shows as "Provided, not
  yet checked" until staff check it.
- **Staff check** (`/admin/credentials`): open the file, open the issuer's lookup, compare
  the name, status, classification, and expiry date, then mark it checked or reject it with
  a note. South Carolina's lookups sit behind a "not a robot" test, so this step is done by
  a person.
- **Expiry**: a job runs once a day (`/api/cron/credentials`, scheduled in `vercel.json`).
  Thirty days before a document expires it emails the pro. After the date it marks the
  document expired, the warning returns, and staff get a summary email.

All of the rules live in `src/lib/credentials.ts`.

**South Carolina rules built in** (residential work; checked against the S.C. Code and LLR
on Nov 19, 2026):

| Credential | When the state requires it | Bond | Expires |
| --- | --- | --- | --- |
| Residential Builder license (Residential Builders Commission) | Home building, repair, or remodeling over $5,000 | $15,000, always | June 30, even years |
| Residential Specialty Contractor registration | Jobs over $500 in: roofing, painting and wallpaper, drywall, floor covering, masonry, carpentry, siding, insulation, stucco, solar. Up to three per person | $5,000 for any one job over $5,000 | June 30, odd years |
| Residential Electrician, Plumber, HVAC Installer and Repairer licenses | Jobs over $500 | $10,000 for any one job over $5,000 | June 30, odd years |
| General or Mechanical Contractor license (Contractor's Licensing Board) | Jobs over $10,000. Also accepted for residential work in its classification | Optional, by group | October 31: general even years, mechanical odd years |
| Workers' compensation | Four or more regular employees | | Policy date |
| General liability insurance | Not required by the state for these licenses | | Policy date |
| EPA lead-safe firm certification | Federal: paid work disturbing paint in homes built before 1978 | | 5 years |
| EPA Section 608 card | Federal: handling refrigerant | | Never |
| Pesticide applicator license (Clemson) | Applying pesticide for pay | $50,000 liability insurance | December 31, yearly |

| Trade on the site | Flagged as needing | Notes |
| --- | --- | --- |
| General contracting, Kitchen remodeling, Bathroom remodeling | Residential Builder | |
| Carpentry, Painting, Drywall, Flooring, Roofing, Masonry & concrete | Specialty registration (or Builder) | Flooring: hardwood is not named by the state |
| Plumbing, Electrical, Heating & cooling | The trade license (or Mechanical Contractor) | |
| Handyman, Landscaping, Demolition & hauling, Design & architecture | Nothing | No handyman license exists; limits still apply per trade |
| Cabinetry, Tile & stone, Decks & fences, Windows & doors | Nothing yet | The state does not name these. See the open questions below |

Sources: [S.C. Code Title 40, Chapter 59](https://www.scstatehouse.gov/code/t40c059.php)
(residential builders and specialty contractors),
[Chapter 11](https://www.scstatehouse.gov/code/t40c011.php) (contractors),
[Regulation 106](https://www.scstatehouse.gov/coderegs/Chapter%20106.pdf),
[Title 42, Chapter 1](https://www.scstatehouse.gov/code/t42c001.php) (workers' compensation),
[LLR Residential Builders Commission](https://llr.sc.gov/res/), and
[LLR Contractor's Licensing Board](https://llr.sc.gov/clb/).

**Open questions to put to LLR** (Residential Builders Commission, before relying on them):

- Which classification covers tile and stone, hardwood flooring, cabinetry, windows and
  doors, decks and fences, and flatwork concrete. Until answered, these trades are not
  flagged.
- The exact expiry date of specialty registrations and trade licenses (June 30 of odd
  years is taken from the 2025-2027 renewal cycle).
- Whether LLR's bulk license verification service covers these boards, and its cost.

This is not legal advice. Have a South Carolina lawyer confirm the rules before launch.

## 5. How money moves

The platform never holds anyone's money. Payments use Stripe Connect with **direct
charges**: every pro has their own Stripe account and is paid into it directly.

1. A pro sets up their Stripe account from the Billing page. They cannot send a bill until
   Stripe says the account can take payments.
2. The pro sends the bill for a milestone. The customer approves the work and pays through
   Stripe Checkout. Card details never touch this site.
3. The charge is made on the pro's Stripe account. The platform's 5% is taken off the top as
   an application fee, and Stripe takes its card processing fee from the pro.

   | Line | Amount |
   | --- | --- |
   | Milestone amount | 100% |
   | Platform fee (to the platform) | 5% |
   | Stripe processing fee (taken by Stripe from the pro) | About 2.9% + 30¢ on cards |
   | Pro keeps | The rest, paid out to their bank by Stripe |

4. Subs are paid the same way. A sub sends the lead contractor a bill for some or all of
   their agreed amount, the lead pays it through Checkout, and the charge is made on the
   sub's Stripe account. The platform takes no fee on sub bills.

Example: a $4,000 milestone paid by card. The platform receives $200, Stripe takes about
$116, the contractor keeps about $3,684.

Stripe, not the platform, is responsible if a pro's Stripe balance goes negative (for
example after a refund or a chargeback). Pros get Stripe's Express dashboard for their
account, and complete Stripe's setup form inside the site (`/pro/billing/setup`).

The membership is a separate, normal Stripe subscription paid to the platform. While it is
trialing or active the pro's profile appears in search. If it lapses, the profile is hidden
from search.

All of this logic is in `src/lib/payments.ts` and `src/app/actions/payments.ts`.

## 6. Disputes

After paying a milestone, a customer can report a problem. The pro already has the money,
so a dispute is a request to put things right or refund. The pro and the platform are
emailed.

1. The pro replies and can offer a refund of any amount up to the milestone.
2. It ends one of three ways:
   - the customer **accepts the offer** and that amount is refunded;
   - the customer **closes** the dispute with no refund;
   - either side **asks the platform to decide**, and an admin sets the refund on
     `/admin/disputes` with a note both sides receive.
3. Refunds go back to the customer's original payment method through Stripe. They come out
   of the pro's Stripe balance, and the platform returns its fee on the refunded part.

Not covered: a customer disputing the charge with their bank (a chargeback). That happens
in Stripe, on the pro's account, outside this flow. Sub bills have no dispute flow.

## 7. Email notifications

Emails are sent through Resend. Each has a button that opens the relevant page.

| Event | Sent to |
| --- | --- |
| New quote request | Pro |
| Quote sent or revised | Customer |
| Quote accepted, or not selected | Pro |
| Pro declined a request | Customer |
| Milestone bill sent | Customer |
| Milestone paid | Pro |
| Sub bill sent | Lead contractor |
| Sub bill paid | Sub |
| Refund issued | Customer |
| Sub invitation | Sub |
| Sub accepted or declined | Lead contractor |
| New message (first unread only, not every line) | The other person |
| New review or sub rating | Pro |
| Dispute opened | Pro and platform staff |
| Dispute replied to, escalated, withdrawn, resolved | The other party; staff when escalated |

Without a Resend key the app works normally and writes each email to the server log instead.

## 8. What it is built with

| Layer | Choice | Used for |
| --- | --- | --- |
| Web app | Next.js 16 (App Router, TypeScript, Tailwind CSS 4) | Pages, server actions, API routes |
| Database | Supabase Postgres with row-level security | All data |
| Sign-in | Supabase Auth | Email and password, sessions |
| Files | Supabase Storage | Profile and project photos |
| Live updates | Supabase Realtime | Messaging |
| Marketplace payments | Stripe Connect (Express accounts) | Charging customers, paying pros and subs |
| Subscription | Stripe Billing | Pro membership and trial |
| Email | Resend | Notifications |

Pages are rendered on the server for each request. Every change to data goes through a
server action in `src/app/actions/`.

## 9. The database

The schema is in `supabase/migrations/`. Files are numbered and applied in order.

| Table | Holds |
| --- | --- |
| `profiles` | Every user: role, name, admin flag |
| `pro_profiles` | Public pro details: business, pricing, timeline, ratings, whether listed in search |
| `pro_credentials` | Licenses, insurance, bonds, and certifications a pro uploaded. Details are public; the file path and staff notes are not |
| `pro_billing` | Private: the pro's Stripe account, customer and subscription ids, whether they can take payments |
| `categories`, `pro_categories` | The 20 trades and which pros offer them |
| `portfolio_photos`, `project_photos` | Photo records (files are in the `photos` storage bucket). Uploaded documents are in the private `credentials` bucket |
| `projects` | Customer projects, and whether each is open to all pros (`open_to_pros`) |
| `quote_requests` | One pro quoting one project. `source` says whether the customer invited the pro or the pro found the project under Find work |
| `quotes` | A pro's quote; a revision replaces the earlier one. `breakdown` is the part of the estimate the pro chose to show the customer |
| `quote_estimates` | Private: the pro's full estimate behind a quote, with costs and markup |
| `estimate_templates` | Private: a pro's saved estimates |
| `milestones` | The payment schedule of a quote, with status |
| `budget_items` | Budget tracker lines; accepted quotes are added automatically |
| `favorite_subs` | A pro's saved subs |
| `project_subs` | Sub invitations on a quote: scope, amount, status |
| `conversations`, `messages` | Messaging, one thread per pair of people. A message can carry up to 6 photos |
| `payments` | One row per milestone payment, with the platform fee and refunds |
| `sub_bills` | Bills from a sub to a lead contractor, and their payment |
| `transfers` | No longer used (left from the earlier hold-and-release design) |
| `disputes` | Reported problems, the pro's reply and offer, photos from both sides, the outcome |
| `reviews` | Customer reviews of pros. Staff can hide one; hidden reviews do not count in ratings |
| `feature_requests` | Ideas from members, with a status and a staff note |
| `waitlist` | Pros outside the launch state. Server access only |
| `sub_ratings` | Contractor ratings of subs (verified) |

Money is stored in cents. Rating averages on `pro_profiles` are kept up to date by database
triggers. A trigger also creates the profile rows when someone signs up.

**Changing the schema.** Add a new numbered file to `supabase/migrations/` and apply it to
the Supabase project. Do not edit a file that has already been applied.

## 10. Security model

- **Row-level security is on for every table.** A user can only read rows they are a party
  to: their own projects, quotes addressed to them, conversations they are in, and so on.
  Pro profiles, reviews and trades are public.
- **Users can write very little directly**: their own profile fields, their projects and
  budget lines, quote requests, favorites, messages and photo records.
- **Everything involving money or status is written by the server**, using the service-role
  key, after it has checked who is signed in: quotes, milestones, sub invitations, payments,
  transfers, disputes, reviews. From the browser, a pro cannot list themselves in search,
  edit their rating, accept their own quote or mark a bill as paid.
- **Column-level limits**: on their own profile, a pro can edit the descriptive fields but
  not `is_listed`, `payouts_ready` or the rating columns. Nobody can set `is_admin` through
  the app.
- **Photos**: anyone can view; a signed-in user can upload and delete only inside a folder
  named after their own user id.
- **Secrets** live in `.env.local`, which is git-ignored. Only the Supabase URL and
  publishable key reach the browser.

## 11. Setup

You need Node.js 20 or newer.

### Step 1: Install

```bash
npm install
```

Copy `.env.example` to `.env.local`. Each value is explained in section 12.

### Step 2: Supabase

1. Create a project at supabase.com.
2. In **SQL Editor**, run each file in `supabase/migrations/` in order.
3. In **Project Settings → API**, copy the project URL, the publishable (anon) key and the
   secret (service-role) key into `.env.local`.
4. In **Authentication → URL Configuration**, set the Site URL to your app URL and add
   `<your app URL>/auth/callback` to the redirect URLs. Locally that is
   `http://localhost:3000` and `http://localhost:3000/auth/callback`.
5. Optional for testing: turn off **Confirm email** under Authentication → Sign In /
   Providers → Email.

### Step 3: Stripe

Use test mode until launch.

1. **Developers → API keys**: copy the secret key (`sk_test_...`) into `STRIPE_SECRET_KEY`
   and the publishable key (`pk_test_...`) into `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. **Connect**: turn it on and complete the platform profile, choosing the setup where
   customers pay the pro directly, the pro pays the platform a fee, and Stripe is responsible
   for negative balances on pros' accounts. Choose embedded onboarding and the Express
   dashboard.
3. **Settings → Billing → Customer portal**: activate it.
4. **Webhooks**: add two destinations, both pointing at `<your app URL>/api/stripe/webhook`:
   - **Your account**: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted` (memberships).
   - **Connected accounts**: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`, `account.updated` (milestone and sub-bill
     payments, and pros finishing Stripe setup).
   - **Connected accounts, thin payload**: `v2.core.account[requirements].updated` and
     `v2.core.account[configuration.merchant].capability_status_updated` (changes to what
     Stripe needs from a pro).

   Put every signing secret in `STRIPE_WEBHOOK_SECRET`, separated by commas.

Locally, the Stripe CLI can forward events and prints a secret to use:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The app also confirms payments when the customer returns from checkout, so local testing
works without the webhook. Production needs it.

### Step 4: Email (optional)

1. Create an account at resend.com and verify the domain you will send from.
2. Put an API key in `RESEND_API_KEY`, a from-address on that domain in `EMAIL_FROM`, and the
   address for staff dispute alerts in `ADMIN_EMAIL`.

### Step 4b: Daily document check

Add `CRON_SECRET` (any long random value) to the hosting environment. Vercel runs
`/api/cron/credentials` once a day, as scheduled in `vercel.json`, and sends that value
with each call. Without it the job refuses to run.

### Step 5: Make yourself an admin

Sign up on the site, then run this in the Supabase SQL editor with your email:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

### Step 6: Run

```bash
npm run dev
```

Open http://localhost:3000. The `/setup` page shows which connections are still missing.

### Hosting

The app deploys to Vercel as a standard Next.js project. Import the GitHub repository, add
the same settings from `.env.local` with `NEXT_PUBLIC_APP_URL` set to the live address, then
add that address to Supabase's redirect URLs and to a Stripe webhook endpoint.

## 12. Settings reference

| Setting | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | No | Name shown across the site and in emails |
| `NEXT_PUBLIC_APP_URL` | Yes | Where the site runs; used in emails and Stripe redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase secret key. Server only. Never expose it |
| `STRIPE_SECRET_KEY` | For payments | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Recommended | Stripe publishable key; shows Stripe's setup form inside the site. Without it pros are sent to Stripe's hosted form |
| `STRIPE_WEBHOOK_SECRET` | For production | Signing secret of the webhook endpoint |
| `STRIPE_PRO_PRICE_ID` | No | A Stripe Price for the membership. If empty, checkout creates the price from `config.ts` |
| `RESEND_API_KEY` | For email | Resend API key |
| `EMAIL_FROM` | For email | From-address on a verified domain |
| `ADMIN_EMAIL` | No | Where staff alerts go: disputes, documents to check, feature requests |
| `CRON_SECRET` | For the daily job | Protects `/api/cron/credentials`. Any long random value |

Business settings in `src/lib/config.ts`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `PLATFORM_FEE_BPS` | 500 | Platform fee in basis points (500 = 5%) |
| `PRO_MONTHLY_PRICE_CENTS` | 2900 | Membership price |
| `TRIAL_DAYS` | 30 | Free trial for first-time subscribers |
| `SUB_BILL_FEE_BPS` | 0 | Platform fee on bills a lead pays a sub (0 = none; 500 = 5%) |
| `PROCESSING_FEE_BPS`, `PROCESSING_FEE_FIXED_CENTS` | 290, 30 | Used only for estimates shown to pros. Stripe takes the real fee from the pro |

## 13. Changing the look

The color scheme is pastel, led by green. It is defined once, in `src/app/globals.css`:

- `--color-brand-50` to `--color-brand-950`: the green scale. 50 is the page background,
  300 is the main button (with dark text), 700 is link text, 800 is the dark button.
- `--color-peach-100`, `--color-lilac-100`, `--color-butter-100`, `--color-blush-100`: the
  supporting pastels used for trade tiles and status badges.

Change those values and the whole site follows. Shared building blocks (buttons, cards,
badges, form fields) are in `src/components/ui.tsx`. The trade list is in the `categories`
table.

## 14. Project layout

```
supabase/migrations/        Database schema and access rules, numbered
src/lib/config.ts           Name, fees, prices, trial length
src/lib/payments.ts         Pro Stripe accounts, checkout fulfilment, dispute refunds
src/lib/email.ts            Notification emails
src/lib/auth.ts             Who is signed in; customer / pro / admin checks
src/lib/supabase/           Supabase clients: signed-in user, service-role, browser
src/lib/stripe.ts           Stripe client
src/lib/estimate.ts          Estimate maths, the customer's copy, and input cleaning
src/lib/credentials.ts       Document types, which trades need which, and the state rules
src/lib/data.ts, format.ts  Shared lookups and formatting
src/app/actions/            Server actions: every write goes through one of these
  auth, account, profile, projects, quotes, subs, messages, payments, disputes, reviews,
  feedback, admin, credentials
src/app/                    Pages (see section 3) and the Stripe webhook
src/components/             Shared UI, navigation, chat, photo uploader and picker,
                            quote builder, quote breakdown, dispute panel, staff tabs
supabase/templates/         Branded email templates to paste into Supabase
src/app/loading.tsx         Placeholder shown at once while a page's data loads
vercel.json                 Runs the site's servers in Oregon, next to the database
src/proxy.ts                Keeps the sign-in session fresh on every request
docs/site-map.html          Page map with sample screens and a change log
```

## 15. Status: what is tested and what is not

Tested against a real Supabase project with test accounts:

- Sign-in and role-based dashboards
- Pro profile editing and search
- Creating a project and requesting a quote
- Sending and revising a quote with milestones
- Searching all pros, inviting a sub, accepting the invitation
- Accepting a quote and the budget tracker
- Messaging, unread counts and live delivery
- Disputes up to the refund step: report, hold, reply with offer, withdraw
- Photo upload rules
- Email notifications firing at the right moments (logged, not sent)
- Database access rules, in an isolated test database

Tested against Stripe in test mode (sandbox):

- Starting a membership with the free trial, and the billing portal
- Creating a pro's Stripe account and opening Stripe's setup form
- Pro sends a milestone bill; customer approves and pays; the charge lands on the pro's
  Stripe account with the 5% platform fee
- A dispute on a paid milestone, escalation, the admin decision, and a partial refund from
  the pro's account with the platform fee returned on the refunded part
- A sub billing the lead contractor and being paid
- Reviews from the customer and a lead's rating of a sub

Not yet tested:

- A pro completing Stripe's setup form. The payment tests above ran on test accounts that
  had not finished it, which Stripe's sandbox allows; the app itself blocks billing until
  setup is complete.
- Stripe webhooks (they need a hosted address)
- The sign-up form's email confirmation path
- Real email delivery
- A hosted deployment

There is no automated test suite yet.

## 16. To do

Nothing in this list is built yet unless it says so.

### Legal documents (before real payments)

- [ ] **Terms of service** for customers and pros. `/terms` is a placeholder.
- [ ] **Privacy policy**. `/privacy` is a placeholder.
- [ ] **Pro agreement**: membership, the platform fee, conduct, removal from the platform,
      and that pros are independent businesses, not employees or agents of Crew Orchard.
- [ ] **Payment terms**: customers pay pros directly through Stripe; Crew Orchard is not a
      party to the construction contract and does not hold funds. Never describe payments
      as "escrow".
- [ ] **Dispute and refund policy**: how long a customer has to report a problem, what the
      platform can and cannot decide, and how chargebacks are handled.
- [ ] **Review and content policy**: what can be posted, how reviews are moderated, and
      how to report a profile.
- [ ] **Acceptable use and anti-circumvention**: taking a job off the platform to avoid the
      fee.
- [ ] **Cookie notice and data requests** (deletion and export), as required where you
      operate.
- [ ] **E-sign consent and record keeping** for accepted quotes, which act as the
      agreement between customer and pro.
- [ ] **Business basics**: company formation, business insurance for the platform itself,
      and a lawyer's review of all of the above.
- [ ] Decide how **sales tax and 1099 reporting** are handled.

### License and insurance verification

Built Nov 19, 2026 (see section 4, "Licenses and insurance").

- [x] Pros upload licenses, registrations, insurance, bonds, and certifications. Files are
      stored privately.
- [x] Staff review page: approve or reject each document with a note.
- [x] Status shown on profiles, in search, and on quotes, with a red warning when required
      proof is missing. Pros without documents can still join and quote.
- [x] Expiry reminder by email 30 days before a document expires, and the document is
      marked expired after the date. Runs daily.
- [x] South Carolina trades and thresholds recorded in `src/lib/credentials.ts`.
- [ ] Add `CRON_SECRET` on Vercel so the daily job runs (section 11).
- [ ] Put the open questions in section 4 to LLR, then flag the trades they confirm.
- [ ] A search filter for "license checked" pros.
- [ ] A second reminder at 7 days, and a warning on a quote over $5,000 when no bond is on
      file.
- [ ] Decide whether staff re-check active licenses on a schedule, since a license can be
      suspended before it expires.
- [ ] Optional: ask insurers to list Crew Orchard as a certificate holder; consider LLR's
      bulk verification service or a third-party checker as volume grows.

### Stripe payments and payouts

- [x] Membership checkout and billing portal (tested in Stripe's sandbox).
- [x] Customer pays the pro directly, with the 5% platform fee (tested in the sandbox).
- [x] The **publishable key** is set on the hosted site, so Stripe's setup form shows inside it.
- [ ] A test pro **completes Stripe's setup form** end to end, and the site unlocks billing.
- [x] **Webhook destinations** on the hosted site (section 11, step 3).
- [ ] **Your own payouts**: activate the live Stripe account, add the business bank
      account, and choose a payout schedule. Membership fees and the 5% land in the
      platform's Stripe balance and are paid out from there.
- [x] The hosted site runs on **live keys**.
- [ ] Make one small **real payment and refund** on the hosted site.
- [ ] Review the **Express dashboard** settings and branding pros will see.
- [ ] Decide whether to offer **bank transfer (ACH)** to cut card fees on large jobs.
- [ ] Handle **card chargebacks**, which happen on the pro's Stripe account.
- [x] Decided: the customer pays the lead, and the lead pays subs through sub bills. No
      automatic split.

### Later: project management for pros

Part of the long-term vision. Not started until the first city is live and earning.

- [ ] **Job calendar**: start and end dates per job and per milestone, across all jobs.
- [ ] **Task lists** per job, assignable to subs, with due dates.
- [ ] **Change orders**: propose a change in scope and price; the customer approves and the
      payment schedule updates.
- [ ] **Daily log and progress photos** the customer can see.
- [ ] **Documents per job**: permits, plans, contracts, lien waivers.
- [ ] **Sub scheduling**: who is on site which day; availability requests.
- [ ] **Materials and expense tracking** against the quote, to show job profit.
- [ ] **Time tracking** for hourly work.
- [ ] **Punch list and final walkthrough** before the last bill.
- [x] **Estimate builder and templates** (built Nov 19, 2026; see section 4).
- [ ] **Job status board**: leads, quoted, scheduled, in progress, waiting on payment, done.

### Later: parts and materials ordering

Part of the long-term vision. Not started until the first city is live and earning.

- [ ] **Materials list** built from a quote or a job, with quantities.
- [ ] **Supplier catalog and pricing**: decide which suppliers to work with (national
      chains, local yards) and how prices and stock are fetched.
- [ ] **Order inside the job**: place the order, choose delivery to site or pickup, and
      keep the receipt with the job.
- [ ] **Cost tracking**: ordered materials count against the quote to show job profit.
- [ ] **Delivery tracking** and alerts when an order is delayed.
- [ ] Decide the **business model**: supplier referral fees, a margin on orders, or a
      feature of a higher membership tier.

### Admin features

- [ ] An **admin area** beyond disputes: search members, see a pro's membership, payments,
      disputes, and reviews in one place.
- [ ] **Removal of pros by admins**: take a pro out of search and stop new quotes, with a
      reason on record and an email to the pro. Decide what happens to jobs in progress.
- [ ] **Automatic pauses that leave the decision to an admin**: system checks (for example
      several disputes in a short time, a run of low ratings, an expired license or
      insurance document, a failed membership payment, or reports from customers) pause
      the pro and put them in a staff review queue. An admin then restores or removes them.
- [ ] A **log of admin actions**: who did what, to which account, and when.
- [x] **Review moderation**: staff hide or restore a customer review, with a reason. Sub
      ratings are not covered yet.
- [x] A **forgotten-password** link on the sign-in page. Paste
      `supabase/templates/reset-password.html` into Supabase for a branded email.

### Feedback

- [x] A place where customers and pros can **request features** (`/feedback`), with a
      staff page to set each request to planned, done, or not planned and reply.

### Launch area and growth

- [x] The site says Crew Orchard is **open in South Carolina first**,
      with more states coming (home page banner, pro sign-up, footer). The states are
      `LAUNCH_STATES` in `src/lib/config.ts`.
- [x] A **waitlist for pros outside the launch states** (`/waitlist`), listed for staff at
      `/admin/waitlist`.
- [ ] Email the waitlist when a state opens.
- [ ] Create a **service email** address (for example `support@creworchard.com`) for
      customer and pro questions, and show it on the site and in emails.
- [ ] Build out the **go-to-market strategy**: how the first pros and customers in South
      Carolina are found, and the order in which other states open.

### Before launch

- [ ] Check contractor licensing rules for the launch state.
- [x] Remove any test accounts and data (done Nov 19, 2026; repeat after any later testing).
- [ ] Real email delivery with a verified sending domain.
- [ ] An automated test suite.

## 17. Related documents

- **Site map**: `docs/site-map.html`, every page, how they connect, sample screens and a
  change log. Add an entry to `UPDATES` in that file whenever pages change.
- **Product plan and go-to-market**: feature set, recommended features, business model,
  launch strategy and roadmap. Kept as a shared document outside this repository.
