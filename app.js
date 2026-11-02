(function() {
  var storage=require("Storage"), settings=storage.readJSON("pawlgps.json",1)||{};
  var refresh=[1,2,5].indexOf(settings.refresh)>=0 ? settings.refresh : 1;
  var state=require("pawlgps").create(), page=0, offset=0, timer, configTimer, removed=false;
  var titles=["Fix","Navigation","Accuracy","Skyplot","Satellites","Receiver","NMEA","GPS fields"];
  var start=Date.now();
  function fmt(v,n) { return typeof v === "number" && isFinite(v) ? v.toFixed(n===undefined?1:n) : "--"; }
  function val(v) { return v === undefined || v === "" ? "--" : String(v); }
  function age(at) { return at ? Math.floor((Date.now()-at)/1000)+"s" : "--"; }
  function rows(items,r) {
    var count=Math.max(1,Math.floor((r.h-36)/16));
    offset=Math.min(offset,Math.max(0,Math.ceil(items.length/count)-1));
    items.slice(offset*count,(offset+1)*count).forEach(function(row,i) {
      var y=r.y+20+i*16;
      g.setFont("6x8",1).setFontAlign(-1,-1).drawString(row[0],r.x+3,y);
      g.setFontAlign(1,-1).drawString(val(row[1]),r.x2-3,y);
    });
    return Math.max(1,Math.ceil(items.length/count));
  }
  function wrap(text,width) {
    var lines=[];
    for(var i=0;i<text.length;i+=width) lines.push([text.substr(i,width),""]);
    return lines;
  }
  function sky(sats,r) {
    var cx=(r.x+r.x2)/2, cy=r.y+20+(r.h-42)/2, radius=Math.min(r.w/2-17,(r.h-48)/2);
    g.setColor(g.theme.fg2).drawCircle(cx,cy,radius).drawCircle(cx,cy,radius*2/3).drawCircle(cx,cy,radius/3);
    g.drawLine(cx-radius,cy,cx+radius,cy).drawLine(cx,cy-radius,cx,cy+radius);
    g.setFont("6x8").setFontAlign(0,0).drawString("N",cx,cy-radius-6).drawString("S",cx,cy+radius+6)
      .drawString("W",cx-radius-8,cy).drawString("E",cx+radius+8,cy);
    sats.forEach(function(sat) {
      if(sat.el===undefined || sat.az===undefined || sat.el<0 || sat.el>90 || sat.az<0 || sat.az>360) return;
      var rad=radius*(90-sat.el)/90, az=sat.az*Math.PI/180;
      var x=cx+rad*Math.sin(az), y=cy-rad*Math.cos(az);
      g.setColor(sat.used ? "#0f0" : g.theme.fg);
      if(sat.snr>0) g.fillCircle(x,y,3); else g.drawCircle(x,y,3);
      if(settings.labels!==false) {
        var label=sat.key, w=label.length*6;
        g.setFontAlign(-1,-1).drawString(label,Math.max(r.x,Math.min(x+4,r.x2-w)),Math.max(r.y+16,Math.min(y-4,r.y2-21)));
      }
    });
    if(!sats.length) g.setColor(g.theme.fg).setFontAlign(0,0).drawString("Waiting for GSV",cx,cy);
  }
  function draw() {
    if(removed || !Bangle.isLCDOn()) return;
    var r=Bangle.appRect, f=state.fix, sats=state.satellites(), fresh=state.fixAt && Date.now()-state.fixAt<5000;
    g.reset().clearRect(r).setColor(g.theme.fg).setFont("6x8",2).setFontAlign(-1,-1);
    g.drawString(titles[page],r.x+3,r.y+1);
    g.setFont("6x8",1).setFontAlign(1,-1).drawString((page+1)+"/8",r.x2-2,r.y+4);
    g.setClipRect(r.x,r.y+18,r.x2,r.y2-15);
    var items=[], pages=1;
    if(page===0) {
      items=[["Fix",!fresh?"WAIT / STALE":f.fix?"VALID ("+f.fix+")":"NO FIX"],
        ["Latitude",fmt(f.lat,6)],["Longitude",fmt(f.lon,6)],["Altitude m",fmt(f.alt)],
        ["Sat used",fmt(f.satellites,0)],["HDOP",fmt(f.hdop)],["Data age",age(state.fixAt)],
        ["First fix s",fmt(state.ttff)],["Session s",fmt((Date.now()-start)/1000,0)]];
    } else if(page===1) {
      var time=f.time && isFinite(+f.time) ? f.time.toISOString() : "";
      items=[["Data",fresh?(f.fix?"VALID":"NO FIX"):"WAIT / STALE"],["Speed km/h",fmt(f.speed)],["Course deg",fmt(f.course)],["UTC date",time.substr(0,10)],
        ["UTC time",time.substr(11,8)],["RMC status",state.value("RMC status")],
        ["Mag var",state.value("Mag var")],["Mag course",fmt(state.value("Mag course"))],
        ["RMC mode",state.value("RMC mode")],["VTG mode",state.value("VTG mode")]];
    } else if(page===2) {
      ["Quality","Mode","Dimension","PDOP","HDOP","VDOP","Geoid m","DGPS age s","DGPS station",
        "RMS m","Major m","Minor m","Ellipse deg","Lat err m","Lon err m","Alt err m"].forEach(function(k) { items.push([k,state.value(k)]); });
    } else if(page===3) sky(sats,r);
    else if(page===4) {
      items=[["ID   El  Az  C/N0","Used"]];
      sats.forEach(function(sat) { items.push([sat.key+" "+fmt(sat.el,0)+" "+fmt(sat.az,0)+" "+fmt(sat.snr,0),sat.used?"*":sat.usedKnown?"-":"?"]); });
      if(!sats.length) items.push(["Waiting for GSV",""]);
    } else if(page===5) {
      items=[["NMEA lines",state.lines],["Bad checksum",state.bad],["Loss events",state.lost],
        ["Binary packets",state.binary],["GSV satellites",sats.length],["GPS data age",age(state.fixAt)]];
      state.info.forEach(function(info) { items=items.concat(wrap(info,27)); });
    } else if(page===6) {
      state.raw.forEach(function(raw) { items.push([raw.key,age(raw.at)]); items=items.concat(wrap(raw.line,27)); });
      if(!items.length) items=[["Waiting for NMEA",""]];
    } else {
      Object.keys(f).sort().forEach(function(k) { items=items.concat(wrap(k+": "+String(f[k]),27)); });
      if(!items.length) items=[["Waiting for GPS",""]];
    }
    if(page!==3) pages=rows(items,r);
    g.setClipRect(0,0,g.getWidth()-1,g.getHeight()-1).setColor(g.theme.fg).setFont("6x8").setFontAlign(0,1);
    var footer=page===3 ? "N up | green:used o:no C/N0" : "< page >   ^ "+(offset+1)+"/"+pages+" v";
    g.drawString(footer,(r.x+r.x2)/2,r.y2-1);
  }
  function onGPS(fix) { state.update(fix); }
  function onRaw(line,loss) { state.feed(line,loss); }
  function onLCD(on) {
    if(timer) { clearInterval(timer); timer=undefined; }
    if(on && !removed) { draw(); timer=setInterval(draw,refresh*1000); }
  }
  function cleanup() {
    if(removed) return;
    removed=true;
    if(timer) clearInterval(timer);
    if(configTimer) clearTimeout(configTimer);
    Bangle.removeListener("GPS",onGPS); Bangle.removeListener("GPS-raw",onRaw);
    Bangle.removeListener("lcdPower",onLCD); E.removeListener("kill",cleanup);
    Bangle.setGPSPower(0,"pawlgps");
  }
  Bangle.setUI({mode:"custom",back:function(){load();},remove:cleanup,redraw:draw,
    swipe:function(lr,ud) {
      if(lr) { page=(page+(lr<0?1:7))%8; offset=0; }
      else if(ud) offset=Math.max(0,offset+(ud<0?1:-1));
      draw();
    }});
  Bangle.loadWidgets(); g.clear(); Bangle.drawWidgets();
  Bangle.on("GPS",onGPS); Bangle.on("GPS-raw",onRaw);
  Bangle.on("lcdPower",onLCD); E.on("kill",cleanup);
  Bangle.setGPSPower(1,"pawlgps");
  if(settings.details===true) configTimer=setTimeout(function() {
    configTimer=undefined;
    // Volatile CASIC output selection only: never send PCAS00 (save to flash).
    var command="$PCAS03,1,1,1,1,1,1,1,0", checksum=0;
    for(var i=1;i<command.length;i++) checksum^=command.charCodeAt(i);
    Serial1.println(command+"*"+("0"+checksum.toString(16).toUpperCase()).slice(-2));
  },1200);
  onLCD(Bangle.isLCDOn());
})();
