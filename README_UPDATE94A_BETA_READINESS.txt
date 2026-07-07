Update 94A — Beta readiness UI e testi anti-confusione

Obiettivo
- Rendere chiaro agli utenti beta che i pagamenti sono disattivati.
- Evitare CTA o testi ambigui su checkout, carte, incassi e Stripe nella UI pubblica.
- Lasciare intatto il backend Stripe/Resend già preparato per fasi future.

Modifiche principali
- Aggiunti banner beta su Home, Catalogo, Scheda storia, Crea storia, Area Master e Profilo.
- Cambiata la label del pannello laterale nella scheda storia da “Pagamento” a “Accesso beta” quando i pagamenti sono disattivati.
- Chiarita l’opzione “A pagamento” come non attiva in beta.
- Aggiornati testi Privacy, Cookie e Condizioni per spiegare che nella beta pubblica non ci sono carte, checkout o incassi.

Cosa non cambia
- Nessun SQL.
- Nessuna Edge Function.
- Nessuna modifica a Stripe backend/test mode.
- Nessun segreto nel frontend.
- Nessuna modifica a package.json, package-lock.json o node_modules.

Test manuale consigliato
1. Avviare il sito con: python3 -m http.server 3000
2. Aprire Home, Catalogo, Scheda storia, Crea storia, Area Master e Profilo.
3. Verificare che il banner “Beta pubblica: pagamenti disattivati” sia visibile.
4. Aprire una storia a pagamento e verificare che non compaiano CTA attive di checkout.
5. Aprire Privacy, Cookie e Condizioni e verificare che i testi dicano chiaramente che i pagamenti beta sono disattivati.
