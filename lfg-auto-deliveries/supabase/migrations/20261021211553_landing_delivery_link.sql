-- Additive link only. Existing deliveries, auth, RLS and workflow triggers remain intact.
alter table public.deliveries add column if not exists landing_lead_id uuid;
create unique index if not exists deliveries_landing_lead_unique on public.deliveries(landing_lead_id) where landing_lead_id is not null;
comment on column public.deliveries.landing_lead_id is 'Linked customer in the LFG landing project; one delivery per landing lead. No cross-project foreign key.';
