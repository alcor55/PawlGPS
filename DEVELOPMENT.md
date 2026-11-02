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
cerca **Pawl GPS 0.04** e premi Upload, poi riavvia l’orologio per attivare
il servizio di assistenza per tutte le app. Scollega altri client Bluetooth
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

Il decoder mantiene al massimo 12 gruppi GSV (64 record per snapshot e altri
64 per aggiornamento in corso in ciascun gruppo), 12 gruppi
GSA, 128 satelliti visualizzati, 32 messaggi NMEA da 240 caratteri e 10 TXT.
Il decoder interpreta GGA/GSA/GSV/RMC/VTG/GST/TXT; gli altri messaggi ricevuti
rimangono nel viewer NMEA. Per segnali multipli mostra il C/N0 maggiore per
satellite. Le costellazioni dipendono dalla configurazione e dal chip montato,
non vengono attivate costellazioni o protocolli binari aggiuntivi.

Il gruppo GSV pubblicato viene sostituito solo dopo la ricezione di tutte le
parti consecutive, con totale parti e satelliti dichiarati coerenti. La prima
parte di un nuovo ciclo non cancella il precedente; parti fuori ordine o
segnalazioni di perdita scartano solo il candidato. Un report completo con zero
satelliti cancella immediatamente il gruppo precedente. La scadenza del gruppo
pubblicato è 15 s dal completamento: ripetere solo la prima parte non lo rinnova.
Il cambio dell'ora sposta sia i timestamp dei gruppi pubblicati sia quelli in corso.

`GSV reported`/`Rep` usa il massimo dichiarato tra segnali della stessa
costellazione; un totale combinato GN non viene sommato nuovamente ai sistemi
singoli (si usa il massimo tra GN e somma dei singoli). `GSV received`/`Rx`
conta i satelliti unici negli snapshot completi; `Sky positions`/`Plot` conta
quelli con coordinate disegnabili. Il ricevitore può dichiarare più satelliti
di quelli decodificati, o fornire C/N0 senza elevazione/azimut. Durante un ciclo
incompleto Rep può riferirsi al nuovo annuncio, mentre Rx e Plot conservano
l'ultimo insieme completo. `GSV updating` in Receiver conta i gruppi in corso.
Questi contatori descrivono i messaggi ricevuti, non i satelliti usati nel fix.

Per lo smoke test nel firmware ufficiale, scarica in una cartella temporanea
`emulator_banglejs2.js`, `emu_banglejs2.js` e `common.js` da
[EspruinoWebIDE/emu](https://github.com/espruino/EspruinoWebIDE/tree/master/emu):

```sh
ESPRUINO_EMU_DIR=/tmp/pawl-clock-emulator node tests/emulator-smoke.cjs
```

Verificato con Espruino **2v29.74**: parser, tutte le pagine, impostazioni,
icona, spegnimento/riaccensione LCD e pulizia ripetuta di timer/listener.
Eseguito anche `bin/sanitycheck.js` nella copia temporanea ufficiale BangleApps:
0 nuovi errori e 0 nuovi avvisi (le anomalie note upstream restano escluse).
Il test traccia le richieste GPS per app ID; il GPS fisico non è emulato.
Gli screenshot nella cartella `screenshots` usano dati simulati.
Acquisizione, risposta Extra NMEA, autonomia e ricezione richiedono una prova
sul dispositivo. Rigenera l'icona con `python3 tools/make-icon.py` (Pillow).

## Assistenza GPS e orologio

`Save GPS aid` scrive `pawlgps.aid.json`: latitudine, longitudine, epoca UTC GPS,
fonte e un'incertezza iniziale prudente. Non salva né ripristina un waypoint.
La dipendenza Waypoints della versione 0.02 è rimossa; `waypoints.json` non
viene letto, scritto o eliminato. Quota esclusa da AID-INI (flag invalid height):
il fix fornisce quota MSL e il protocollo richiede altezza ellissoidale.

Il loader usa `interface.html`/`interface-client.js` con le API ufficiali
`Puck.eval` e `Util.writeStorage`. Scarica `https://www.espruino.com/agps/casic.base64`
come l'updater ufficiale; la geolocalizzazione del browser è facoltativa.
Il file viene prima caricato in `pawlgps.agps.tmp`; dimensione, CRC32, checksum
e tipi CASIC sono verificati di nuovo sul dispositivo prima di sostituire
`pawlgps.agps.json`. Il vecchio file non è toccato da download falliti,
trasferimenti interrotti o upload non validi. Non è promessa atomicità in caso
di perdita di alimentazione durante la scrittura finale in flash.

La cache contiene Base64, versione e data del download. Sono accettati solo
MSG-GPSEPH, MSG-GPSION e MSG-GPSUTC nei formati della sorgente ufficiale, fino
a 16 KiB e 64 pacchetti. Per l'invio servono almeno 4 satelliti sani con flag
valid=3 e |ora corrente − TOE| <= 2 ore; il file scade comunque dopo 4 ore dal
download. Vengono risolti i week number GPS modulo 1024 rispetto alla data
corrente. Una data di download recente non rinnova il TOE dei satelliti.
I frame ION/UTC, senza epoca propria, accompagnano soltanto effemeridi recenti.

`assist.js` è condiviso tra browser e firmware. Genera AID-INI con la data/ora
corrente (non quella vecchia memorizzata), GPS−UTC=18 s e incertezza temporale
60 s. L'aiuto posizione è usato per 24 ore, con incertezza di 100 km dopo il
primo minuto; non può sapere se l'utente si è spostato molto. Nessuna pretesa
di sincronizzazione di precisione o garanzia sui tempi di aggancio.
Il valore dei leap seconds è stato verificato rispetto al
[Bollettino IERS C 72](https://datacenter.iers.org/data/html/bulletinc-072.html),
che conferma UTC−TAI = −37 s e nessun nuovo leap second a dicembre 2026.

`pawlgps.boot.js` installa un solo controller `runtime.js`, mantenuto in
`Bangle.pawlgpsAid`. Intercetta le transizioni effettive spento/acceso tramite
`Bangle.setGPSPower`, preservando contesto, parametri e valore di ritorno.
Attende 1,5 s e invia pacchetti a intervalli di 120 ms. Durante l'invio detiene
solo la richiesta GPS `pawlgpsaid`, che viene rilasciata anche su errore.
Non cambia costellazioni, baud rate o configurazioni persistenti del chip.
`Auto GPS aid` disattiva i ripristini automatici; l'aggiornamento esplicito dal
loader rimane disponibile. Le richieste degli updater ufficiali con ID `agps`
e `agpsdata` hanno precedenza e cancellano il nostro invio nella stessa sessione.
Gli updater di terze parti che non usano questi ID non possono essere rilevati.

Lo stato resta in RAM: nessuna scrittura flash per ogni riaccensione GPS.
`sent-unconfirmed` indica esclusivamente il completamento della trasmissione
UART; non implica ACK, accettazione o miglioramento misurato. La cache non è
uno standard di file condiviso BangleApps: le altre app beneficiano dei dati
inviati al ricevitore. Non viene esportato uno stato completo dal GPS.

`Set GPS time` usa `setTime` in secondi epoch UTC, compensando l'età dell'evento.
Timezone e DST restano invariati. I timestamp interni dell'app vengono spostati
dello stesso salto per preservare scadenze e durata della sessione. Il runner
modella l'RTC e l'alimentazione GPS, poiché l'emulatore riallinea il clock
all'host e non emula il ricevitore fisico.

## Prova sul dispositivo

1. Installa 0.03 e riavvia; da Actions salva l'aiuto con fix e ora UTC validi.
2. Dal loader apri la gestione dati Pawl GPS, aggiorna A-GPS e controlla stati
   e byte inviati. Ripeti negando la posizione del browser: il download deve
   funzionare comunque. Un orologio fuori orario va prima sincronizzato.
3. Esci da Pawl GPS e avvia un'altra app GPS; con quell'app aperta, leggi lo
   stato dal pannello web Pawl GPS. Prova anche l'updater ufficiale: deve avere
   precedenza. L'ultimo stato è in RAM e si azzera a un riavvio dell'interprete.
4. Misura il tempo al primo fix (TTFF) in condizioni comparabili, con assistenza
   attiva e disattiva, annotando che cache interna e visibilità del cielo
   rendono i confronti non equivalenti a un vero cold start. Non viene mandato
   alcun comando di cold reset per fabbricare condizioni di prova.
5. Verifica sul display l'ora dopo Set GPS time e controlla che le altre app
   rilascino normalmente il GPS. Ricezione, accettazione CASIC, autonomia e
   confronto TTFF non sono misurabili nell'emulatore e restano da validare.

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
