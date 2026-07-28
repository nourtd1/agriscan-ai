-- Users profile table.
-- Extends Supabase Auth (auth.users) with app-specific fields.
-- id matches auth.users.id — no separate sequence needed.

create table if not exists public.users (
  id               uuid primary key references auth.users (id) on delete cascade,
  district         text,
  preferred_language text not null default 'en',
  created_at       timestamptz not null default now()
);

comment on table public.users is
  'App-level user profile. district drives agronomist routing. preferred_language drives i18n + TTS.';

-- RLS
alter table public.users enable row level security;

create policy "users: select own row"
  on public.users for select
  using (auth.uid() = id);

create policy "users: insert own row"
  on public.users for insert
  with check (auth.uid() = id);

create policy "users: update own row"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
