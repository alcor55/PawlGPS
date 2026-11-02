# Pawl GPS · Bangle.js 2

Otto pagine: fix/coordinate/quota, velocità/rotta/UTC, precisione e DOP,
skyplot con nord in alto, satelliti (elevazione, azimut, C/N0), ricevitore,
NMEA grezzi e tutti i campi dell'evento GPS. Swipe orizzontale: cambia pagina;
verticale: scorri i dati; pulsante: esci. Skyplot: verde = usato nel fix,
cerchio vuoto = segnale non disponibile. Non è orientato dalla bussola.

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
