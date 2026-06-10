-- ============================================================================
-- LFG AUTO DELIVERIES — Supabase Setup (run this ENTIRE file once)
-- Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
-- ============================================================================

-- ---------- PROFILES (one row per user: admin or driver) --------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'driver' check (role in ('admin','driver')),
  first_name  text,
  last_name   text,
  phone       text,
  email       text,
  username    text unique,
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz not null default now()
);

-- ---------- DELIVERIES -------------------------------------------------------
create table if not exists public.deliveries (
  id                 uuid primary key default gen_random_uuid(),
  status             text not null default 'assigned'
                     check (status in ('assigned','at_dealer','en_route','delivered','issue')),
  archived           boolean not null default false,

  -- Deal & customer
  customer_name      text not null,
  customer_phone     text,
  delivery_address   text,
  delivery_date      date,
  delivery_time      text,
  driver1_name       text,             -- assigned driver (drivers share one login; name identifies them)
  driver2_name       text,             -- optional second driver on the same delivery

  -- Vehicle
  dealership_name    text,
  dealership_contact text,
  dealership_phone   text,
  vin                text,
  vyear              text,
  make               text,
  model              text,
  color              text,
  monthly_payment    text,
  miles_per_year     text,
  contract_type      text,

  -- Lease return / trade
  is_trade           boolean default false,
  trade_year         text,
  trade_make         text,
  trade_model        text,
  trade_vin          text,
  trade_notes        text,
  trade_destination  text default 'office',   -- 'office' | 'dealer'
  trade_return_dealer text,                    -- which dealer the lease return goes to
  trade_picked_up_at timestamptz,

  -- COD / payment
  cod_required       boolean default false,
  cod_amount         text,
  cod_made_out_to    text,             -- 'Dealer' or 'LFG AUTO LLC'
  cod_type           text,             -- 'Check' | 'Cash' | 'Other'
  cod_received       boolean default false,

  -- Delivered condition
  odometer           text,
  fuel_level         text,
  damage_noted       boolean default false,
  damage_notes       text,

  -- Delivery tasks
  task_bluetooth     boolean default false,
  task_lfg_box       boolean default false,
  task_app           boolean default false,
  task_review        boolean default false,
  task_photo_client  boolean default false,
  task_photo_contract boolean default false,
  prev_status        text,              -- remembers status before an issue, to restore on resolve

  -- Notes
  admin_notes        text,
  driver_notes       text,

  -- Driver sign-off (captured at Delivered)
  driver_signature      text,           -- PNG data URL
  delivered_condition_ok boolean default false,
  client_photo_url      text,
  contract_photo_url    text,
  trade_photo_url       text,

  -- Status timestamps
  assigned_at        timestamptz default now(),
  at_dealer_at       timestamptz,
  en_route_at        timestamptz,
  delivered_at       timestamptz,

  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists deliveries_status_idx    on public.deliveries(status);
create index if not exists deliveries_archived_idx  on public.deliveries(archived);

-- ---------- DRIVER ROSTER (just names for the assignment dropdowns) ----------
-- Drivers share ONE login, so they are not individual accounts — just names.
create table if not exists public.drivers_roster (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ---------- ISSUES -----------------------------------------------------------
create table if not exists public.issues (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.deliveries(id) on delete cascade,
  type        text not null,
  note        text,
  photo_url   text,
  resolved    boolean not null default false,
  solution    text,
  resolved_at timestamptz,
  resolved_by text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at  timestamptz not null default now()
);

-- ---------- ACTIVITY LOG -----------------------------------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.deliveries(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  user_name   text,
  action      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists activity_delivery_idx on public.activity_log(delivery_id);

-- ---------- HELPER: is the current user an admin? ---------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver'
  );
$$;

-- ---------- AUTO-CREATE a profile when an auth user is created --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, phone, email, username, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'driver'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'phone',
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- keep updated_at fresh -------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists deliveries_touch on public.deliveries;
create trigger deliveries_touch before update on public.deliveries
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.deliveries     enable row level security;
alter table public.issues         enable row level security;
alter table public.activity_log   enable row level security;
alter table public.drivers_roster enable row level security;

-- PROFILES: you can read your own row; admins read everyone
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- DRIVER ROSTER: admins manage; the shared driver login may read it
drop policy if exists roster_admin_all on public.drivers_roster;
create policy roster_admin_all on public.drivers_roster
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists roster_driver_read on public.drivers_roster;
create policy roster_driver_read on public.drivers_roster
  for select using (public.is_driver());

-- DELIVERIES: admins do everything; the shared driver login reads + updates all
-- (any driver can advance any delivery; the signature at the end shows who did it)
drop policy if exists deliveries_admin_all on public.deliveries;
create policy deliveries_admin_all on public.deliveries
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists deliveries_driver_read on public.deliveries;
create policy deliveries_driver_read on public.deliveries
  for select using (public.is_driver());

drop policy if exists deliveries_driver_update on public.deliveries;
create policy deliveries_driver_update on public.deliveries
  for update using (public.is_driver()) with check (public.is_driver());

-- ISSUES: admins read all; the shared driver login reads + inserts
drop policy if exists issues_admin_read on public.issues;
create policy issues_admin_read on public.issues
  for select using (public.is_admin() or public.is_driver());

drop policy if exists issues_driver_read on public.issues;
drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues
  for insert with check (public.is_admin() or public.is_driver());

drop policy if exists issues_admin_update on public.issues;
create policy issues_admin_update on public.issues
  for update using (public.is_admin()) with check (public.is_admin());

-- ACTIVITY LOG: admins read all; drivers read their own; any signed-in user inserts
drop policy if exists activity_admin_read on public.activity_log;
create policy activity_admin_read on public.activity_log
  for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log
  for insert with check (auth.uid() is not null);

-- ============================================================================
-- STORAGE: one public bucket for delivery photos & signatures
-- (You can also create the bucket in Dashboard -> Storage -> New bucket: "delivery-photos", Public)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', true)
on conflict (id) do nothing;

drop policy if exists photos_public_read on storage.objects;
create policy photos_public_read on storage.objects
  for select using (bucket_id = 'delivery-photos');

drop policy if exists photos_auth_write on storage.objects;
create policy photos_auth_write on storage.objects
  for insert with check (bucket_id = 'delivery-photos' and auth.uid() is not null);

-- ============================================================================
-- DONE. Next: create Jessica in Authentication, then run make-admin.sql
-- ============================================================================
