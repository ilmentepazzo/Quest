-- Update 95C - Preview recensioni Lorecast
-- ESEGUI PRIMA QUESTO FILE. Non modifica dati o schema.
-- Serve a controllare quante recensioni, acquisti, prenotazioni e sessioni esistono prima della patch policy.

select 'reviews_total' as check_name, count(*) as total from public.reviews
union all
select 'reviews_with_booking_id', count(*) from public.reviews where booking_id is not null
union all
select 'paid_story_purchases', count(*) from public.story_purchases where lower(coalesce(payment_status, '')) = 'paid'
union all
select 'completed_bookings', count(*) from public.bookings where lower(coalesce(status, '')) in ('completata', 'completa', 'completed', 'complete')
union all
select 'joined_public_sessions', count(*) from public.session_participants where lower(coalesce(status, '')) = 'joined';

-- Controllo duplicati potenziali: la nuova regola permette massimo 1 recensione per utente/storia.
select
  user_id,
  story_id,
  count(*) as review_count
from public.reviews
group by user_id, story_id
having count(*) > 1
order by review_count desc;
