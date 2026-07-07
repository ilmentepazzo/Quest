-- Update 95C - Policy recensioni classiche Lorecast
-- NON è distruttivo: non cancella dati.
-- Cosa fa:
-- 1) consente recensioni anche senza booking_id per storie acquistate o gratuite;
-- 2) aggiunge una unicità logica: 1 recensione per utente/storia;
-- 3) aggiorna la policy INSERT RLS per utenti autenticati.
--
-- Prima di eseguirlo, esegui update95c_reviews_preview.sql.

begin;

alter table public.reviews
  alter column booking_id drop not null;

create unique index if not exists reviews_user_story_unique_idx
  on public.reviews (user_id, story_id);

drop policy if exists "Players can review completed bookings" on public.reviews;
drop policy if exists "Players can review eligible stories" on public.reviews;

create policy "Players can review eligible stories"
on public.reviews
for insert
to authenticated
with check (
  auth.uid() = user_id
  and user_id <> master_id
  and exists (
    select 1
    from public.stories s
    where s.id = reviews.story_id
      and coalesce(s.author_id, s.owner_id) = reviews.master_id
      and coalesce(s.author_id, s.owner_id) <> auth.uid()
  )
  and not exists (
    select 1
    from public.reviews existing
    where existing.user_id = auth.uid()
      and existing.story_id = reviews.story_id
  )
  and (
    -- Prenotazione privata completata.
    (
      reviews.booking_id is not null
      and exists (
        select 1
        from public.bookings b
        where b.id = reviews.booking_id
          and b.user_id = auth.uid()
          and b.story_id = reviews.story_id
          and b.master_id = reviews.master_id
          and lower(coalesce(b.status, '')) in ('completata', 'completa', 'completed', 'complete')
      )
    )
    or
    -- Storia acquistata e pagata.
    exists (
      select 1
      from public.story_purchases sp
      where sp.user_id = auth.uid()
        and sp.story_id = reviews.story_id
        and lower(coalesce(sp.payment_status, '')) = 'paid'
    )
    or
    -- Storia gratuita: il frontend mostra il pulsante dopo sblocco materiali.
    exists (
      select 1
      from public.stories s
      where s.id = reviews.story_id
        and coalesce(s.price, 0) <= 0
    )
    or
    -- Sessione pubblica partecipata e completata/scaduta con accesso valido.
    exists (
      select 1
      from public.session_participants part
      join public.public_sessions ps on ps.id = part.session_id
      where part.user_id = auth.uid()
        and part.story_id = reviews.story_id::text
        and lower(coalesce(part.status, '')) = 'joined'
        and (
          lower(coalesce(ps.status, '')) in ('completata', 'completa', 'completed', 'complete')
          or ps.session_date < current_date
        )
        and (
          coalesce(part.payment_amount, ps.payment_amount, 0) <= 0
          or lower(coalesce(part.payment_status, ps.payment_status, '')) in ('paid', 'not_required')
        )
    )
  )
);

commit;
