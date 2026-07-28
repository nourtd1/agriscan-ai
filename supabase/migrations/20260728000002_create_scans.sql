-- Scans table.
-- One row per photo submitted by a farmer.
-- status lifecycle: pending → diagnosed → needs_review → verified | rejected

create type public.scan_status as enum (
  'pending',
  'diagnosed',
  'needs_review',
  'verified',
  'rejected'
);

create table if not exists public.scans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  image_url   text not null,
  crop_type   text,
  diagnosis   text,
  confidence  numeric(5, 4) check (confidence between 0 and 1),
  status      public.scan_status not null default 'pending',
  created_at  timestamptz not null default now()
);

comment on table public.scans is
  'Core entity. Stores each camera capture, the Gemini diagnosis result, and the review lifecycle status.';
comment on column public.scans.confidence is
  'Gemini-reported confidence in [0,1]. Values below the threshold trigger needs_review status.';

create index scans_user_id_idx on public.scans (user_id);
create index scans_status_idx  on public.scans (status);

-- RLS
alter table public.scans enable row level security;

create policy "scans: select own"
  on public.scans for select
  using (auth.uid() = user_id);

create policy "scans: insert own"
  on public.scans for insert
  with check (auth.uid() = user_id);

create policy "scans: update own"
  on public.scans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "scans: delete own"
  on public.scans for delete
  using (auth.uid() = user_id);
