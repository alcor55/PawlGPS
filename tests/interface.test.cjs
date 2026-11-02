const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const aid=require('../assist.js'),fixture=require('./aid-fixture.cjs');
function browser(options={}) {
  const elements={},timers=new Map(),uploads=[],imports=[],evaluations=[];let serial=0;
  for(const id of ['update','refresh','message','status','location']) elements[id]={disabled:true,checked:true,textContent:'',addEventListener(type,fn){this[type]=fn;}};
  const state={seed:'missing',cache:'valid',satellites:8,last:{state:'sent-unconfirmed',at:fixture.now,bytes:682},busy:false};
  const raw=options.raw || fixture.raw();
  const runtime={install:()=>({status:()=>state}),importCache:meta=>{imports.push(meta);assert.equal(meta.size,raw.length);assert.equal(meta.crc,aid.crc32(raw));return state;}};
  const context={document:{getElementById:id=>elements[id]},navigator:{geolocation:{getCurrentPosition(ok,fail){if(options.noPosition)fail();else ok({coords:{latitude:45,longitude:9,accuracy:30}});}}},
    pawlAid:aid,Date:class extends Date {static now(){return fixture.now;}},Promise,AbortController,
    atob:s=>Buffer.from(s,'base64').toString('latin1'),setTimeout(fn,ms){const id=++serial;if(ms===1000)queueMicrotask(fn);else timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url)=>{assert.equal(url,'https://www.espruino.com/agps/casic.base64');if(options.offline)throw new Error('offline');return {ok:true,text:async()=>Buffer.from(raw,'latin1').toString('base64')};},
    Util:{writeStorage(name,data,cb){uploads.push({name,data});cb(options.failedUpload?false:true);}},
    Puck:{eval(expression,cb){evaluations.push(expression);cb(vm.runInNewContext(expression,{require:()=>runtime}));}}};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../interface-client.js'),'utf8'),context);
  return {context,elements,uploads,imports,evaluations,timers};
}
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
test('loader downloads official data, requests optional location and stages a verified import',async()=>{
  const b=browser();b.context.onInit({id:'BANGLEJS2'});await flush();
  assert.equal(b.elements.update.disabled,false);b.elements.update.click();await flush();
  assert.equal(b.uploads[0].name,'pawlgps.agps.tmp');assert.equal(b.imports.length,1);
  assert.equal(b.imports[0].position.lat,45);assert.equal(b.elements.update.disabled,false);
  assert.match(b.elements.message.textContent,/accettazione non confermata/);assert.equal(b.timers.size,0);
});
test('denied location still permits A-GPS import without inventing a position',async()=>{
  const b=browser({noPosition:true});b.context.onInit({id:'BANGLEJS2'});await flush();b.elements.update.click();await flush();
  assert.equal(b.imports.length,1);assert.equal(b.imports[0].position,undefined);
});
test('offline, expired server data and failed uploads never commit a replacement cache',async()=>{
  for(const options of [{offline:true},{raw:fixture.raw(fixture.now-86400000)},{failedUpload:true}]) {
    const b=browser(options);b.context.onInit({id:'BANGLEJS2'});await flush();b.elements.update.click();await flush();
    assert.equal(b.imports.length,0);assert.equal(b.elements.update.disabled,false);assert.equal(b.timers.size,0);
  }
});
test('unsupported devices remain disabled without sending commands',()=>{
  const b=browser();b.context.onInit({id:'BANGLEJS'});
  assert.equal(b.evaluations.length,0);assert.equal(b.elements.update.disabled,true);
});
