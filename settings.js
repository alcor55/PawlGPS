(function(back) {
  var storage=require("Storage"), s=storage.readJSON("pawlgps.json",1)||{};
  var intervals=[1,2,5];
  E.showMenu({
    "":{title:"Pawl GPS"}, "< Back":back,
    "Refresh":{value:Math.max(0,intervals.indexOf(s.refresh||1)),min:0,max:2,
      format:function(v){return intervals[v]+" s";},onchange:function(v){s.refresh=intervals[v];storage.writeJSON("pawlgps.json",s);}},
    "Sky labels":{value:s.labels!==false,onchange:function(v){s.labels=v;storage.writeJSON("pawlgps.json",s);}},
    "Extra NMEA":{value:s.details===true,onchange:function(v){s.details=v;storage.writeJSON("pawlgps.json",s);}}
  });
})
