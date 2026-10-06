create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Only invokes the worker while work is due; keys remain inside Vault.
select cron.schedule('lfg-delivery-push','* * * * *',$job$
 select net.http_post(
  url := 'https://cmvrgsqevrondpckhydw.supabase.co/functions/v1/driver-push',
  headers := jsonb_build_object('Content-Type','application/json','x-lfg-worker',(select decrypted_secret from vault.decrypted_secrets where name='lfg_push_worker')),
  body := '{"action":"drain"}'::jsonb, timeout_milliseconds := 60000
 ) where exists(select 1 from public.delivery_push_jobs where status in ('queued','sending') and available_at<=now() and acknowledged_at is null);
$job$);
