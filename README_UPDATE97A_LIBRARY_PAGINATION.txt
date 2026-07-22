LORECAST — UPDATE 97A
Libreria personale: paginazione e ricerca

FILE MODIFICATI
- css/style.css
- js/app.js
- js/translations.js
- sections/profilo.html

FUNZIONALITÀ
- Mostra al massimo 5 elementi per pagina in ogni tab della libreria:
  Create, Giocate, Prenotate, Acquisti, Preferiti e Messaggi.
- Aggiunge pulsanti Precedente/Successiva e indicatore pagina/elementi.
- Aggiunge una ricerca unica che filtra il tab selezionato.
- La ricerca considera titolo, genere, formato e altri dati utili disponibili.
- Ogni tab conserva la propria pagina durante la navigazione.
- I contatori dei tab continuano a mostrare il totale completo.
- Nessuna modifica a Stripe, pagamenti, Resend, Edge Functions, SQL o Storage.

NOTA TECNICA
Questa patch limita a 5 gli elementi renderizzati nel DOM e filtra i dati già caricati
nell’attuale cache frontend. Non modifica ancora le query Supabase con range()/count.
È una scelta prudente per evitare regressioni nei tab derivati da più tabelle
(prenotazioni, sessioni pubbliche e messaggi). Una futura ottimizzazione server-side
può essere aggiunta dopo il collaudo della beta.

TEST MANUALE
1. Aprire Profilo > La mia libreria.
2. Verificare che il tab Create mostri al massimo 5 storie.
3. Usare Successiva/Precedente e controllare l’indicatore pagina.
4. Cercare una parola presente nel titolo di una storia.
5. Cambiare tab e verificare ricerca/paginazione in Giocate, Prenotate,
   Acquisti, Preferiti e Messaggi.
6. Cancellare la ricerca con Azzera ricerca.
7. Verificare il layout da desktop e smartphone.
