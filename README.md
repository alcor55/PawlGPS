# Pawl GPS · Bangle.js 2

Nove pagine: fix/coordinate/quota, velocità/rotta/UTC, precisione e DOP,
skyplot con nord in alto, satelliti (elevazione, azimut, C/N0), ricevitore,
NMEA grezzi, tutti i campi dell'evento GPS e **Actions**. Swipe orizzontale: cambia pagina;
verticale: scorri i dati; pulsante: esci. Skyplot: verde = usato nel fix,
cerchio vuoto = segnale non disponibile. Non è orientato dalla bussola.

**Actions:** tocca **Save fix** per aggiungere `PG001`, `PG002`… ai punti
condivisi di [Waypoints](https://github.com/espruino/BangleApps/tree/master/apps/waypoints),
utilizzabili ad esempio da GPS Navigation e Waypointer. Conserva i punti
esistenti; quota e ora UTC vengono incluse se disponibili. Tocca **Set GPS time**
per impostare data e ora dell'orologio dal GPS, mantenendo fuso orario e ora
legale configurati. Entrambe le azioni richiedono un fix valido da meno di 5 s;
la seconda richiede anche data/ora UTC valide. Waypoints viene installato
automaticamente dal loader come dipendenza e permette di gestire i punti.

**Impostazioni → App/Widget Settings → Pawl GPS:** aggiornamento 1/2/5 s,
etichette skyplot, **Extra NMEA** (predefinito spento). Riavvia l'app dopo le
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
