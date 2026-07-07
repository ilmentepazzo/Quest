# Update 93A — Email contatto beta

Questa patch rende visibile l’email temporanea di contatto beta:

info.dix.doitfor@gmail.com

File aggiornati:
- footer pubblico;
- pagina Contattaci;
- Privacy Policy;
- Cookie Policy;
- Condizioni di servizio;
- traduzioni frontend;
- default `supportEmail` in `js/config.js`.

Non sono state aggiunte API key.
Non sono state modificate Edge Functions.
Non sono stati toccati pagamenti, Stripe live, SQL o Storage.

## Promemoria per Update 93B — Resend

Per attivare notifiche email automatiche con Resend in modo corretto servirà idealmente un dominio verificato.

Passi consigliati per la patch futura:
1. Verificare un dominio o sottodominio dedicato alle email Lorecast.
2. Configurare su Supabase Secrets una chiave Resend, ad esempio `RESEND_API_KEY`.
3. Configurare un mittente verificato, ad esempio `RESEND_FROM_EMAIL`.
4. Creare una Edge Function dedicata all’invio email, senza inserire segreti nel frontend.
5. Chiamare la Edge Function solo per eventi importanti: nuovo contatto Master, risposta importante, prenotazione/sessione.
6. Aggiungere rate limit, controllo destinatari, log essenziali e fallback su notifiche interne.

Finché non c’è un dominio verificato, l’invio reale via Resend va rimandato o limitato a test tecnici controllati.
