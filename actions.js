/* User-triggered acquisition assistance and clock actions. */
exports.validFix = function(state, now) {
  var f=state.fix, age=now-state.fixAt;
  return !!(state.fixAt && age>=0 && age<5000 && f.fix>0 &&
    typeof f.lat==="number" && isFinite(f.lat) && Math.abs(f.lat)<=90 &&
    typeof f.lon==="number" && isFinite(f.lon) && Math.abs(f.lon)<=180);
};
exports.validTime = function(state, now) {
  var time=state.fix.time;
  return exports.validFix(state,now) && time && typeof time.getTime==="function" &&
    isFinite(time.getTime()) && time.getTime()>=946684800000 && time.getTime()<4102444800000;
};
exports.saveAid = function(state, now, storage) {
  if(!exports.validTime(state,now)) throw new Error("Need GPS fix and UTC time");
  var fix=state.fix;
  if(storage.writeJSON("pawlgps.aid.json",{lat:fix.lat,lon:fix.lon,at:fix.time.getTime(),source:"gps",accuracy:1000})===false)
    throw new Error("Unable to save GPS aid");
};
exports.syncTime = function(state, now, setClock) {
  if(!exports.validTime(state,now)) throw new Error("Need GPS fix and UTC time");
  // Account for time elapsed since reception. setTime takes UTC epoch seconds.
  setClock((state.fix.time.getTime()+now-state.fixAt)/1000);
};
