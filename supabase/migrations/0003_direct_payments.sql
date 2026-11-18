-- Direct payments.
--
-- Money no longer passes through the platform. Milestones are a payment schedule: the pro
-- sends a bill when one comes due, the customer approves the work and pays, and the payment
-- goes straight to the pro's Stripe account with the platform fee taken off the top.
-- Subs bill the lead contractor the same way.

-- Milestones: pending (scheduled) -> billed (pro asked for payment) -> paid.
-- A paid milestone can be disputed; a dispute ends in paid (with or without a partial
-- refund) or refunded (refunded in full).
alter table public.milestones drop constraint milestones_status_check;
update public.milestones
   set status = case status
                  when 'funded'    then 'paid'
                  when 'released'  then 'paid'
                  when 'submitted' then 'billed'
                  else status
                end;
update public.milestones set status_before_dispute = 'paid' where status_before_dispute is not null;
alter table public.milestones
  add constraint milestones_status_check
  check (status in ('pending', 'billed', 'paid', 'disputed', 'refunded'));
alter table public.milestones rename column funded_at to billed_at;
alter table public.milestones rename column released_at to paid_at;

-- The pro's Stripe account that was charged, so refunds and lookups go to the right place.
alter table public.payments add column stripe_account_id text;

-- Bills a sub sends to the lead contractor for their part of a job.
create table public.sub_bills (
  id                          uuid primary key default gen_random_uuid(),
  project_sub_id              uuid not null references public.project_subs (id) on delete restrict,
  project_id                  uuid not null references public.projects (id) on delete restrict,
  sub_id                      uuid not null references public.pro_profiles (user_id) on delete restrict,
  lead_pro_id                 uuid not null references public.pro_profiles (user_id) on delete restrict,
  note                        text not null default '',
  amount_cents                bigint not null check (amount_cents > 0),
  platform_fee_cents          bigint not null default 0,
  status                      text not null default 'billed'
                              check (status in ('billed', 'paid', 'cancelled')),
  stripe_account_id           text,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_charge_id            text,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now()
);
create index sub_bills_project_sub_idx on public.sub_bills (project_sub_id);
create index sub_bills_sub_idx on public.sub_bills (sub_id);
create index sub_bills_lead_idx on public.sub_bills (lead_pro_id);

-- Readable by the two pros involved. All writes go through the server.
alter table public.sub_bills enable row level security;
create policy "see own sub bills" on public.sub_bills for select
  using (sub_id = auth.uid() or lead_pro_id = auth.uid());
revoke all on public.sub_bills from anon, authenticated;
grant select on public.sub_bills to authenticated;
grant all on public.sub_bills to service_role;

comment on table public.transfers is
  'No longer written. Payouts used to be transfers from the platform; payments now go directly to each pro.';
