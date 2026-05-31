-- ============================================================
-- SECLens — Supabase database schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Users table (plan + usage tracking)
-- --------------------------------------------------------
create table if not exists public.users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text,
  is_paid              boolean      default false,
  analyses_used        integer      default 0,
  analyses_reset_at    date         default current_date,
  stripe_customer_id   text,
  created_at           timestamptz  default now()
);

alter table public.users enable row level security;

-- Users can read their own record
create policy "Users read own record" on public.users
  for select using (auth.uid() = id);

-- Service role (backend) can do everything
-- (the backend uses SUPABASE_SERVICE_KEY which bypasses RLS automatically)

-- Auto-create a user row on first sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, analyses_reset_at)
  values (new.id, new.email, date_trunc('month', current_date)::date)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. Watchlist table
-- --------------------------------------------------------
create table if not exists public.watchlist (
  id           uuid         primary key default gen_random_uuid(),
  user_id      uuid         references auth.users not null,
  ticker       text         not null,
  company_name text,
  notes        text,
  added_at     timestamptz  default now(),
  unique(user_id, ticker)
);

alter table public.watchlist enable row level security;

create policy "Users manage own watchlist" on public.watchlist
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
