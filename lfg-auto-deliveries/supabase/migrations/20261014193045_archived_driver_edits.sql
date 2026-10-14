create or replace function delivery_private.queue_delivery_push() returns trigger
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
   -- Correcting a completed record must not announce a new delivery.
   if coalesce(new.archived,false) or new.delivered_at is not null or new.status='delivered' then
     if TG_OP='UPDATE' then new.push_revision:=old.push_revision; else new.push_revision:=0; end if;
     return new;
   end if;
   if nullif(trim(new.driver1_name),'') is null and nullif(trim(new.driver2_name),'') is null then raise exception 'Assign a driver first'; end if;
   if TG_OP='INSERT' then new.push_revision:=1; else new.push_revision:=old.push_revision+1; end if;
 else
   if TG_OP='UPDATE' then new.push_revision:=old.push_revision; else new.push_revision:=0; end if;
 end if;
 return new;
end $$;
revoke all on function delivery_private.queue_delivery_push() from public, anon, authenticated;
