begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','driver','observer'));
-- No raw table permissions are added. This API exposes an explicit operational field list.
create or replace function public.observer_deliveries() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='observer' and status='active' and lower(email)='lfgcars+delivery@mail.grokbot.com') then raise exception 'Read-only observer account required' using errcode='42501';end if;
 select coalesce(jsonb_agg(item order by sort_date desc nulls last),'[]'::jsonb) into result from (
 select d.delivery_date as sort_date,(select jsonb_object_agg(k,to_jsonb(d)->k) from unnest(array[
 'id','customer_name','year','make','model','color','dealership_name','delivery_date','delivery_time','dealer_by_time','cust_window_start','cust_window_end','cust_window_text','status','is_ready','archived','driver1_name','driver2_name','at_dealer_at','en_route_at','delivered_at','closeout_required','closeout_completed_at','paperwork_status','paperwork_at','paperwork_by','trade_returned_at','trade_returned_by','trade_destination','trade_return_dealer','is_trade','cod_required','cod_received','client_photo_url','client_photo_refused','e_contract','task_photo_contract','task_photo_client','task_bluetooth','task_lfg_box','task_app','task_review','delivered_condition_ok','created_at','updated_at'
 ]) k) || jsonb_build_object('issues',coalesce((select jsonb_agg(jsonb_build_object('type',i.type,'resolved',to_jsonb(i)->'resolved','created_at',i.created_at)) from public.issues i where i.delivery_id=d.id),'[]'::jsonb)) as item from public.deliveries d
 ) permitted;
 return result;
end $$;
revoke all on function public.observer_deliveries() from public,anon;
grant execute on function public.observer_deliveries() to authenticated;
commit;
