Update 95C — Recensioni classiche + cooldown messaggi pre-prenotazione

Obiettivi:
- rimuovere il falso 4.9 in Area Master quando non ci sono recensioni reali;
- permettere recensioni dopo storia acquistata, prenotazione giocata, sessione pubblica giocata o sblocco gratuito;
- mantenere 1 recensione per utente/storia;
- limitare i messaggi pre-prenotazione: il giocatore può scrivere al Master massimo 1 volta ogni 5 ore per la stessa conversazione finché non ha accesso/prenotazione/acquisto;
- lasciare il Master libero di rispondere senza cooldown.

File SQL:
1. update95c_reviews_preview.sql
   Query di controllo: non modifica niente.
2. update95c_reviews_access_policy.sql
   Patch non distruttiva: modifica policy RLS e consente reviews senza booking_id per acquisti/gratis/sessioni pubbliche.

Note importanti:
- non sono stati riattivati pagamenti;
- non sono state modificate Edge Functions;
- non sono stati toccati package.json, package-lock.json o node_modules;
- il cooldown è frontend-soft per la beta; prima dei pagamenti reali conviene spostarlo anche lato backend/Edge Function/RPC.
