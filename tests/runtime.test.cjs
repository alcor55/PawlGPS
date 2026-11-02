const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const aid=require('../assist.js'), runtime=require('../runtime.js'), fixture=require('./aid-fixture.cjs');
function harness() {
  let now=fixture.now, next=0;
  const files={}, timers=new Map(), owners=new Set(), calls=[], writes=[];
  const B={isGPSOn:()=>owners.size>0,setGPSPower:function(on,id){calls.push([on,id]);if(on)owners.add(id);else owners.delete(id);return owners.size>0;}};
  const S={readJSON:(n)=>files[n]===undefined?undefined:JSON.parse(files[n]),writeJSON:(n,v)=>{files[n]=JSON.stringify(v);},read:n=>files[n],erase:n=>{delete files[n];}};
  const env={Bangle:B,storage:S,aid,serial:{write:d=>writes.push(d)},now:()=>now,
    decode:s=>Buffer.from(s,'base64').toString('latin1'),setTimeout:(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next;},clearTimeout:id=>timers.delete(id)};
  function advance(ms) {
    const end=now+ms;
    while(true) {
      const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
      if(!entry || entry[1].at>end)break;
      now=entry[1].at;timers.delete(entry[0]);entry[1].fn();
    }
    now=end;
  }
  return {env,B,S,files,timers,owners,calls,writes,advance,now:()=>now};
}
function seed(h) { h.S.writeJSON('pawlgps.aid.json',{lat:45,lon:9,at:fixture.now,accuracy:1000}); }
function cache(h,raw=fixture.raw()) { h.S.writeJSON('pawlgps.agps.json',{version:1,downloaded:fixture.now,data:Buffer.from(raw,'latin1').toString('base64')}); }
test('any GPS app triggers one paced replay and keeps its own sensor lease',()=>{
  const h=harness();seed(h);cache(h);
  const ctl=runtime.create(h.env);
  assert.equal(h.B.setGPSPower(1,'navigator'),true);h.advance(1600);
  assert.equal(h.writes.length,1);assert.equal(h.owners.has('pawlgpsaid'),true);
  h.B.setGPSPower(1,'recorder');h.advance(5000);
  assert.equal(h.writes.length,10);assert.equal(ctl.status().last.state,'sent-unconfirmed');
  assert.deepEqual([...h.owners].sort(),['navigator','recorder']);
  h.B.setGPSPower(0,'navigator');h.B.setGPSPower(0,'recorder');
  h.B.setGPSPower(1,'another-app');h.advance(6000);assert.equal(h.writes.length,20);
  ctl.dispose();assert.equal(h.timers.size,0);
});
test('official updaters take precedence before or during a replay',()=>{
  for(const delay of [0,1700]) {
    const h=harness();seed(h);cache(h);const ctl=runtime.create(h.env);
    h.B.setGPSPower(1,'navigator');h.advance(delay);
    h.B.setGPSPower(1,'agps');const sent=h.writes.length;h.advance(10000);
    assert.equal(h.writes.length,sent);assert.equal(ctl.status().last.state,'external-updater');
    h.B.setGPSPower(0,'agps');assert.throws(()=>{h.B.setGPSPower(1,'agpsdata');ctl.apply();},/updater/);
    h.B.setGPSPower(0,'agpsdata');h.B.setGPSPower(0,'navigator');
    h.B.setGPSPower(1,'navigator');h.advance(6000);assert.ok(h.writes.length>sent);
    ctl.dispose();
  }
});
test('missing, expired, corrupt caches and disabled auto mode do not transmit',()=>{
  for(const mode of ['missing','expired','corrupt','disabled']) {
    const h=harness();
    if(mode==='expired') cache(h,fixture.raw(fixture.now-86400000));
    if(mode==='corrupt') h.S.writeJSON('pawlgps.agps.json',{version:1,downloaded:fixture.now,data:'bad'});
    if(mode==='disabled') {seed(h);cache(h);h.S.writeJSON('pawlgps.json',{autoAid:false});}
    const ctl=runtime.create(h.env);h.B.setGPSPower(1,'app');h.advance(10000);
    assert.equal(h.writes.length,0);assert.equal(h.timers.size,0);assert.deepEqual([...h.owners],['app']);
    if(mode==='disabled') {ctl.apply();h.advance(6000);assert.ok(h.writes.length>0);}
    ctl.dispose();
  }
});
test('serial failures release the aid lease and preserve other owners; later wrappers survive dispose',()=>{
  const h=harness();seed(h);h.env.serial.write=()=>{throw new Error('UART');};
  const base=h.B.setGPSPower,ctl=runtime.create(h.env), wrapped=h.B.setGPSPower;
  h.B.setGPSPower(1,'app');h.advance(3000);
  assert.equal(ctl.status().last.state,'error');assert.deepEqual([...h.owners],['app']);
  const later=function(){return wrapped.apply(this,arguments);};h.B.setGPSPower=later;ctl.dispose();
  assert.equal(h.B.setGPSPower,later);assert.notEqual(later,base);
  h.B.setGPSPower(0,'app');h.B.setGPSPower(1,'new-app');assert.equal(h.timers.size,0);
});
test('manual replay turns GPS off when no other app needs it; removing before startup cancels the timer',()=>{
  const h=harness();seed(h);let ctl=runtime.create(h.env);
  ctl.apply();h.advance(4000);assert.equal(h.owners.size,0);assert.equal(h.timers.size,0);
  ctl.dispose();ctl=runtime.create(h.env);ctl.apply();ctl.dispose();h.advance(10000);
  assert.equal(h.owners.size,0);assert.equal(h.timers.size,0);assert.equal(h.writes.length,1);
});
test('loader import preserves the old cache on interrupted, stale or corrupt uploads',()=>{
  const h=harness();cache(h);const old=h.files['pawlgps.agps.json'];
  const context={exports:{},require:n=>n==='Storage'?h.S:n==='pawlgpsaid'?aid:undefined,
    Date:{now:h.now},btoa:s=>Buffer.from(s,'latin1').toString('base64')};
  vm.runInNewContext(fs.readFileSync(require.resolve('../runtime.js'),'utf8'),context);
  context.exports.install=()=>({apply:()=>({state:'waiting'})});
  for(const raw of [fixture.raw().slice(0,-1),fixture.raw(fixture.now-86400000),'corrupt']) {
    h.files['pawlgps.agps.tmp']=raw;
    assert.throws(()=>context.exports.importCache({downloaded:h.now(),size:raw.length,crc:aid.crc32(raw)}));
    assert.equal(h.files['pawlgps.agps.json'],old);
  }
  const raw=fixture.raw();h.files['pawlgps.agps.tmp']=raw;
  assert.throws(()=>context.exports.importCache({downloaded:h.now(),size:raw.length,crc:0}),/Incomplete/);
  context.exports.importCache({downloaded:h.now(),size:raw.length,crc:aid.crc32(raw),position:{lat:45,lon:9,accuracy:30}});
  assert.equal(h.S.readJSON('pawlgps.aid.json').source,'browser');
  assert.equal(h.files['pawlgps.agps.tmp'],undefined);assert.equal(aid.cacheValid(h.S.readJSON('pawlgps.agps.json'),h.now()),true);
});
