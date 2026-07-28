-- Agronomist reviews table.
-- Created when a scan's confidence is below threshold.
-- agronomist_id references auth.users (the reviewer's account).
-- district column mirrors the submitting user's district so routing queries stay cheap.

create type public.review_status as enum (
  'pending',
  'in_progress',
  'approved',
  'rejected'
);

create table if not exists public.agronomist_reviews (
  id              uuid primary key default gen_random_uuid(),
  scan_id         uuid not null references public.scans (id) on delete cascade,
  agronomist_id   uuid references auth.users (id) on delete set null,
  district        text not null,
  status          public.review_status not null default 'pending',
  notes           text,
  created_at      timestamptz not null default now()
);

comment on table public.agronomist_reviews is
  'Human-verification queue. Agronomists see only reviews for their district. '
  'district is denormalised from the scan owner at insert time for fast filtering.';
comment on column public.agronomist_reviews.district is
  'Copied from users.district at insert time. Lets RLS filter without a join.';

create index reviews_scan_id_idx      on public.agronomist_reviews (scan_id);
create index reviews_district_idx     on public.agronomist_reviews (district);
create index reviews_agronomist_idx   on public.agronomist_reviews (agronomist_id);

-- RLS
alter table public.agronomist_reviews enable row level security;

-- Scan owners can see reviews attached to their own scans.
create policy "reviews: scan owner can select"
  on public.agronomist_reviews for select
  using (
    exists (
      select 1 from public.scans s
      where s.id = scan_id
        and s.user_id = auth.uid()
    )
  );

-- Agronomists can see all pending/in-progress reviews in their district.
-- Their district is stored in public.users.district.
create policy "reviews: agronomist can select own district"
  on public.agronomist_reviews for select
  using (
    district = (
      select u.district from public.users u where u.id = auth.uid()
    )
  );

-- Agronomists can only update reviews in their district.
create policy "reviews: agronomist can update own district"
  on public.agronomist_reviews for update
  using (
    district = (
      select u.district from public.users u where u.id = auth.uid()
    )
  )
  with check (
    district = (
      select u.district from public.users u where u.id = auth.uid()
    )
  );
