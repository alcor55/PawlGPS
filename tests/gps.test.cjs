const {test}=require('node:test');
const assert=require('node:assert/strict');
const create=require('../gps.js').create;
function nmea(body) {
  let sum=0; for(const c of body) sum^=c.charCodeAt(0);
  return '$'+body+'*'+sum.toString(16).padStart(2,'0');
}
test('checksums, empty values, fix timing and stale accuracy',()=>{
  let time=1000; const s=create(()=>time);
  s.feed(nmea('GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,'));
  assert.equal(s.value('Geoid m'),46.9);
  assert.equal(s.value('DGPS age s'),undefined);
  s.feed('$GPGGA,invalid*00',true);
  assert.equal(s.bad,1); assert.equal(s.lost,1);
  time+=5000; s.update({fix:0}); assert.equal(s.ttff,undefined);
  s.update({fix:1}); assert.equal(s.ttff,5);
  time+=16000; assert.equal(s.value('Geoid m'),undefined);
});
test('multipart skyplot never mixes cycles and expires satellites',()=>{
  let time=1000; const s=create(()=>time);
  const first=nmea('GPGSV,2,1,05,01,90,000,40,02,00,090,,03,45,180,30,04,20,270,20');
  s.feed(first); assert.equal(s.satellites().length,0);
  s.feed(nmea('GPGSV,2,2,05,05,15,300,12'));
  assert.equal(s.satellites().length,5);
  assert.equal(s.satellites()[1].snr,undefined);
  s.feed(nmea('GPGSA,A,3,01,03,,,,,,,,,,,1.2,0.8,0.9'));
  assert.equal(s.satellites()[0].used,true);
  s.feed(first); assert.equal(s.satellites().length,0);
  s.feed(nmea('GPGSV,2,2,01,06,10,015,10'));
  assert.equal(s.satellites().length,5);
  time+=16000; assert.equal(s.satellites().length,0);
});
test('constellation IDs, NMEA 4 signal suffix and system-specific GSA',()=>{
  const s=create();
  s.feed(nmea('GLGSV,1,1,01,65,45,100,32,1'));
  s.feed(nmea('GLGSV,1,1,01,65,45,100,38,2'));
  s.feed(nmea('GNGSA,A,3,01,,,,,,,,,,,,1.2,0.8,0.9,2'));
  const sats=s.satellites();
  assert.equal(sats.length,1); assert.equal(sats[0].key,'GL1');
  assert.equal(sats[0].used,true); assert.equal(sats[0].snr,38);
});
test('raw and receiver diagnostics remain bounded under a long stream',()=>{
  const s=create();
  for(let i=0;i<1000;i++) s.feed(nmea('GPTXT,01,01,02,K'+i+'=test'));
  assert.equal(s.raw.length,32); assert.equal(s.info.length,10);
  s.feed('\xba\xca\x00'); assert.equal(s.binary,1);
});
test('a GSA with no satellites still reports known use for its constellation',()=>{
  const s=create();
  s.feed(nmea('GPGSV,1,1,01,08,00,010,00'));
  s.feed(nmea('GPGSA,A,1,,,,,,,,,,,,,99.9,99.9,99.9'));
  const sat=s.satellites()[0];
  assert.equal(sat.az,10); assert.equal(sat.el,0); assert.equal(sat.snr,0);
  assert.equal(sat.used,false); assert.equal(sat.usedKnown,true);
});
