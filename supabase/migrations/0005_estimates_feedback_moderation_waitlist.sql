-- Estimates and templates, feature requests, review moderation, and the pro waitlist.

-- ---------------------------------------------------------------------------
-- Estimates
-- ---------------------------------------------------------------------------
-- What the pro chose to show the customer: sections, line items, inclusions, exclusions.
-- Built by the server from the pro's private estimate. Never holds costs or markup.
alter table public.quotes add column breakdown jsonb;

-- The pro's full working estimate behind a quote: costs, markup, contingency, tax.
-- Only the pro can read it.
create table public.quote_estimates (
  quote_id    uuid primary key references public.quotes (id) on delete cascade,
  pro_id      uuid not null references public.pro_profiles (user_id) on delete cascade,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index quote_estimates_pro_idx on public.quote_estimates (pro_id);
alter table public.quote_estimates enable row level security;
create policy "see own estimates" on public.quote_estimates for select using (pro_id = auth.uid());
revoke all on public.quote_estimates from anon, authenticated;
grant select on public.quote_estimates to authenticated;
grant all on public.quote_estimates to service_role;

-- Saved estimates a pro can start a quote from.
create table public.estimate_templates (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null references public.pro_profiles (user_id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index estimate_templates_pro_idx on public.estimate_templates (pro_id);
alter table public.estimate_templates enable row level security;
create policy "see own templates" on public.estimate_templates for select using (pro_id = auth.uid());
revoke all on public.estimate_templates from anon, authenticated;
grant select on public.estimate_templates to authenticated;
grant all on public.estimate_templates to service_role;

-- ---------------------------------------------------------------------------
-- Feature requests from members
-- ---------------------------------------------------------------------------
create table public.feature_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(body) between 5 and 2000),
  status      text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  staff_note  text not null default '',
  created_at  timestamptz not null default now()
);
create index feature_requests_user_idx on public.feature_requests (user_id);
alter table public.feature_requests enable row level security;
create policy "see own feature requests" on public.feature_requests for select using (user_id = auth.uid());
revoke all on public.feature_requests from anon, authenticated;
grant select on public.feature_requests to authenticated;
grant all on public.feature_requests to service_role;

-- ---------------------------------------------------------------------------
-- Review moderation: staff can hide a review. Hidden reviews do not count in ratings.
-- ---------------------------------------------------------------------------
alter table public.reviews
  add column hidden_at     timestamptz,
  add column hidden_by     uuid references public.profiles (id) on delete set null,
  add column hidden_reason text not null default '';

drop policy "reviews are public" on public.reviews;
create policy "visible reviews are public" on public.reviews for select
  using (hidden_at is null or reviewer_id = auth.uid());

create or replace function public.refresh_pro_rating(p uuid)
returns void language sql security definer set search_path = public as $$
  update public.pro_profiles set
    rating_count     = (select count(*) from public.reviews where pro_id = p and hidden_at is null),
    rating_avg       = coalesce((select round(avg(rating)::numeric, 2) from public.reviews
                                 where pro_id = p and hidden_at is null), 0),
    sub_rating_count = (select count(*) from public.sub_ratings where sub_id = p),
    sub_rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from public.sub_ratings where sub_id = p), 0)
  where user_id = p;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist for pros outside the launch state. Written and read by the server only.
-- ---------------------------------------------------------------------------
create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 120),
  email       text not null unique check (length(email) between 3 and 200),
  trade       text not null default '',
  city        text not null default '',
  state       text not null check (length(state) = 2),
  created_at  timestamptz not null default now()
);
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant all on public.waitlist to service_role;
