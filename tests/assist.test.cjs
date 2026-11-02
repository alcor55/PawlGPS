const {test}=require('node:test');
const assert=require('node:assert/strict');
const aid=require('../assist.js');
const fixture=require('./aid-fixture.cjs');
test('CASIC frames validate and the GPS week rollover is resolved against current time',()=>{
  for(const rollover of [true,false]) {
    const raw=fixture.raw(fixture.now,8,rollover);
    assert.equal(aid.parse(raw).length,9);
    assert.equal(aid.select(raw,fixture.now).satellites,8);
    assert.equal(aid.select(raw,fixture.now+3*3600000).frames.length,0);
  }
});
test('a fresh download cannot make old ephemerides valid',()=>{
  const stale=fixture.raw(fixture.now-24*3600000);
  const cache={version:1,downloaded:fixture.now,data:Buffer.from(stale,'latin1').toString('base64')};
  assert.equal(aid.cacheValid(cache,fixture.now),true);
  assert.equal(aid.select(stale,fixture.now).frames.length,0);
  assert.equal(aid.select(fixture.raw(),fixture.now+7200000).frames.length,0); // quantized toe already aged
  assert.equal(aid.cacheValid(cache,fixture.now-1),false);
  assert.equal(aid.cacheValid(cache,fixture.now+14400000),false);
  assert.equal(aid.select(fixture.raw(),0).frames.length,0);
});
test('corrupt, truncated, oversized and unexpected command packets are refused',()=>{
  const raw=fixture.raw();
  assert.throws(()=>aid.parse(raw.slice(0,-1)),/length|Truncated/);
  const bytes=Buffer.from(raw,'latin1');bytes[50]^=1;
  assert.throws(()=>aid.parse(bytes.toString('latin1')),/checksum/);
  assert.throws(()=>aid.parse('x'.repeat(17000)),/size/);
  assert.throws(()=>aid.parse('not AGPS'),/CASIC/);
  const config=Buffer.from(fixture.packet(7,Buffer.alloc(72)));config[4]=6;
  assert.throws(()=>aid.parse(config.toString('latin1')),/Unsupported/);
  assert.equal(aid.select(fixture.raw(fixture.now,3),fixture.now).frames.length,0);
  assert.equal(aid.crc32('123456789'),0xcbf43926);
});
test('AID-INI uses current GPS time, conservative accuracy and an invalid altitude flag',()=>{
  const seed={lat:45.4,lon:9.1,at:fixture.now-3600000,accuracy:1000};
  const frame=Buffer.from(aid.initial(seed,fixture.now));
  assert.equal(frame.length,66);assert.equal(frame.readDoubleLE(6),45.4);assert.equal(frame.readDoubleLE(14),9.1);
  assert.equal(frame[61],0x63);assert.equal(frame.readFloatLE(42),100000);assert.equal(frame.readFloatLE(46),60);
  assert.equal(frame.readUInt16LE(58),Math.floor((fixture.now+18000-315964800000)/604800000));
  assert.ok(Math.abs(frame.readDoubleLE(30)-((fixture.now+18000-315964800000)%604800000)/1000)<0.001);
  let sum=0;for(let i=2;i<62;i+=4) sum=(sum+frame.readUInt32LE(i))>>>0;
  assert.equal(frame.readUInt32LE(62),sum);
  assert.equal(aid.initial(seed,seed.at-1),undefined);
  assert.equal(aid.initial(seed,seed.at+86400000),undefined);
  assert.equal(aid.initial({...seed,lat:91},fixture.now),undefined);
  assert.equal(aid.initial({...seed,accuracy:Infinity},fixture.now),undefined);
});
