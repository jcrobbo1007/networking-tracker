-- ============================================================================
-- 0001_contacts.sql
-- Networking tracker: contacts table, constraints, and Row Level Security.
--
-- Run against the Neon branch with:  npm run db:migrate
-- or paste into the Neon SQL Editor.
--
-- This migration is idempotent: it can be run repeatedly without error.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto on older servers; built in on PG13+.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
-- user_id is the ownership column. It is `text` (Better Auth user ids are
-- text, not uuid), NOT NULL, and DEFAULTS to auth.user_id() -- the `sub`
-- claim of the JWT that Managed Better Auth issued for the caller.
--
-- Because the default is server-side, a client never sends user_id. Even if a
-- malicious client *does* send one, the INSERT policy's WITH CHECK rejects any
-- value that is not the caller's own id.
create table if not exists public.contacts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null default auth.user_id(),
  name        text        not null,
  company     text,
  role        text,
  where_met   text,
  notes       text,
  priority    text        not null default 'medium',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Database-level validation. This is the last line of defence: it holds even
  -- if a request bypasses the API route handlers and hits the Data API directly.
  constraint contacts_name_not_blank
    check (length(btrim(name)) > 0),
  constraint contacts_name_max_len
    check (length(name) <= 200),
  constraint contacts_priority_valid
    check (priority in ('high', 'medium', 'low'))
);

-- Every query is "my contacts, ordered by something", so lead the index with
-- the ownership column.
create index if not exists contacts_user_id_created_at_idx
  on public.contacts (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.contacts enable row level security;

-- Defence in depth: force RLS so that even the table owner is subject to the
-- policies below. Without this, a superuser/owner connection bypasses RLS.
alter table public.contacts force row level security;

-- Table privileges are separate from RLS. PostgREST connects as `authenticated`
-- for a signed-in caller and `anonymous` otherwise; grant the former CRUD and
-- give the latter nothing at all.
grant select, insert, update, delete on public.contacts to authenticated;
revoke all on public.contacts from anonymous;

-- Four separate policies, one per command, as required.
-- auth.user_id() is wrapped in a scalar subquery so Postgres evaluates it once
-- per statement rather than once per row.

drop policy if exists contacts_select_own on public.contacts;
create policy contacts_select_own
  on public.contacts
  for select
  to authenticated
  using ((select auth.user_id()) = user_id);

drop policy if exists contacts_insert_own on public.contacts;
create policy contacts_insert_own
  on public.contacts
  for insert
  to authenticated
  with check ((select auth.user_id()) = user_id);

-- USING decides which rows this user may target for update.
-- WITH CHECK decides what the row is allowed to look like afterwards, which is
-- what stops a user from rewriting user_id to hand their row to someone else
-- (or to steal someone else's).
drop policy if exists contacts_update_own on public.contacts;
create policy contacts_update_own
  on public.contacts
  for update
  to authenticated
  using ((select auth.user_id()) = user_id)
  with check ((select auth.user_id()) = user_id);

drop policy if exists contacts_delete_own on public.contacts;
create policy contacts_delete_own
  on public.contacts
  for delete
  to authenticated
  using ((select auth.user_id()) = user_id);
