-- Persistent, per-driver delivery alerts. No historical deliveries are queued.
create schema if not exists delivery_private;
revoke all on schema delivery_private from public, anon, authenticated;
grant usage on schema delivery_private to service_role;
create table public.delivery_push_devices (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null, driver_name text not null, subscription jsonb not null,
 active boolean not null default true, updated_at timestamptz not null default now(), last_test_at timestamptz
);
create unique index delivery_push_endpoint on public.delivery_push_devices ((subscription->>'endpoint'));
create index delivery_push_driver on public.delivery_push_devices(driver_name) where active;
create table public.delivery_push_jobs (
 id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.deliveries(id) on delete cascade,
 revision integer not null, driver_name text not null,
 status text not null default 'queued' check(status in ('queued','sending','accepted','no_device','failed','cancelled')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 created_at timestamptz not null default now(), accepted_at timestamptz, acknowledged_at timestamptz,
 acknowledged_device uuid, last_error text,
 unique(delivery_id,revision,driver_name)
);
create index delivery_push_due on public.delivery_push_jobs(available_at) where status in ('queued','sending');
alter table public.delivery_push_devices enable row level security;
alter table public.delivery_push_jobs enable row level security;
revoke all on public.delivery_push_devices, public.delivery_push_jobs from public, anon, authenticated;
grant all on public.delivery_push_devices, public.delivery_push_jobs to service_role;
alter table public.deliveries add column if not exists push_revision integer not null default 0;

create function delivery_private.queue_delivery_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed boolean; driver text;
begin
 if TG_OP = 'INSERT' then changed := coalesce(new.is_ready,false);
 else changed := new.is_ready and (not coalesce(old.is_ready,false) or new.driver1_name is distinct from old.driver1_name or new.driver2_name is distinct from old.driver2_name);
 end if;
 if changed then
   if auth.uid() is not null and not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then
     raise exception 'Only dispatch can publish or reassign live deliveries';
   end if;
   if nullif(trim(new.driver1_name),'') is null and nullif(trim(new.driver2_name),'') is null then raise exception 'Assign a driver first'; end if;
   if TG_OP='INSERT' then new.push_revision:=1; else new.push_revision:=old.push_revision+1; end if;
 else
   if TG_OP='UPDATE' then new.push_revision:=old.push_revision; else new.push_revision:=0; end if;
 end if;
 return new;
end $$;
revoke all on function delivery_private.queue_delivery_push() from public, anon, authenticated;
create trigger delivery_push_revision before insert or update on public.deliveries for each row execute function delivery_private.queue_delivery_push();

create function delivery_private.enqueue_delivery_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed boolean; driver text;
begin
 if TG_OP='INSERT' then changed:=new.push_revision>0; else changed:=new.push_revision>old.push_revision; end if;
 if changed then
   update public.delivery_push_jobs set status='cancelled' where delivery_id=new.id and acknowledged_at is null and status<>'cancelled';
   for driver in select distinct n from unnest(array[new.driver1_name,new.driver2_name]) n where nullif(trim(n),'') is not null loop
     insert into public.delivery_push_jobs(delivery_id,revision,driver_name) values(new.id,new.push_revision,driver) on conflict do nothing;
   end loop;
 end if;
 return new;
end $$;
revoke all on function delivery_private.enqueue_delivery_push() from public, anon, authenticated;
create trigger delivery_push_enqueue after insert or update on public.deliveries for each row execute function delivery_private.enqueue_delivery_push();

-- RPCs are server-only; browsers cannot read subscriptions or private keys.
create function public.claim_delivery_push() returns setof public.delivery_push_jobs
language sql security invoker set search_path = '' as $$
 update public.delivery_push_jobs set status='sending',attempts=attempts+1,available_at=now()+interval '2 minutes'
 where id in (select id from public.delivery_push_jobs where status in ('queued','sending') and available_at<=now() and attempts<3 and acknowledged_at is null order by created_at for update skip locked limit 20)
 returning *;
$$;
revoke all on function public.claim_delivery_push() from public,anon,authenticated;
grant execute on function public.claim_delivery_push() to service_role;

create function delivery_private.push_configuration() returns jsonb
language sql security definer set search_path = '' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets where name in ('lfg_push_public','lfg_push_private','lfg_push_worker');
$$;
revoke all on function delivery_private.push_configuration() from public,anon,authenticated;
grant execute on function delivery_private.push_configuration() to service_role;
create function public.delivery_push_configuration() returns jsonb language sql security invoker set search_path = '' as $$ select delivery_private.push_configuration(); $$;
revoke all on function public.delivery_push_configuration() from public,anon,authenticated;
grant execute on function public.delivery_push_configuration() to service_role;
