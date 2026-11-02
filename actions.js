/* User-triggered GPS actions. Shared waypoints belong to the Waypoints app. */
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
exports.saveFix = function(state, now, waypoints) {
  if(!exports.validFix(state,now)) throw new Error("Need a fresh GPS fix");
  // load() deliberately throws for malformed JSON: never overwrite damaged data.
  var list=waypoints.load();
  if(!Array.isArray(list)) throw new Error("Invalid waypoint file");
  var index=1, name;
  do {
    name="PG"+(index<1000 ? ("000"+index).slice(-3) : index);
    index++;
  } while(list.some(function(w) { return w && w.name===name; }));
  var fix=state.fix, point={name:name,lat:fix.lat,lon:fix.lon};
  if(typeof fix.alt==="number" && isFinite(fix.alt)) point.alt=fix.alt;
  if(exports.validTime(state,now)) point.time=fix.time.toISOString();
  list.push(point);
  waypoints.save(list);
  return name;
};
exports.syncTime = function(state, now, setClock) {
  if(!exports.validTime(state,now)) throw new Error("Need GPS fix and UTC time");
  // Account for time elapsed since reception. setTime takes UTC epoch seconds.
  setClock((state.fix.time.getTime()+now-state.fixAt)/1000);
};
