# Pawl GPS · Bangle.js 2

Nove pagine: fix/coordinate/quota, velocità/rotta/UTC, precisione e DOP,
skyplot con nord in alto, satelliti (elevazione, azimut, C/N0), ricevitore,
NMEA grezzi, tutti i campi dell'evento GPS e **Actions**. Swipe orizzontale: cambia pagina;
verticale: scorri i dati; pulsante: esci. Skyplot: verde = usato nel fix,
cerchio vuoto = segnale non disponibile. Non è orientato dalla bussola.

**Actions:** **Save GPS aid** salva posizione e ora di un fix valido e recente
come aiuto iniziale CASIC, riutilizzato all'avvio del GPS anche da altre app.
**Set GPS time** imposta data/ora UTC lasciando invariati fuso e ora legale.
Non viene creato un waypoint; i punti salvati dalle versioni precedenti restano intatti.

**A-GPS dal loader:** dopo l'installazione riavvia l'orologio, apri l'interfaccia
Pawl GPS dal pulsante Download/gestione dati del tuo App Loader e premi
**Aggiorna e invia A-GPS**. Serve Internet nel browser; la posizione del browser
è facoltativa. Usa la stessa sorgente di [Assisted GPS Updater](https://github.com/espruino/BangleApps/tree/master/apps/assistedgps).
La copia locale viene ricaricata automaticamente quando un'app accende il GPS.
Stati separati mostrano aiuto iniziale, cache A-GPS e ultimo invio.
**sent-unconfirmed** significa inviato, senza conferma di accettazione del ricevitore.

L'aiuto posizione/tempo dura al massimo 24 ore e può essere poco utile dopo un
lungo spostamento. Le effemeridi sono utilizzate solo entro 2 ore dal loro
riferimento temporale, con un limite aggiuntivo di 4 ore dal download e almeno
4 satelliti con dati validi. L'orologio deve avere data/ora corrette. Non è un
backup delle effemeridi acquisite direttamente dai satelliti; i tempi di aggancio
non sono garantiti e richiedono una prova sul dispositivo.

**Impostazioni → App/Widget Settings → Pawl GPS:** aggiornamento 1/2/5 s,
etichette skyplot, **Auto GPS aid** (acceso), **Extra NMEA** (spento). Riavvia l'app dopo le
modifiche. Extra NMEA richiede GGA/GLL/GSA/GSV/RMC/VTG/ZDA al CASIC, senza
salvare nella flash del ricevitore; la selezione rimane fino allo spegnimento
effettivo del GPS, anche se un'altra app lo tiene acceso. Spegnere l'opzione
non ripristina una precedente configurazione personalizzata.

`--` = dato assente/non trasmesso; `?` = uso del satellite sconosciuto.
GSV/GSA/DOP scadono dopo 15 s; il fix è segnalato obsoleto dopo 5 s.
I valori precedenti possono restare visibili con indicazione STALE/NO FIX.
GSV è necessario per lo skyplot, GSA per i satelliti usati. Nessuna precisione
in metri viene dedotta dall'HDOP. Il viewer conserva gli ultimi 32 messaggi
distinti (incluse parti GSV), non una registrazione completa. L'app mantiene
il GPS acceso anche a schermo spento e lo rilascia all'uscita.

[Installazione nel fork BangleApps e sviluppo](DEVELOPMENT.md).
