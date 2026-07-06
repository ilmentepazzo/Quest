# Lorecast - Note pre-lancio Update 88

Questa patch sistema alcuni punti emersi dal check-up Copilot/ChatGPT prima della beta.

## Cosa include

- `stripe-webhook`: evita upsert ciechi su `story_purchases` e non retrocede acquisti già `paid`.
- Edge Functions Stripe/Connect: CORS con allowlist tramite `ALLOWED_ORIGINS`, `PUBLIC_SITE_URL`, `ALLOW_LOCALHOST`.
- `create-test-refund`: controllo aggiuntivo per evitare doppi rimborsi test.
- `.env.example`: elenco variabili richieste.
- `prelaunch_security_constraints.sql`: controlli duplicati e vincoli anti race condition/idempotenza.

## Variabili da impostare nei secrets Supabase Functions

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_SITE_URL`
- `ALLOWED_ORIGINS`
- `ALLOW_LOCALHOST`
- `LORECAST_FEE_PERCENT`
- `STRIPE_CONNECT_COUNTRY`

Esempio sviluppo:

```text
PUBLIC_SITE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
ALLOW_LOCALHOST=1
```

Esempio beta:

```text
PUBLIC_SITE_URL=https://beta.tuodominio.it
ALLOWED_ORIGINS=https://beta.tuodominio.it
ALLOW_LOCALHOST=0
```

## SQL

Eseguire `prelaunch_security_constraints.sql` prima in staging/test.

Ordine:

1. Eseguire solo le SELECT iniziali per controllare duplicati.
2. Se non ci sono duplicati, eseguire i blocchi `do $$ ... $$` e gli indici.
3. Testare checkout, webhook e refund.
4. Solo dopo applicare in produzione.

## Test minimi

- Checkout storia già acquistata: deve essere bloccato.
- Checkout pending: deve riusare la sessione Stripe esistente quando possibile.
- Webhook duplicato: deve risultare duplicate/no-op.
- Rimborso test doppio: il secondo tentativo deve essere bloccato.
- CORS: origine consentita funziona, origine non consentita non riceve `Access-Control-Allow-Origin`.

## Nota chiavi

La Supabase anon/public key può stare nel frontend. Non mettere mai nel frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- chiavi `sk_test_` / `sk_live_`
