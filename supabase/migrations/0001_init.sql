-- Trade Platform: initial schema
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
--
-- Access model
--   * Row-level security is on for every table.
--   * The browser/server "user" client can only do what the policies and grants below allow.
--   * Anything involving money or status changes (quotes, milestones, sub invites, payments,
--     transfers, reviews) is written by server code with the service-role key after it has
--     checked the signed-in user. Those tables are read-only to users.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'pro');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'customer',
  full_name   text not null default '',
  city        text,
  state       text,
  -- Platform staff who can resolve disputes. Set by hand in SQL; users cannot change it.
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.pro_profiles (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  business_name        text not null default '',
  headline             text not null default '',
  bio                  text not null default '',
  city                 text not null default '',
  state                text not null default '',
  zip                  text not null default '',
  service_radius_miles integer,
  years_experience     integer,
  hourly_rate_min      integer,            -- whole dollars
  hourly_rate_max      integer,
  job_min              integer,            -- typical job size, whole dollars
  job_max              integer,
  pricing_notes        text not null default '',
  typical_timeline     text not null default '',
  license_number       text not null default '',
  insured              boolean not null default false,
  -- Maintained by the server only (see column grants below)
  is_listed            boolean not null default false,  -- subscription is trialing or active
  payouts_ready        boolean not null default false,  -- Stripe Connect onboarding finished
  rating_avg           numeric(3, 2) not null default 0,
  rating_count         integer not null default 0,
  sub_rating_avg       numeric(3, 2) not null default 0,
  sub_rating_count     integer not null default 0,
  created_at           timestamptz not null default now()
);

-- Private billing details. Only the owner can read; only the server writes.
create table public.pro_billing (
  user_id                uuid primary key references public.pro_profiles (user_id) on delete cascade,
  stripe_account_id      text unique,
  payouts_enabled        boolean not null default false,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  subscription_status    text not null default 'none',
  trial_ends_at          timestamptz,
  updated_at             timestamptz not null default now()
);

create table public.categories (
  id    serial primary key,
  slug  text not null unique,
  name  text not null,
  sort  integer not null default 0
);

create table public.pro_categories (
  pro_id       uuid not null references public.pro_profiles (user_id) on delete cascade,
  category_id  integer not null references public.categories (id) on delete cascade,
  primary key (pro_id, category_id)
);

create table public.portfolio_photos (
  id            uuid primary key default gen_random_uuid(),
  pro_id        uuid not null references public.pro_profiles (user_id) on delete cascade,
  storage_path  text not null,
  caption       text not null default '',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects, quotes, milestones
-- ---------------------------------------------------------------------------
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  description   text not null default '',
  category_id   integer references public.categories (id) on delete set null,
  city          text not null default '',
  state         text not null default '',
  budget_cents  bigint,
  target_start  date,
  target_end    date,
  status        text not null default 'open'
                check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  created_at    timestamptz not null default now()
);

create table public.project_photos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

create table public.quote_requests (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  pro_id      uuid not null references public.pro_profiles (user_id) on delete cascade,
  message     text not null default '',
  status      text not null default 'pending'
              check (status in ('pending', 'quoted', 'declined', 'accepted', 'closed')),
  created_at  timestamptz not null default now(),
  unique (project_id, pro_id)
);

create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.quote_requests (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  pro_id        uuid not null references public.pro_profiles (user_id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  timeline      text not null default '',
  scope         text not null default '',
  status        text not null default 'submitted'
                check (status in ('submitted', 'accepted', 'rejected', 'withdrawn')),
  created_at    timestamptz not null default now()
);

create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references public.quotes (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null,
  amount_cents  bigint not null check (amount_cents > 0),
  sort          integer not null default 0,
  -- pending -> funded (customer paid) -> submitted (pro says done) -> released (customer approved)
  -- A funded or submitted milestone can be disputed; a dispute ends in released or refunded.
  status        text not null default 'pending'
                check (status in ('pending', 'funded', 'submitted', 'released', 'disputed', 'refunded')),
  status_before_dispute text,
  refunded_cents bigint not null default 0,
  funded_at     timestamptz,
  released_at   timestamptz
);

create table public.budget_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  label          text not null,
  planned_cents  bigint not null default 0,
  quote_id       uuid unique references public.quotes (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Subs
-- ---------------------------------------------------------------------------
create table public.favorite_subs (
  pro_id      uuid not null references public.pro_profiles (user_id) on delete cascade,
  sub_id      uuid not null references public.pro_profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (pro_id, sub_id),
  check (pro_id <> sub_id)
);

create table public.project_subs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  quote_id      uuid not null references public.quotes (id) on delete cascade,
  lead_pro_id   uuid not null references public.pro_profiles (user_id) on delete cascade,
  sub_id        uuid not null references public.pro_profiles (user_id) on delete cascade,
  scope         text not null default '',
  amount_cents  bigint not null check (amount_cents > 0),
  status        text not null default 'invited'
                check (status in ('invited', 'accepted', 'declined', 'removed')),
  created_at    timestamptz not null default now(),
  unique (quote_id, sub_id),
  check (lead_pro_id <> sub_id)
);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_a           uuid not null references public.profiles (id) on delete cascade,
  user_b           uuid not null references public.profiles (id) on delete cascade,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)   -- one thread per pair, stored in a fixed order
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  body             text not null check (length(body) between 1 and 5000),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------
create table public.payments (
  id                          uuid primary key default gen_random_uuid(),
  milestone_id                uuid not null references public.milestones (id) on delete restrict,
  project_id                  uuid not null references public.projects (id) on delete restrict,
  customer_id                 uuid not null references public.profiles (id) on delete restrict,
  pro_id                      uuid not null references public.pro_profiles (user_id) on delete restrict,
  amount_cents                bigint not null,
  platform_fee_cents          bigint not null default 0,   -- our cut
  processing_fee_cents        bigint not null default 0,   -- what Stripe charged to process the payment
  refunded_cents              bigint not null default 0,
  stripe_refund_id            text,
  status                      text not null default 'pending'
                              check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_charge_id            text,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now()
);

create table public.transfers (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references public.payments (id) on delete restrict,
  milestone_id        uuid not null references public.milestones (id) on delete restrict,
  recipient_id        uuid not null references public.pro_profiles (user_id) on delete restrict,
  role                text not null check (role in ('lead', 'sub')),
  amount_cents        bigint not null,
  -- pending -> paid, or awaiting_payout_setup (recipient has no Stripe account yet), or failed
  status              text not null default 'pending'
                      check (status in ('pending', 'paid', 'awaiting_payout_setup', 'failed')),
  stripe_transfer_id  text,
  error               text,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
-- A customer disputes a paid milestone. The money stays held until the two sides agree
-- or a platform admin decides how much is refunded and how much is released.
create table public.disputes (
  id                     uuid primary key default gen_random_uuid(),
  milestone_id           uuid not null references public.milestones (id) on delete cascade,
  project_id             uuid not null references public.projects (id) on delete cascade,
  customer_id            uuid not null references public.profiles (id) on delete cascade,
  pro_id                 uuid not null references public.pro_profiles (user_id) on delete cascade,
  reason                 text not null,
  pro_response           text not null default '',
  proposed_refund_cents  bigint,          -- the pro's offer, if any
  status                 text not null default 'open'
                         check (status in ('open', 'escalated', 'resolved', 'withdrawn')),
  refund_cents           bigint,          -- what was actually refunded on resolution
  resolution_note        text not null default '',
  resolved_by            uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz
);
create unique index disputes_one_open_per_milestone
  on public.disputes (milestone_id) where status in ('open', 'escalated');
create index disputes_project_idx on public.disputes (project_id);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Customer -> pro (lead or sub) on a project with a released milestone.
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id) on delete cascade,
  pro_id       uuid not null references public.pro_profiles (user_id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  body         text not null default '',
  created_at   timestamptz not null default now(),
  unique (project_id, reviewer_id, pro_id)
);

-- Lead contractor -> sub. Only ever created for a sub who accepted a role on the project.
create table public.sub_ratings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  lead_pro_id  uuid not null references public.pro_profiles (user_id) on delete cascade,
  sub_id       uuid not null references public.pro_profiles (user_id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  body         text not null default '',
  created_at   timestamptz not null default now(),
  unique (project_id, lead_pro_id, sub_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index projects_customer_idx        on public.projects (customer_id);
create index quote_requests_pro_idx       on public.quote_requests (pro_id);
create index quotes_project_idx           on public.quotes (project_id);
create index quotes_pro_idx               on public.quotes (pro_id);
create index milestones_quote_idx         on public.milestones (quote_id);
create index milestones_project_idx       on public.milestones (project_id);
create index project_subs_sub_idx         on public.project_subs (sub_id);
create index project_subs_project_idx     on public.project_subs (project_id);
create index payments_milestone_idx       on public.payments (milestone_id);
create index transfers_recipient_idx      on public.transfers (recipient_id);
create index reviews_pro_idx              on public.reviews (pro_id);
create index sub_ratings_sub_idx          on public.sub_ratings (sub_id);
create index pro_profiles_listed_idx      on public.pro_profiles (is_listed);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- Create profile rows when someone signs up. Role and names come from sign-up metadata.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
begin
  v_role := case when new.raw_user_meta_data ->> 'role' = 'pro' then 'pro' else 'customer' end;
  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  if v_role = 'pro' then
    insert into public.pro_profiles (user_id, business_name)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''),
                             new.raw_user_meta_data ->> 'full_name', ''));
    insert into public.pro_billing (user_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep rating averages on the pro profile.
create function public.refresh_pro_rating(p uuid)
returns void language sql security definer set search_path = public as $$
  update public.pro_profiles set
    rating_count     = (select count(*) from public.reviews where pro_id = p),
    rating_avg       = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where pro_id = p), 0),
    sub_rating_count = (select count(*) from public.sub_ratings where sub_id = p),
    sub_rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from public.sub_ratings where sub_id = p), 0)
  where user_id = p;
$$;

create function public.on_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform public.refresh_pro_rating(old.pro_id); end if;
  if tg_op <> 'DELETE' then perform public.refresh_pro_rating(new.pro_id); end if;
  return null;
end $$;

create function public.on_sub_rating_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform public.refresh_pro_rating(old.sub_id); end if;
  if tg_op <> 'DELETE' then perform public.refresh_pro_rating(new.sub_id); end if;
  return null;
end $$;

create trigger reviews_refresh after insert or update or delete on public.reviews
  for each row execute function public.on_review_change();
create trigger sub_ratings_refresh after insert or update or delete on public.sub_ratings
  for each row execute function public.on_sub_rating_change();

-- Bump the conversation when a message arrives.
create function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end $$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- Helper functions for policies (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------
create function public.is_project_customer(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = pid and customer_id = auth.uid());
$$;

create function public.is_project_participant(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quote_requests where project_id = pid and pro_id = auth.uid())
      or exists (select 1 from public.project_subs
                 where project_id = pid and sub_id = auth.uid() and status in ('invited', 'accepted'));
$$;

create function public.is_quote_party(qid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotes where id = qid and pro_id = auth.uid())
      or exists (select 1 from public.project_subs
                 where quote_id = qid and sub_id = auth.uid() and status in ('invited', 'accepted'));
$$;

create function public.is_conversation_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversations
                 where id = cid and auth.uid() in (user_a, user_b));
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.pro_profiles     enable row level security;
alter table public.pro_billing      enable row level security;
alter table public.categories       enable row level security;
alter table public.pro_categories   enable row level security;
alter table public.portfolio_photos enable row level security;
alter table public.projects         enable row level security;
alter table public.project_photos   enable row level security;
alter table public.quote_requests   enable row level security;
alter table public.quotes           enable row level security;
alter table public.milestones       enable row level security;
alter table public.budget_items     enable row level security;
alter table public.favorite_subs    enable row level security;
alter table public.project_subs     enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.payments         enable row level security;
alter table public.transfers        enable row level security;
alter table public.disputes         enable row level security;
alter table public.reviews          enable row level security;
alter table public.sub_ratings      enable row level security;

-- Public directory data
create policy "profiles are public"        on public.profiles         for select using (true);
create policy "update own profile"         on public.profiles         for update using (id = auth.uid()) with check (id = auth.uid());
create policy "pro profiles are public"    on public.pro_profiles     for select using (true);
create policy "update own pro profile"     on public.pro_profiles     for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read own billing"           on public.pro_billing      for select using (user_id = auth.uid());
create policy "categories are public"      on public.categories       for select using (true);
create policy "pro categories are public"  on public.pro_categories   for select using (true);
create policy "add own categories"         on public.pro_categories   for insert with check (pro_id = auth.uid());
create policy "remove own categories"      on public.pro_categories   for delete using (pro_id = auth.uid());
create policy "portfolio is public"        on public.portfolio_photos for select using (true);
create policy "add own portfolio photo"    on public.portfolio_photos for insert with check (pro_id = auth.uid());
create policy "remove own portfolio photo" on public.portfolio_photos for delete using (pro_id = auth.uid());
create policy "reviews are public"         on public.reviews          for select using (true);
create policy "sub ratings are public"     on public.sub_ratings      for select using (true);

-- Projects
create policy "see own or joined projects" on public.projects for select
  using (customer_id = auth.uid() or public.is_project_participant(id));
create policy "create own project" on public.projects for insert with check (customer_id = auth.uid());
create policy "update own project" on public.projects for update
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy "see project photos" on public.project_photos for select
  using (public.is_project_customer(project_id) or public.is_project_participant(project_id));
create policy "add project photos" on public.project_photos for insert
  with check (public.is_project_customer(project_id));
create policy "remove project photos" on public.project_photos for delete
  using (public.is_project_customer(project_id));

create policy "see quote requests" on public.quote_requests for select
  using (pro_id = auth.uid() or public.is_project_customer(project_id));
create policy "customer requests quotes" on public.quote_requests for insert
  with check (public.is_project_customer(project_id));

create policy "see quotes" on public.quotes for select
  using (pro_id = auth.uid() or public.is_project_customer(project_id));

create policy "see milestones" on public.milestones for select
  using (public.is_project_customer(project_id) or public.is_quote_party(quote_id));

create policy "customer manages budget" on public.budget_items for all
  using (public.is_project_customer(project_id)) with check (public.is_project_customer(project_id));

-- Subs
create policy "manage own favorites" on public.favorite_subs for all
  using (pro_id = auth.uid()) with check (pro_id = auth.uid());
create policy "see project subs" on public.project_subs for select
  using (lead_pro_id = auth.uid() or sub_id = auth.uid() or public.is_project_customer(project_id));

-- Messaging
create policy "see own conversations" on public.conversations for select
  using (auth.uid() in (user_a, user_b));
create policy "read conversation messages" on public.messages for select
  using (public.is_conversation_member(conversation_id));
create policy "send messages" on public.messages for insert
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- Money (read-only to the people involved)
create policy "see own payments" on public.payments for select
  using (customer_id = auth.uid() or pro_id = auth.uid());
create policy "see own transfers" on public.transfers for select
  using (recipient_id = auth.uid());
create policy "see own disputes" on public.disputes for select
  using (customer_id = auth.uid() or pro_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants. Explicit, so users can only write the columns and tables listed here.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant update (full_name, city, state) on public.profiles to authenticated;
grant update (business_name, headline, bio, city, state, zip, service_radius_miles,
              years_experience, hourly_rate_min, hourly_rate_max, job_min, job_max,
              pricing_notes, typical_timeline, license_number, insured)
  on public.pro_profiles to authenticated;
grant insert, delete on public.pro_categories   to authenticated;
grant insert, delete on public.portfolio_photos to authenticated;
grant insert, update on public.projects         to authenticated;
grant insert, delete on public.project_photos   to authenticated;
grant insert         on public.quote_requests   to authenticated;
grant insert, update, delete on public.budget_items  to authenticated;
grant insert, delete on public.favorite_subs    to authenticated;
grant insert         on public.messages         to authenticated;

revoke execute on function public.refresh_pro_rating(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one public bucket for profile and project photos.
-- Files live under a folder named after the uploader's user id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos are public" on storage.objects for select
  using (bucket_id = 'photos');
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete from own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime for live messaging
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- Seed: trade categories
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, sort) values
  ('general-contractor', 'General contracting', 10),
  ('handyman',           'Handyman',            20),
  ('carpentry',          'Carpentry',           30),
  ('cabinetry',          'Cabinetry & built-ins', 40),
  ('plumbing',           'Plumbing',            50),
  ('electrical',         'Electrical',          60),
  ('hvac',               'Heating & cooling',   70),
  ('painting',           'Painting',            80),
  ('drywall',            'Drywall',             90),
  ('flooring',           'Flooring',           100),
  ('tile',               'Tile & stone',       110),
  ('roofing',            'Roofing',            120),
  ('kitchen-remodel',    'Kitchen remodeling', 130),
  ('bathroom-remodel',   'Bathroom remodeling',140),
  ('masonry',            'Masonry & concrete', 150),
  ('landscaping',        'Landscaping',        160),
  ('decks-fences',       'Decks & fences',     170),
  ('windows-doors',      'Windows & doors',    180),
  ('demolition',         'Demolition & hauling', 190),
  ('design',             'Design & architecture', 200);
