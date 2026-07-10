Update 96A — Descrizione storia semplificata e card compatte

Obiettivo:
- Eliminare dalla UI il campo "Descrizione completa" nella creazione/modifica storia.
- Evitare che nella scheda storia venga duplicata la descrizione breve sotto "Cosa aspettarsi".
- Rendere più compatte le card di catalogo/sessioni aperte quando la descrizione è lunga.

Modifiche principali:
- Il form Crea storia mantiene una sola descrizione pubblica: "Descrizione breve pubblica".
- La sezione "Cosa aspettarsi" è stata rimossa dalla scheda storia.
- In salvataggio, long_description viene impostato a null per non duplicare la descrizione breve nel database.
- Le descrizioni nelle card sono limitate visivamente a 4 righe.
- È stato aggiunto il pulsante "Mostra altro" che apre la scheda completa della storia.

Note tecniche:
- Nessun SQL.
- Nessuna modifica a pagamenti, Stripe, Edge Functions, Storage o Resend.
- Nessuna modifica a package.json, package-lock.json o node_modules.
- La colonna long_description resta nel database per compatibilità storica, ma non è più usata dalla UI.
