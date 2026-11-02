/* Bounded, passive NMEA decoder. No receiver configuration or flash writes. */
exports.create = function(now) {
  now = now || Date.now;
  var s = {fix:{}, fixAt:0, groups:{}, used:{}, fields:{}, raw:[], info:[],
    lines:0, bad:0, lost:0, binary:0, started:now(), ttff:undefined};
  // Espruino coerces zero-prefixed strings as octal; NMEA is decimal.
  function number(v) {
    if(v===undefined || v==="") return undefined;
    v=String(v);
    var sign=v[0]==="-" ? -1 : 1;
    if(v[0]==="-" || v[0]==="+") v=v.substr(1);
    while(v.length>1 && v[0]==="0" && v[1]!==".") v=v.substr(1);
    var n=sign*parseFloat(v);
    return isFinite(n) ? n : undefined;
  }
  function put(name, value, at) { s.fields[name] = {value:value, at:at}; }
  function prune(map, age) {
    Object.keys(map).forEach(function(k) { if (now()-map[k].at > age) delete map[k]; });
  }
  function system(talker, id, sys) {
    if (talker === "GN" && sys) return ({1:"GP",2:"GL",3:"GA",4:"GB",5:"GQ",6:"GI"})[sys] || "GN";
    if (talker === "BD") return "GB";
    if (talker !== "GN") return talker;
    if (id >= 65 && id <= 96) return "GL";
    if (id >= 201 && id <= 237) return "GB";
    if (id >= 301 && id <= 336) return "GA";
    if (id >= 1 && id <= 32) return "GP";
    return "GN";
  }
  function satKey(talker, id, sys) {
    var t = system(talker,id,sys);
    if (t === "GL" && id >= 65 && id <= 96) id -= 64;
    if (t === "GB" && id >= 201 && id <= 237) id -= 200;
    if (t === "GA" && id >= 301 && id <= 336) id -= 300;
    return t+id;
  }
  s.update = function(fix) {
    s.fix = fix; s.fixAt = now();
    if (fix.fix && s.ttff === undefined) s.ttff = (now()-s.started)/1000;
  };
  s.feed = function(line, loss) {
    if (loss) s.lost++;
    if (typeof line !== "string") return;
    if (line[0] !== "$" && line[0] !== "!") { s.binary++; return; }
    s.lines++;
    if (line.length > 240) { s.bad++; return; }
    line = line.trim();
    var star = line.indexOf("*"), checksum = 0, i;
    if (star >= 0) {
      for (i=1;i<star;i++) checksum ^= line.charCodeAt(i);
      // Espruino's small regexp engine does not implement counted repetition.
      if (!/^[0-9a-f][0-9a-f]$/i.test(line.substr(star+1,2)) || checksum !== parseInt(line.substr(star+1,2),16)) { s.bad++; return; }
    }
    var a = (star < 0 ? line : line.substr(0,star)).substr(1).split(",");
    var tag = a[0], talker = tag.substr(0,2), type = tag.substr(2), at = now();
    // Preserve multipart GSV/GSA and all receiver TXT fields in the raw view.
    var key = tag;
    if (type === "GSV") key += ":"+a[2]+":"+((a.length-4)%4 === 1 ? a[a.length-1] : "");
    if (type === "GSA") key += ":"+(a[18] || "");
    if (type === "TXT") key += ":"+a.slice(4).join(",").split("=")[0];
    var old = s.raw.filter(function(r) { return r.key === key; })[0];
    if (old) { old.line=line; old.at=at; }
    else { if (s.raw.length >= 32) s.raw.shift(); s.raw.push({key:key,line:line,at:at}); }
    prune(s.groups,15000); prune(s.used,15000);
    if (type === "GSV") {
      var total=number(a[1]), part=number(a[2]);
      if (!total || total>16 || !part || part>total) return;
      var signal=(a.length-4)%4 === 1 ? a[a.length-1] : "";
      var gkey=talker+":"+signal, group=s.groups[gkey];
      if (part === 1) {
        if (!group && Object.keys(s.groups).length >= 12) return;
        group=s.groups[gkey]={at:at,next:1,total:total,sats:[],complete:false};
      }
      if (!group || part!==group.next || total!==group.total) return;
      group.at=at; group.next++;
      for (i=4;i+3<a.length;i+=4) {
        var id=number(a[i]);
        if (!id || group.sats.length >= 64) continue;
        group.sats.push({key:satKey(talker,id),id:id,talker:talker,
          el:number(a[i+1]),az:number(a[i+2]),snr:number(a[i+3]),signal:signal});
      }
      group.complete=part===total;
    } else if (type === "GSA") {
      var ukey=talker+":"+(a[18] || ""), ids=[];
      for(i=3;i<=14;i++) if (number(a[i])) ids.push(satKey(talker,number(a[i]),number(a[18])));
      if (s.used[ukey] || Object.keys(s.used).length < 12) s.used[ukey]={at:at,ids:ids,system:system(talker,0,number(a[18]))};
      put("Mode",a[1],at); put("Dimension",a[2],at);
      put("PDOP",number(a[15]),at); put("HDOP",number(a[16]),at); put("VDOP",number(a[17]),at);
    } else if (type === "GGA") {
      put("Quality",a[6],at); put("Geoid m",number(a[11]),at);
      put("DGPS age s",number(a[13]),at); put("DGPS station",a[14],at);
    } else if (type === "RMC") {
      put("RMC status",a[2],at); put("Mag var",a[10] ? a[10]+a[11] : undefined,at); put("RMC mode",a[12],at);
    } else if (type === "VTG") {
      put("Mag course",number(a[3]),at); put("VTG mode",a[9],at);
    } else if (type === "GST") {
      ["RMS m","Major m","Minor m","Ellipse deg","Lat err m","Lon err m","Alt err m"].forEach(function(k,j) { put(k,number(a[j+2]),at); });
    } else if (type === "TXT") {
      var txt=a.slice(4).join(",");
      if (s.info.indexOf(txt)<0) { if(s.info.length>=10) s.info.shift(); s.info.push(txt); }
    }
  };
  s.value = function(k) { var f=s.fields[k]; return f && now()-f.at<=15000 ? f.value : undefined; };
  s.satellites = function() {
    prune(s.groups,15000); prune(s.used,15000);
    var result={}, used=[];
    Object.keys(s.used).forEach(function(k) { used=used.concat(s.used[k].ids); });
    Object.keys(s.groups).forEach(function(k) {
      var group=s.groups[k];
      if (!group.complete) return;
      group.sats.forEach(function(sat) {
        var old=result[sat.key];
        if (!old || (sat.snr === undefined ? -1 : sat.snr) > (old.snr === undefined ? -1 : old.snr)) result[sat.key]=sat;
      });
    });
    return Object.keys(result).sort().slice(0,128).map(function(k) {
      var sat=result[k]; sat.used=used.indexOf(k)>=0;
      sat.usedKnown=Object.keys(s.used).some(function(u) { return s.used[u].system===sat.key.substr(0,2) || s.used[u].system==="GN"; });
      return sat;
    });
  };
  return s;
};
