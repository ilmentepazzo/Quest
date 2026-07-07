# Update 95A — Regole piattaforma e pagamenti Lorecast

Questa patch aggiunge una regola contrattuale chiara nelle Condizioni di servizio per proteggere Lorecast quando i pagamenti verranno riattivati.

## Cosa cambia

- Le transazioni nate da storie, sessioni, richieste o conversazioni Lorecast dovranno essere completate tramite gli strumenti ufficiali Lorecast quando i pagamenti saranno attivi.
- La richiesta, accettazione o conclusione di pagamenti esterni per aggirare Lorecast viene definita violazione grave.
- Lorecast potrà applicare limitazioni, sospensione o chiusura permanente dell'account, rimozione contenuti e perdita delle funzioni Master, previa valutazione del caso e nei limiti consentiti dalla legge.
- Il testo è stato aggiunto nelle traduzioni IT/EN/ES/FR.

## Scelte prudenziali

- Nessun ban automatico tecnico viene implementato in questa patch.
- Nessuna scansione automatica dei messaggi viene aggiunta.
- Nessun testo esplicito anti-pagamenti esterni viene mostrato nella UI normale, per non suggerire comportamenti indesiderati.
- La regola resta nelle Condizioni di servizio, dove deve stare la parte contrattuale.

## Non incluso

- Nessun SQL.
- Nessuna modifica a Edge Functions.
- Nessuna modifica a Stripe o pagamenti.
- Nessuna modifica a package.json, package-lock.json o node_modules.
- Nessuna API key o secret.

## Nota legale

Prima del lancio con pagamenti reali, il testo dovrebbe essere rivisto da un consulente legale, soprattutto per policy di sospensione account, preavviso, contestazioni e gestione utenti Master/professionisti.
