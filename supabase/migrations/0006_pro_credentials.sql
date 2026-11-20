-- Licenses, insurance, bonds, and certifications a pro has provided.

create table public.pro_credentials (
  id                  uuid primary key default gen_random_uuid(),
  pro_id              uuid not null references public.pro_profiles (user_id) on delete cascade,
  -- One of the ids in src/lib/credentials.ts, e.g. 'sc_res_builder' or 'general_liability'.
  type                text not null check (length(type) between 1 and 40),
  number              text not null default '',
  holder_name         text not null default '',
  classification      text not null default '',
  coverage_cents      bigint,
  expires_on          date,
  -- Path of the uploaded document in the private 'credentials' bucket.
  file_path           text not null default '',
  -- pending: uploaded, not yet checked by staff. verified: staff checked it against the
  -- issuer. rejected: staff could not confirm it. expired: past its expiry date.
  status              text not null default 'pending'
                      check (status in ('pending', 'verified', 'rejected', 'expired')),
  review_note         text not null default '',
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  reminded_at         timestamptz,   -- the "expires in a month" email went out
  expiry_notified_at  timestamptz,   -- the "this has expired" email went out
  created_at          timestamptz not null default now()
);
create index pro_credentials_pro_idx on public.pro_credentials (pro_id);
create index pro_credentials_expiry_idx on public.pro_credentials (expires_on)
  where status in ('pending', 'verified');

-- Customers can see what a pro has provided, so they can check it themselves. The
-- uploaded file and staff notes are not readable: only the columns granted below are.
alter table public.pro_credentials enable row level security;
create policy "credentials are public unless rejected" on public.pro_credentials for select
  using (status <> 'rejected' or pro_id = auth.uid());
revoke all on public.pro_credentials from anon, authenticated;
grant select (id, pro_id, type, number, holder_name, classification, coverage_cents,
              expires_on, status, reviewed_at, created_at)
  on public.pro_credentials to anon, authenticated;
grant all on public.pro_credentials to service_role;

-- Summary of a pro's required documents, kept up to date by the server:
--   none_required  their trades need no state document
--   missing        at least one required document is missing, rejected, or expired
--   provided       everything required is uploaded, some not yet checked by staff
--   verified       everything required has been checked by staff
alter table public.pro_profiles
  add column docs_status text not null default 'missing'
  check (docs_status in ('none_required', 'missing', 'provided', 'verified'));

-- Private storage for the uploaded documents. Pros upload to their own folder; only the
-- server (service role) reads them, for the pro and for staff review.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('credentials', 'credentials', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
create policy "upload credentials to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text);

-- Sign-up now also records the trades a pro ticked on the sign-up form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_trades jsonb;
begin
  v_role := case when new.raw_user_meta_data ->> 'role' = 'pro' then 'pro' else 'customer' end;
  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  if v_role = 'pro' then
    insert into public.pro_profiles (user_id, business_name)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''),
                             new.raw_user_meta_data ->> 'full_name', ''));
    insert into public.pro_billing (user_id) values (new.id);
    v_trades := case when jsonb_typeof(new.raw_user_meta_data -> 'trades') = 'array'
                     then new.raw_user_meta_data -> 'trades' else '[]'::jsonb end;
    insert into public.pro_categories (pro_id, category_id)
    select new.id, c.id from public.categories c
    where c.id::text in (select jsonb_array_elements_text(v_trades));
  end if;
  return new;
end $$;
