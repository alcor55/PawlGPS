/* eslint-env node */
// Run against the official EspruinoWebIDE emulator files supplied in ESPRUINO_EMU_DIR.
// See README.md for setup. No hardware or account access is used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const dir = process.env.ESPRUINO_EMU_DIR;
if (!dir) throw new Error('Set ESPRUINO_EMU_DIR to the downloaded emulator directory');
const root = path.resolve(__dirname, '..');
let received = '';
const context = vm.createContext({ require, process, Buffer, console, __dirname: dir, __filename,
  module: { exports: {} }, setTimeout, clearTimeout, setInterval, clearInterval,
  onConsoleOutput: () => {}, jsUpdateGfx: () => {} });
for (const file of ['emulator_banglejs2.js', 'emu_banglejs2.js', 'common.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, { filename: file });
}
context.jsRXCallback = ch => { received += String.fromCharCode(ch); };
function send(js) {
  received = '';
  context.jsTransmitString('\x10' + js + '\n');
  context.jsIdle();
  if (/Uncaught|ERROR|Execution Interrupted/.test(received)) throw new Error(received);
  return received;
}
function value(expression) {
  const output = send(`print('RESULT:'+JSON.stringify(${expression}))`);
  const match = output.match(/RESULT:(.*)\r?\n/);
  assert.ok(match, output);
  return JSON.parse(match[1]);
}
function upload(name, contents) {
  for (let offset = 0; offset < contents.length; offset += 512) {
    send(`require('Storage').write(${JSON.stringify(name)},${JSON.stringify(contents.slice(offset, offset + 512))},${offset},${contents.length})`);
  }
}
function advance(ms) {
  send(`for(let timer of global['\\xff'].timers) if(timer) timer.time-=${ms * 1000}`);
  context.jsIdle();
}
function check(expression) { assert.equal(value(`!!(${expression})`), true, expression); }
function framebuffer() {
  const pixels = new Uint8Array(176 * 176 * 4);
  context.jsGetGfxContents(pixels);
  return Buffer.from(pixels);
}
function screenshot(filename) {
  const pixels = framebuffer();
  const scanlines = Buffer.alloc(176 * (176 * 4 + 1));
  for (let y = 0; y < 176; y++) Buffer.from(pixels.buffer, y * 176 * 4, 176 * 4).copy(scanlines, y * (176 * 4 + 1) + 1);
  function crc32(buffer) {
    let crc = -1;
    for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    return (crc ^ -1) >>> 0;
  }
  function chunk(type, data) {
    const payload = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(payload));
    return Buffer.concat([length, payload, crc]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(176); header.writeUInt32BE(176, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(filename, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]));
}
setTimeout(() => {
  try {
    context.jsInit(); context.jsIdle();
    console.log('Firmware:', value('process.version'));
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
    for (const file of metadata.storage.filter(f => !f.evaluate)) upload(file.name, fs.readFileSync(path.join(root, file.url), 'utf8'));
    const fixture=require('./aid-fixture.cjs');
    upload('pawlgps.test',Buffer.from(fixture.raw(),'latin1').toString('base64'));
    check(`require('pawlgpsaid').select(atob(require('Storage').read('pawlgps.test')),${fixture.now}).satellites===8`);
    check(`require('pawlgpsaid').initial({lat:45,lon:9,at:${fixture.now}},${fixture.now}).length===66`);
    check("require('pawlgpsaid').crc32('123456789')===3421780262");
    send("global.calls=[]; global.nativePower=Bangle.setGPSPower; Bangle.setGPSPower=function(on,id){calls.push([on,id]); return nativePower.call(Bangle,on,id)}; global.baseline=global['\\xff'].timers.filter(t=>t).length");
    send("global.realDateNow=Date.now; global.actionNow=Date.now(); Date.now=function(){return actionNow}; Bangle.setGPSPower(1,'other'); eval(require('Storage').read('pawlgps.app.js')); Bangle.setLocked(false)");
    send("Bangle.emit('GPS',{fix:1,lat:45.4642,lon:9.19,alt:122.4,speed:3.6,course:135,time:new Date('2026-11-02T12:34:56Z'),satellites:5,hdop:0.9})");
    function emit(body) {
      let checksum=0; for(const c of body) checksum^=c.charCodeAt(0);
      const line='$'+body+'*'+checksum.toString(16).padStart(2,'0');
      send(`Bangle.emit('GPS-raw',${JSON.stringify(line)},false)`);
    }
    emit('GPGSV,2,1,05,01,70,010,42,03,40,090,35,08,25,180,28,14,50,270,38');
    emit('GPGSV,2,2,05,22,10,330,');
    emit('GPGSA,A,3,01,03,14,,,,,,,,,,1.2,0.9,0.8');
    emit('GPTXT,01,01,02,IC=AT6558R');
    check("(function(){var s=require('pawlgps').create(); s.feed('$GPGSV,1,1,01,08,70,010,42');var sat=s.satellites()[0];return sat.id===8 && sat.az===10})()");
    send('Bangle.uiRedraw()'); screenshot(path.join(root,'screenshots/fix.png'));
    for(let i=0;i<3;i++) send("Bangle.emit('swipe',-1,0)");
    screenshot(path.join(root,'screenshots/skyplot.png'));
    send("Bangle.emit('swipe',-1,0); Bangle.emit('swipe',-1,0)"); screenshot(path.join(dir,'pawlgps-receiver.png'));
    send("Bangle.emit('swipe',1,0); Bangle.emit('swipe',1,0)");
    for(let i=0;i<5;i++) { send("Bangle.emit('swipe',-1,0); Bangle.emit('swipe',0,-1); Bangle.emit('swipe',0,1)"); }
    screenshot(path.join(root,'screenshots/actions.png'));
    // Model persistent RTC jumps (jsIdle reanchors native emulator time).
    send("require('Storage').writeJSON('waypoints.json',[{name:'Home',lat:1,lon:2}]); global.realSync=require('pawlgpsact').syncTime; global.clockArgs=[]; require('pawlgpsact').syncTime=function(state,now){return realSync(state,now,function(t){clockArgs.push(t);actionNow=t*1000})}; global.savedDrawString=g.drawString; global.text=[]; g.drawString=function(t){text.push(t);if(text.length>100)text.shift();return savedDrawString.apply(g,arguments)}");
    send("Bangle.emit('touch',1,{x:88,y:Bangle.appRect.y+65})");
    check("require('Storage').readJSON('pawlgps.aid.json').source==='gps' && require('Storage').readJSON('waypoints.json')[0].name==='Home'");
    check("text.indexOf('Initial GPS aid saved')>=0");
    send("actionNow+=1000; Bangle.emit('touch',1,{x:88,y:Bangle.appRect.y+100})");
    check("clockArgs.length===1 && text.indexOf('GPS date/time applied')>=0");
    check("Math.abs(Date.now()-Date.parse('2026-11-02T12:34:57Z'))<1000");
    send("actionNow+=10000; Bangle.emit('touch',1,{x:88,y:Bangle.appRect.y+65})");
    check("text.indexOf('Need a fresh GPS fix')>=0");
    send("g.drawString=savedDrawString; require('pawlgpsact').syncTime=realSync");
    send("Bangle.setLCDPower(false)");
    check("global['\\xff'].timers.filter(t=>t).length===baseline");
    send("Bangle.setLCDPower(true); Bangle.setUI()");
    check("global['\\xff'].timers.filter(t=>t).length===baseline");

    check("calls[calls.length-1][0]===0 && calls[calls.length-1][1]==='pawlgps'");
    for(let i=0;i<3;i++) send("eval(require('Storage').read('pawlgps.app.js')); Bangle.setUI()");
    check("global['\\xff'].timers.filter(t=>t).length===baseline");
    send("global.menu; E.showMenu=function(m){menu=m}; eval(require('Storage').read('pawlgps.settings.js'))(function(){}); menu.Refresh.onchange(2); menu['Sky labels'].onchange(false)");
    check("require('Storage').readJSON('pawlgps.json').refresh===5 && require('Storage').readJSON('pawlgps.json').labels===false");
    send("global.commands=[]; Serial1.println=function(c){commands.push(c)}; menu['Extra NMEA'].onchange(true); eval(require('Storage').read('pawlgps.app.js'))");
    advance(1300);
    check("commands.length===1 && commands[0].indexOf('$PCAS03,1,1,1,1,1,1,1,0*')===0");
    send("Bangle.setUI()");
    check("global['\\xff'].timers.filter(t=>t).length===baseline");
    // Removing the app before the command delay must also cancel that timeout.
    send("eval(require('Storage').read('pawlgps.app.js')); Bangle.setUI()");
    advance(1500);
    check("commands.length===1 && global['\\xff'].timers.filter(t=>t).length===baseline");
    // Exercise the real runtime in Espruino with explicit simulated GPS/UART.
    send(`actionNow=${fixture.now}; require('Storage').writeJSON('pawlgps.agps.json',{version:1,downloaded:actionNow,data:require('Storage').read('pawlgps.test')}); require('Storage').writeJSON('pawlgps.aid.json',{lat:45,lon:9,at:actionNow,accuracy:1000}); global.mockOwners=[]; global.mockWrites=[]; global.mockGPS={isGPSOn:function(){return mockOwners.length>0},setGPSPower:function(on,id){var i=mockOwners.indexOf(id);if(on && i<0)mockOwners.push(id);if(!on && i>=0)mockOwners.splice(i,1);return mockOwners.length>0}}; global.mockAid=require('pawlgpsrun').create({Bangle:mockGPS,storage:require('Storage'),aid:require('pawlgpsaid'),serial:{write:function(d){mockWrites.push(d)}},now:Date.now,decode:atob,setTimeout:setTimeout,clearTimeout:clearTimeout}); mockGPS.setGPSPower(1,'navigation')`);
    advance(1600);
    for(let i=0;i<13;i++) advance(200);
    check("mockWrites.length===10 && mockAid.status().last.state==='sent-unconfirmed' && mockOwners.length===1 && mockOwners[0]==='navigation'");
    send("mockAid.dispose()");
    check("global['\\xff'].timers.filter(t=>t).length===baseline");
    // Exercise the on-watch staged import, rather than only browser mocks.
    send("require('Storage').write('pawlgps.agps.tmp',atob(require('Storage').read('pawlgps.test'))); global.imported=require('pawlgpsrun').importCache({downloaded:Date.now(),size:require('Storage').read('pawlgps.agps.tmp').length,crc:require('pawlgpsaid').crc32(require('Storage').read('pawlgps.agps.tmp'))})");
    check("imported.cache==='valid' && imported.satellites===8 && require('Storage').read('pawlgps.agps.tmp')===undefined");
    send("Bangle.pawlgpsAid.dispose(); Date.now=realDateNow");
    check("global['\\xff'].timers.filter(t=>t).length===baseline");
    const icon=fs.readFileSync(path.join(root,'icon.js'),'utf8');
    send(`g.clear(); g.setColor(0,0,0).drawImage(${icon},64,64)`);
    screenshot(path.join(dir,'pawlgps-icon.png'));
    console.log('Emulator checks passed: CASIC codec, cache import, paced runtime replay, app actions, UTC clock, sleep/wake, cleanup, settings and icon.');
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { context.jsStopIdle(); }
},0);
