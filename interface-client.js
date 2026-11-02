/* eslint-env browser, es6 */
/* global Puck, Util, pawlAid */
(function() {
  var update=document.getElementById("update"), refresh=document.getElementById("refresh");
  var message=document.getElementById("message"), status=document.getElementById("status"), ready=false;
  function evaluate(expression) {
    return new Promise(function(resolve,reject) {
      var timer=setTimeout(function(){reject(new Error("Connessione scaduta: riprova."));},30000);
      Puck.eval(expression,function(result) {
        clearTimeout(timer);
        if(!result || result.error) reject(new Error(result && result.error || "Nessuna risposta dall'orologio."));
        else resolve(result);
      });
    });
  }
  function report(s) {
    status.textContent="Aiuto iniziale: "+s.seed+"\nDati A-GPS: "+s.cache+
      "\nSatelliti GPS con dati recenti: "+s.satellites+"\nUltimo invio: "+s.last.state+
      (s.last.detail?"\n"+s.last.detail:"")+"\nByte trasmessi: "+s.last.bytes;
    if(s.last.at) status.textContent+="\nData dell'operazione: "+new Date(s.last.at).toISOString();
  }
  function readStatus() {
    return evaluate("(function(){try{return require('pawlgpsrun').install().status()}catch(e){return {error:String(e)}}})()").then(function(s){report(s);return s;});
  }
  function getPosition() {
    if(!document.getElementById("location").checked || !navigator.geolocation) return Promise.resolve(undefined);
    return new Promise(function(resolve) {
      navigator.geolocation.getCurrentPosition(function(p) {
        resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:Math.max(1,Math.min(1000000,p.coords.accuracy||100000))});
      },function(){resolve(undefined);},{timeout:10000,maximumAge:60000,enableHighAccuracy:false});
    });
  }
  window.onInit=function(device) {
    if(!device || device.id!=="BANGLEJS2") { message.textContent="Questa funzione richiede Bangle.js 2."; return; }
    readStatus().then(function(){ready=true;update.disabled=false;refresh.disabled=false;message.textContent="Pronto. I dati GPS precedenti restano disponibili se il download non riesce.";})
      .catch(function(e){message.textContent=e.message+" Installa o aggiorna Pawl GPS e riavvia l'orologio.";});
  };
  refresh.addEventListener("click",function(){readStatus().catch(function(e){message.textContent=e.message;});});
  update.addEventListener("click",function() {
    if(!ready) return;
    update.disabled=true; refresh.disabled=true;
    message.textContent="Download dei dati A-GPS…";
    var raw, downloaded;
    var abort=new AbortController(), fetchTimer=setTimeout(function(){abort.abort();},15000);
    fetch("https://www.espruino.com/agps/casic.base64",{cache:"no-store",signal:abort.signal})
      .then(function(response){if(!response.ok) throw new Error("Download non riuscito: "+response.status);return response.text();})
      .then(function(b64) {
        clearTimeout(fetchTimer);
        if(b64.length>24000) throw new Error("File A-GPS troppo grande.");
        raw=atob(b64.replace(/\s/g,"")); downloaded=Date.now();
        var selected=pawlAid.select(raw,downloaded);
        if(selected.satellites<4) throw new Error("La sorgente non contiene abbastanza effemeridi recenti. Riprova più tardi.");
        message.textContent="Dati verificati; richiesta posizione facoltativa…";
        return getPosition();
      })
      .then(function(position) {
        var meta={downloaded:downloaded,size:raw.length,crc:pawlAid.crc32(raw),position:position};
        message.textContent="Caricamento sull'orologio…";
        return new Promise(function(resolve,reject) {
          var timer=setTimeout(function(){reject(new Error("Caricamento incompleto: riprova."));},60000);
          Util.writeStorage("pawlgps.agps.tmp",raw,function(result){clearTimeout(timer);if(result===false) reject(new Error("Caricamento non riuscito."));else resolve(meta);});
        });
      })
      .then(function(meta) {
        return evaluate("(function(){try{return require('pawlgpsrun').importCache("+JSON.stringify(meta)+")}catch(e){return {error:String(e)}}})()");
      })
      .then(function(s) {
        report(s); message.textContent="Copia locale salvata. Invio al ricevitore in corso…";
        return new Promise(function(resolve,reject) {
          var attempts=0;
          function poll() {
            readStatus().then(function(next) {
              if(!next.busy) { resolve(next); return; }
              if(++attempts>=20) { reject(new Error("Invio ancora in corso: usa Leggi stato.")); return; }
              setTimeout(poll,1000);
            }).catch(reject);
          }
          setTimeout(poll,1000);
        });
      })
      .then(function(s){message.textContent=s.last.state==="sent-unconfirmed"?"Dati inviati al ricevitore; accettazione non confermata. La copia locale resta disponibile finché valida.":"Copia salvata. Stato invio: "+s.last.state;})
      .catch(function(e){clearTimeout(fetchTimer);message.textContent=e.name==="AbortError"?"Download scaduto: riprova.":e.message;})
      .then(function(){update.disabled=false;refresh.disabled=false;});
  });
})();
