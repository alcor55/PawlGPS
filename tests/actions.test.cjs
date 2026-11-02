const {test}=require('node:test');
const assert=require('node:assert/strict');
const actions=require('../actions.js');
const create=require('../gps.js').create;
function sample(overrides={}) {
  return {fixAt:1000,fix:{fix:1,lat:0,lon:0,alt:123.4,time:new Date('2026-11-02T12:34:56Z'),...overrides}};
}
test('saves acquisition aid with real GPS epoch, never writes Waypoints',()=>{
  const writes=[];
  const storage={writeJSON:(name,value)=>writes.push({name,value})};
  actions.saveAid(sample(),1500,storage);
  assert.deepEqual(writes,[{name:'pawlgps.aid.json',value:{lat:0,lon:0,at:Date.parse('2026-11-02T12:34:56Z'),source:'gps',accuracy:1000}}]);
});
test('invalid, stale, future-dated and undated fixes cannot save acquisition aid',()=>{
  const storage={writeJSON:()=>assert.fail('Must not write')};
  for(const f of [{fix:0},{lat:NaN},{lon:Infinity},{lat:91},{lon:-181},{lat:'0'},{time:undefined}]) {
    assert.throws(()=>actions.saveAid(sample(f),2000,storage),/GPS fix/);
  }
  for(const now of [6000,999]) assert.throws(()=>actions.saveAid(sample(),now,storage),/GPS fix/);
  assert.throws(()=>actions.saveAid(sample(),2000,{writeJSON:()=>{throw new Error('Full');}}),/Full/);
  assert.throws(()=>actions.saveAid(sample(),2000,{writeJSON:()=>false}),/Unable to save/);
});
test('GPS UTC sets epoch seconds, including elapsed reception time',()=>{
  let result;
  actions.syncTime(sample(),2500,t=>{result=t;});
  assert.equal(result,new Date('2026-11-02T12:34:56Z').getTime()/1000+1.5);
  for(const time of [undefined,new Date(NaN),new Date('1999-12-31'),new Date('2100-01-01')]) {
    assert.throws(()=>actions.syncTime(sample({time}),2000,()=>assert.fail()),/UTC time/);
  }
});
test('clock jumps preserve data ages, staleness, TTFF and session timing',()=>{
  let now=1000; const s=create(()=>now);
  s.update(sample().fix);
  s.feed('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,');
  s.feed('$GPGSV,1,1,01,08,40,010,42');
  s.feed('$GPGSA,A,3,08,,,,,,,,,,,,1.2,0.8,0.9');
  now+=2000;
  for(const delta of [100000000000,-200000000000]) {
    now+=delta; s.shiftTime(delta);
    assert.equal(now-s.fixAt,2000); assert.equal(now-s.started,2000);
    assert.equal(actions.validFix(s,now),true); assert.equal(s.ttff,0);
    assert.equal(s.satellites()[0].used,true); assert.equal(s.value('Geoid m'),46.9);
    assert.equal(now-s.raw[0].at,2000);
  }
  now+=14000;
  assert.equal(s.value('Geoid m'),undefined); assert.equal(s.satellites().length,0);
});
