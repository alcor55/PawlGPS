# Installazione e sviluppo

## BangleApps: stessa integrazione di PawlClock

PawlClock è un submodule in `apps/pawlClock`, branch `main`, nel `master`
di `alcor55/BangleApps`. PawlGPS usa l'ID tutto minuscolo `pawlgps`:
il percorso deve corrispondere all'ID nel metadata.

Dalla copia locale di BangleApps, con working tree pulito:

```sh
cd "/Users/vor/Elettronica Informatica/Git/BangleApps"
git pull --rebase origin master
git submodule add -b main https://github.com/alcor55/PawlGPS.git apps/pawlgps
git add .gitmodules apps/pawlgps
git commit -m "Add Pawl GPS submodule"
git push origin master
```

Il fork BangleApps non viene modificato automaticamente da questo progetto.
GitHub Pages deve pubblicare `master` da `/ (root)` e includere i submodule
(come per PawlClock). Non modificare `apps.json` manualmente: viene generato
dai metadata. Attendi il completamento della pubblicazione Pages, poi apri
[il tuo App Loader](https://alcor55.github.io/BangleApps/), ricarica con
Cmd+Shift+R, collega il Bangle.js 2 da Chrome/Edge con Web Bluetooth,
cerca **Pawl GPS 0.02** e premi Upload. Il loader installerà anche **Waypoints**
se manca. Scollega altri client Bluetooth
prima di connetterti; prova all'aperto per ricevere i satelliti.

Aggiornamenti successivi, dopo aver pubblicato una nuova versione di PawlGPS:

```sh
git submodule update --init --remote apps/pawlgps
git add apps/pawlgps
git commit -m "Update Pawl GPS submodule"
git pull --rebase origin master
git push origin master
```

Un push a PawlGPS non aggiorna da solo il puntatore del submodule. Non copiare
il workflow di dispatch di PawlClock senza configurare un token con accesso
all'altro repository: il normale GITHUB_TOKEN del progetto non basta.

## Verifica

```sh
node --test tests/*.test.cjs
```

Il decoder mantiene al massimo 12 gruppi GSV (64 record ciascuno), 12 gruppi
GSA, 128 satelliti visualizzati, 32 messaggi NMEA da 240 caratteri e 10 TXT.
Il decoder interpreta GGA/GSA/GSV/RMC/VTG/GST/TXT; gli altri messaggi ricevuti
rimangono nel viewer NMEA. Per segnali multipli mostra il C/N0 maggiore per
satellite. Le costellazioni dipendono dalla configurazione e dal chip montato,
non vengono attivate costellazioni o protocolli binari aggiuntivi.

Per lo smoke test nel firmware ufficiale, scarica in una cartella temporanea
`emulator_banglejs2.js`, `emu_banglejs2.js` e `common.js` da
[EspruinoWebIDE/emu](https://github.com/espruino/EspruinoWebIDE/tree/master/emu):

```sh
ESPRUINO_EMU_DIR=/tmp/pawl-clock-emulator node tests/emulator-smoke.cjs
```

Il runner richiede anche una copia BangleApps in `../BangleApps` (oppure il
percorso in `BANGLEAPPS_DIR`) per caricare il modulo Waypoints ufficiale.

Verificato con Espruino **2v29.74**: parser, tutte le pagine, impostazioni,
icona, spegnimento/riaccensione LCD e pulizia ripetuta di timer/listener.
Eseguito anche `bin/sanitycheck.js` nella copia temporanea ufficiale BangleApps:
0 nuovi errori e 0 nuovi avvisi (le anomalie note upstream restano escluse).
Il test traccia le richieste GPS per app ID; il GPS fisico non è emulato.
Gli screenshot nella cartella `screenshots` usano dati simulati.
Acquisizione, risposta Extra NMEA, autonomia e ricezione richiedono una prova
sul dispositivo. Rigenera l'icona con `python3 tools/make-icon.py` (Pillow).

## Punti condivisi e orologio

La pagina Actions usa `require("waypoints").load()/save()` e aggiunge oggetti
`{name,lat,lon,alt?,time?}` al file condiviso `waypoints.json`.
`name`, `lat` e `lon` sono il formato comune BangleApps; `alt` (metri) e `time`
(ISO UTC) sono campi aggiuntivi che altre app possono ignorare o rimuovere
quando modificano il punto. I nomi `PG001`, `PG002`… sono scelti evitando
collisioni. I punti esistenti vengono mantenuti, anche quelli creati da altre
app. Un file JSON danneggiato non viene sostituito con una lista vuota.
Il file condiviso appartiene a Waypoints, quindi non è dichiarato tra i dati
di PawlGPS e non viene eliminato disinstallando PawlGPS.

`setTime` riceve secondi epoch UTC, compensando il tempo dalla ricezione
dell'evento GPS. Non vengono cambiati timezone, DST o impostazioni persistenti.
Il salto dell'orologio sposta della stessa quantità i timestamp interni di
PawlGPS, mantenendo corrette scadenze di fix/NMEA e durata della sessione.
I test verificano scrittura interoperabile, nomi univoci, dati non validi o
obsoleti, errori storage, sincronizzazione UTC e salti avanti/indietro.
Per i salti dell'orologio il runner modella `Date.now` e la chiamata di
sincronizzazione: l'emulatore riallinea l'RTC all'host ad ogni ciclo. La prova
dell'impostazione effettiva dell'RTC va quindi eseguita sul dispositivo.

## Regole seguite

- [Guida App Loader](https://www.espruino.com/Bangle.js%20App%20Loader):
  metadata, icona 48×48, storage/data dichiarati, versione e ChangeLog coerenti.
- [BangleApps README](https://github.com/espruino/BangleApps#readme):
  ID minuscolo, nomi file sotto 28 caratteri, modulo incluso nello storage.
- [API Bangle](https://www.espruino.com/Reference#Bangle): GPS richiesto con
  app ID proprio, listener individuali, `setUI.remove`, nessun ridisegno a LCD
  spento, rispetto di `Bangle.appRect` e tema/widget. Nessun log su flash.
- [Bangle.js 2 Technical](https://www.espruino.com/Bangle.js2%20Technical):
  comando CASIC PCAS03 opzionale, nessun PCAS00 o reset del ricevitore.

## Repository

`origin`: <https://github.com/alcor55/PawlGPS.git>
`forgejo`: `git@git.v0r.ovh:Vincenzo/PawlGPS.git` (porta SSH da configurazione locale).

```sh
git push origin main
git push forgejo main
```

Prima di una release aggiornare insieme `metadata.json` e `ChangeLog`, eseguire
i test, pubblicare su entrambi i remoti e aggiornare il submodule BangleApps.
