/* CASIC assistance codec. Also loaded by the App Loader interface. */
var pawlAid=(function() {
  var api={}, epoch=315964800000, weekMS=604800000, leapMS=18000;
  function finite(n) { return typeof n==="number" && isFinite(n); }
  function clock(now) { return finite(now) && now>=1577836800000 && now<4102444800000; }
  function u16(s,i) { return s.charCodeAt(i)+s.charCodeAt(i+1)*256; }
  function u32(s,i) { return (u16(s,i)+u16(s,i+2)*65536)>>>0; }
  api.validPosition=function(p) {
    return p && finite(p.lat) && Math.abs(p.lat)<=90 && finite(p.lon) && Math.abs(p.lon)<=180;
  };
  api.seedValid=function(seed,now) {
    return api.validPosition(seed) && clock(now) && finite(seed.at) && now>=seed.at && now-seed.at<86400000 &&
      (seed.accuracy===undefined || (finite(seed.accuracy) && seed.accuracy>0 && seed.accuracy<=1000000));
  };
  api.crc32=function(raw) {
    var crc=-1;
    for(var i=0;i<raw.length;i++) {
      crc^=raw.charCodeAt(i);
      for(var k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
    }
    return (crc^-1)>>>0;
  };
  api.parse=function(raw) {
    if(typeof raw!=="string" || raw.length>16384) throw new Error("Invalid A-GPS size");
    var start=raw.indexOf("\xBA\xCE"), frames=[], gps=0;
    if(start<0 || start>512 || (start>0 && raw.indexOf("AGNSS data from CASIC.")!==0)) throw new Error("Not a CASIC file");
    for(var i=start;i<raw.length;) {
      if(i+10>raw.length || raw.substr(i,2)!=="\xBA\xCE") throw new Error("Truncated CASIC frame");
      var length=u16(raw,i+2), cls=raw.charCodeAt(i+4), id=raw.charCodeAt(i+5);
      if(cls!==8 || !((id===7 && length===72)||(id===6 && length===16)||(id===5 && length===20))) throw new Error("Unsupported A-GPS message");
      if(i+length+10>raw.length || frames.length>=64) throw new Error("Invalid CASIC length");
      var sum=0;
      for(var k=i+2;k<i+6+length;k+=4) sum=(sum+u32(raw,k))>>>0;
      if(sum!==u32(raw,i+6+length)) throw new Error("Bad CASIC checksum");
      var f={offset:i,length:length+10,id:id};
      if(id===7) {
        f.week=u16(raw,i+56); f.tow=u16(raw,i+54)*16;
        f.sv=raw.charCodeAt(i+74); f.valid=raw.charCodeAt(i+75)===3 && raw.charCodeAt(i+73)===0;
        if(f.sv<1 || f.sv>32 || f.tow>=604800) throw new Error("Invalid GPS ephemeris");
        gps++;
      }
      frames.push(f); i+=f.length;
    }
    if(!gps) throw new Error("No GPS ephemeris");
    return frames;
  };
  api.select=function(raw,now) {
    var frames=api.parse(raw), result=[], sats={}, extras=[], currentWeek=(now+leapMS-epoch)/weekMS;
    if(!clock(now)) return {frames:[],satellites:0};
    frames.forEach(function(f) {
      if(f.id!==7) { extras.push(f); return; }
      // Some CASIC files carry a 10-bit week despite the U2 field. Resolve
      // rollover relative to the current clock, never relative to download time.
      var week=f.week;
      if(week<1024) week+=1024*Math.round((currentWeek-week)/1024);
      var reference=epoch+week*weekMS+f.tow*1000-leapMS;
      if(f.valid && Math.abs(now-reference)<=7200000) {
        var old=sats[f.sv];
        if(!old || Math.abs(now-reference)<old.age) sats[f.sv]={frame:f,age:Math.abs(now-reference)};
      }
    });
    Object.keys(sats).forEach(function(k) { result.push(sats[k].frame); });
    var count=result.length;
    // Ionospheric/UTC frames have no epoch; only accompany fresh ephemerides.
    if(count>=4) result=result.concat(extras);
    else result=[];
    return {frames:result,satellites:count};
  };
  api.cacheValid=function(cache,now) {
    return cache && cache.version===1 && clock(now) && finite(cache.downloaded) &&
      now>=cache.downloaded && now-cache.downloaded<14400000 && typeof cache.data==="string" && cache.data.length<=22000;
  };
  api.initial=function(seed,now) {
    if(!api.seedValid(seed,now)) return undefined;
    var bytes=new Uint8Array(66), dv=new DataView(bytes.buffer);
    bytes.set([186,206,56,0,11,1]);
    dv.setFloat64(6,seed.lat,true); dv.setFloat64(14,seed.lon,true);
    // Altitude is deliberately marked invalid: a GPS fix reports MSL height,
    // whereas AID-INI LLA uses ellipsoid height.
    dv.setFloat64(22,0,true);
    var gpsMS=now+leapMS-epoch, week=Math.floor(gpsMS/weekMS);
    dv.setFloat64(30,(gpsMS-week*weekMS)/1000,true);
    dv.setFloat32(42,now-seed.at<60000?Math.max(1000,seed.accuracy||1000):100000,true);
    // Conservative time uncertainty; this is acquisition assistance, not PPS.
    dv.setFloat32(46,60,true); dv.setUint16(58,week,true);
    bytes[60]=0; bytes[61]=0x63; // LLA, position/time valid, height invalid
    var sum=0;
    for(var i=2;i<62;i+=4) sum=(sum+dv.getUint32(i,true))>>>0;
    dv.setUint32(62,sum,true);
    return bytes;
  };
  return api;
})();
if(typeof exports!=="undefined") Object.keys(pawlAid).forEach(function(k) { exports[k]=pawlAid[k]; });
