-- Update 88 - Prelaunch security constraints and idempotency checks
-- ESEGUIRE PRIMA IN STAGING. Non eseguire alla cieca in produzione.
-- Questo file non modifica dati esistenti: prima mostra eventuali duplicati, poi aggiunge vincoli/indici.

-- 1) Controllo duplicati sugli acquisti storia.
-- Se questa query restituisce righe, NON applicare ancora il vincolo unique_user_story:
-- bisogna prima deduplicare manualmente scegliendo il record corretto da mantenere.
select
  user_id,
  story_id,
  count(*) as duplicates,
  array_agg(id order by created_at desc nulls last) as purchase_ids
from public.story_purchases
group by user_id, story_id
having count(*) > 1;

-- 2) Controllo duplicati sugli eventi pagamento Stripe.
-- Se questa query restituisce righe, NON applicare ancora il vincolo unique_provider_event:
-- bisogna prima deduplicare manualmente gli eventi già presenti.
select
  provider,
  provider_event_id,
  count(*) as duplicates,
  array_agg(id order by created_at desc nulls last) as event_ids
from public.payment_events
where provider_event_id is not null and provider_event_id <> ''
group by provider, provider_event_id
having count(*) > 1;

-- 3) Vincolo anti doppio acquisto per stessa coppia utente+storia.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'story_purchases_user_story_unique'
      and conrelid = 'public.story_purchases'::regclass
  ) then
    alter table public.story_purchases
      add constraint story_purchases_user_story_unique unique (user_id, story_id);
  end if;
end $$;

-- 4) Vincolo anti doppia elaborazione webhook/eventi provider.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_events_provider_event_unique'
      and conrelid = 'public.payment_events'::regclass
  ) then
    alter table public.payment_events
      add constraint payment_events_provider_event_unique unique (provider, provider_event_id);
  end if;
end $$;

-- 5) Indice per cercare velocemente sessioni checkout già pending.
create index if not exists story_purchases_payment_reference_idx
  on public.story_purchases (payment_reference);

-- 6) Indice utile per storico eventi pagamento per Master/checkout.
create index if not exists payment_events_checkout_master_idx
  on public.payment_events (checkout_session_id, master_id, created_at desc);
