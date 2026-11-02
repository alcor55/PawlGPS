/* One controller per interpreter, shared by every GPS application. */
exports.create=function(env) {
  var B=env.Bangle, S=env.storage, aid=env.aid, serial=env.serial, now=env.now;
  var basePower=B.setGPSPower, timer, held=false, queue=[], index=0, skipCycle=false, external={}, active=true, manual=false;
  var last={state:"idle",at:0,bytes:0}, ctl={};
  function settings() { return S.readJSON("pawlgps.json",1)||{}; }
  function update(state,detail) { last={state:state,detail:detail||"",at:now(),bytes:last.bytes||0}; }
  function release() {
    if(!held) return;
    held=false; B.setGPSPower(0,"pawlgpsaid");
  }
  function cancel() {
    var pending=timer || held || queue.length;
    if(timer) { env.clearTimeout(timer); timer=undefined; }
    if(pending) update("cancelled");
    queue=[]; index=0; release();
  }
  function packetString(bytes) {
    var text="";
    for(var i=0;i<bytes.length;i++) text+=String.fromCharCode(bytes[i]);
    return text;
  }
  function prepare() {
    timer=undefined;
    if(!B.isGPSOn() || Object.keys(external).length) { cancel(); return; }
    if(!manual && settings().autoAid===false) { update("disabled"); release(); return; }
    try {
      var current=now(), seed=S.readJSON("pawlgps.aid.json",1), cache=S.readJSON("pawlgps.agps.json",1);
      queue=[];
      var initial=aid.initial(seed,current), selected={satellites:0,frames:[]};
      if(initial) queue.push(packetString(initial));
      var cacheProblem="";
      try {
        if(aid.cacheValid(cache,current)) {
          var raw=env.decode(cache.data);
          selected=aid.select(raw,current);
          selected.frames.forEach(function(f) { queue.push(raw.substr(f.offset,f.length)); });
        }
      } catch(error) { cacheProblem="; invalid A-GPS cache"; }
      if(!queue.length) { update("no-valid-data",cacheProblem); release(); return; }
      index=0; last.bytes=0;
      update("sending",selected.satellites+" GPS satellites"+(initial?" + initial aid":"")+cacheProblem);
      held=true; B.setGPSPower(1,"pawlgpsaid");
      sendNext();
    } catch(error) { update("error",String(error)); queue=[]; release(); }
  }
  function sendNext() {
    timer=undefined;
    if(!B.isGPSOn() || Object.keys(external).length) { cancel(); return; }
    try {
      if(index<queue.length) {
        var packet=queue[index++]; serial.write(packet); last.bytes+=packet.length;
        timer=env.setTimeout(sendNext,120);
      } else {
        queue=[]; update("sent-unconfirmed",last.detail);
        // Leave enough UART/receiver processing time before releasing our lease.
        timer=env.setTimeout(function() { timer=undefined; release(); },500);
      }
    } catch(error) { update("error",String(error)); queue=[]; release(); }
  }
  function schedule(delay,explicit) {
    if(timer || queue.length) return;
    manual=!!explicit;
    last.bytes=0; update("waiting"); timer=env.setTimeout(prepare,delay);
  }
  function wrapper(on,id) {
    if(!active) return basePower.apply(this,arguments);
    var before=B.isGPSOn(), result=basePower.apply(this,arguments), after=B.isGPSOn();
    if(id==="pawlgpsaid") return result;
    if(id==="agps" || id==="agpsdata") {
      if(on) { external[id]=true; skipCycle=true; cancel(); update("external-updater"); }
      else delete external[id];
    }
    if(!after) { cancel(); skipCycle=false; }
    else if(!before && !skipCycle && settings().autoAid!==false) schedule(1500);
    return result;
  }
  ctl.apply=function() {
    if(!active) throw new Error("GPS assistance controller closed");
    if(Object.keys(external).length) throw new Error("Another A-GPS updater is active");
    if(timer || queue.length) return ctl.status();
    held=true; B.setGPSPower(1,"pawlgpsaid"); schedule(1500,true);
    return ctl.status();
  };
  ctl.status=function() {
    var current=now(), seed=S.readJSON("pawlgps.aid.json",1), cache=S.readJSON("pawlgps.agps.json",1);
    var satellites=0, cacheState=cache?"expired":"missing";
    try {
      if(aid.cacheValid(cache,current)) {
        satellites=aid.select(env.decode(cache.data),current).satellites;
        cacheState=satellites>=4?"valid":"expired";
      }
    } catch(error) { cacheState="invalid"; }
    return {seed:aid.seedValid(seed,current)?"valid":seed?"expired":"missing",cache:cacheState,
      satellites:satellites,last:last,busy:!!timer || !!queue.length,auto:settings().autoAid!==false};
  };
  ctl.dispose=function() {
    active=false;
    cancel();
    if(B.setGPSPower===wrapper) B.setGPSPower=basePower;
    if(B.pawlgpsAid===ctl) delete B.pawlgpsAid;
  };
  // A controller may be installed while an updater already holds GPS power.
  var owners=B._PWR && B._PWR.GPS || [];
  ["agps","agpsdata"].forEach(function(id) { if(owners.indexOf(id)>=0) { external[id]=true;skipCycle=true; } });
  B.setGPSPower=wrapper;
  if(B.isGPSOn() && !skipCycle && settings().autoAid!==false) schedule(1500);
  return ctl;
};
exports.install=function() {
  if(Bangle.pawlgpsAid) return Bangle.pawlgpsAid;
  Bangle.pawlgpsAid=exports.create({Bangle:Bangle,storage:require("Storage"),aid:require("pawlgpsaid"),
    serial:Serial1,now:Date.now,decode:atob,setTimeout:setTimeout,clearTimeout:clearTimeout});
  return Bangle.pawlgpsAid;
};
exports.importCache=function(meta) {
  var S=require("Storage"), aid=require("pawlgpsaid"), raw=S.read("pawlgps.agps.tmp"), current=Date.now();
  if(!meta || typeof meta.downloaded!=="number" || Math.abs(current-meta.downloaded)>300000) throw new Error("Check watch date/time first");
  if(typeof raw!=="string" || raw.length!==meta.size || aid.crc32(raw)!==meta.crc) throw new Error("Incomplete A-GPS upload; retry");
  var selected=aid.select(raw,current);
  if(selected.satellites<4) throw new Error("No fresh satellite data in download");
  // The old cache is untouched until the complete staged upload validates.
  if(S.writeJSON("pawlgps.agps.json",{version:1,downloaded:meta.downloaded,data:btoa(raw)})===false) throw new Error("Unable to save A-GPS cache");
  S.erase("pawlgps.agps.tmp");
  if(aid.validPosition(meta.position)) {
    var p=meta.position;
    if(S.writeJSON("pawlgps.aid.json",{lat:p.lat,lon:p.lon,accuracy:p.accuracy||100000,at:meta.downloaded,source:"browser"})===false) throw new Error("A-GPS cached; unable to save position");
  }
  return exports.install().apply();
};
