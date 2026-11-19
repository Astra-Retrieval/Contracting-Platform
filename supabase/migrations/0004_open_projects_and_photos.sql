-- Open projects feed, and photos in messages and disputes.

-- A customer can let any pro on the platform find the project and offer a quote.
alter table public.projects add column open_to_pros boolean not null default true;
create index projects_open_feed_idx on public.projects (created_at desc)
  where status = 'open' and open_to_pros;

-- Who started the quote request: the customer invited the pro, or the pro found the
-- project in the open feed and offered to quote.
alter table public.quote_requests
  add column source text not null default 'customer' check (source in ('customer', 'pro'));

create function public.is_pro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pro_profiles where user_id = auth.uid());
$$;

create policy "pros see open projects" on public.projects for select
  using (status = 'open' and open_to_pros and public.is_pro());
create policy "pros see open project photos" on public.project_photos for select
  using (
    public.is_pro()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.status = 'open' and p.open_to_pros
    )
  );

-- Photos attached to a message. A message needs words or at least one photo.
alter table public.messages add column photo_paths text[] not null default '{}';
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    length(body) <= 5000
    and cardinality(photo_paths) <= 6
    and (length(body) >= 1 or cardinality(photo_paths) >= 1)
  );

-- Photos on a dispute: the customer's evidence and the pro's reply.
alter table public.disputes
  add column photo_paths text[] not null default '{}',
  add column pro_photo_paths text[] not null default '{}';
