# Update 93B — Infrastruttura Resend per notifiche email beta

Questa patch prepara l'invio email tramite Resend usando una Edge Function Supabase dedicata:

- `supabase/functions/send-notification-email/index.ts`
- integrazione non bloccante in `js/app.js` per i messaggi "Contatta Master" / conversazioni

## Sicurezza

- Nessuna API key è nel frontend.
- La API key Resend deve restare in Supabase Secrets come `RESEND_API_KEY`.
- La funzione usa `SUPABASE_SERVICE_ROLE_KEY` solo lato Edge Function per leggere profili, conversazioni e messaggi.
- Il frontend passa solo `conversationId` e `messageId`.
- La funzione verifica che l'utente autenticato sia davvero il mittente del messaggio e partecipante alla conversazione.
- Il destinatario email viene letto dal database, non accettato dal frontend.

## Secrets attesi

Già impostati per preparazione:

```bash
supabase secrets set RESEND_API_KEY="..." --project-ref fkubtvumsxifovevsvzk
supabase secrets set RESEND_REPLY_TO="info.dix.doitfor@gmail.com" --project-ref fkubtvumsxifovevsvzk
supabase secrets set RESEND_EMAILS_ENABLED="false" --project-ref fkubtvumsxifovevsvzk
```

Quando Lorecast avrà un dominio verificato in Resend, impostare anche:

```bash
supabase secrets set RESEND_FROM="Lorecast <notifiche@tuodominio.it>" --project-ref fkubtvumsxifovevsvzk
supabase secrets set RESEND_EMAILS_ENABLED="true" --project-ref fkubtvumsxifovevsvzk
```

Finché `RESEND_EMAILS_ENABLED` resta `false`, la funzione non invia email reali e risponde con `skipped: true`.

## Deploy manuale

Non fare deploy automatico. Quando vuoi pubblicare la funzione:

```bash
supabase functions deploy send-notification-email --project-ref fkubtvumsxifovevsvzk
```

## Test beta senza invio reale

Con `RESEND_EMAILS_ENABLED=false`:

1. avvia il sito statico;
2. accedi con un utente;
3. invia un messaggio da "Contatta Master";
4. controlla nei log Supabase Edge Functions che `send-notification-email` venga invocata;
5. la risposta attesa è `ok: true` con `skipped: true`.

## Nota dominio

Per inviare email reali a utenti beta serve un dominio/sottodominio verificato su Resend. La Gmail `info.dix.doitfor@gmail.com` resta email pubblica di assistenza e può essere usata come `reply_to`, ma non deve essere usata come mittente automatico non verificato.
