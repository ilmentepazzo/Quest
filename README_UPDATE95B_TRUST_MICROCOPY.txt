Update 95B — Microcopy soft per fiducia e prenotazioni

Obiettivo
- Migliorare il tono della UI intorno ai messaggi tra giocatore e Master.
- Presentare il contatto come "domanda prima della prenotazione", non come chat libera commerciale.
- Rafforzare il valore di Lorecast come luogo ordinato per dettagli, risposte, materiali, messaggi e organizzazione.

Cosa cambia
- "Contatta Master" diventa "Chiedi al Master" dove ha senso nella scheda storia.
- Aggiunta una nota morbida sotto il pulsante nella scheda storia:
  "Fai una domanda al Master prima di prenotare..."
- Aggiornato il testo del modal di richiesta al Master con microcopy positivo.
- "Apri chat" diventa "Apri conversazione".
- Aggiornati hint delle conversazioni per dire che i messaggi restano ordinati su Lorecast.
- Aggiornate traduzioni IT/EN/ES/FR.

Scelte di prodotto e sicurezza
- Non si parla in UI di pagamenti esterni, PayPal, IBAN, ban o aggiramento della piattaforma.
- La regola anti-elusione resta nelle Condizioni di servizio aggiunte con Update 95A.
- Nessun blocco tecnico della chat.
- Nessuna scansione automatica dei messaggi.
- Nessun pagamento riattivato.
- Nessuna modifica a Stripe, Edge Functions, SQL, Storage o package.json.

Test manuale consigliato
1. Aprire una scheda storia con Master.
2. Verificare che il pulsante dica "Chiedi al Master".
3. Verificare che sotto il pulsante compaia il testo morbido di orientamento.
4. Cliccare il pulsante e verificare titolo, placeholder e hint del modal.
5. Aprire Profilo > Messaggi o Area Master > Messaggi e verificare che "Apri chat" sia diventato "Apri conversazione".
6. Controllare che non compaiano testi su pagamenti esterni, ban, PayPal o IBAN nella UI normale.
