const epoch=315964800000, weekMS=604800000, now=Date.parse('2026-11-02T16:00:00Z');
function packet(id,payload) {
  const b=Buffer.alloc(payload.length+10);
  b.set([186,206,payload.length,0,8,id]); b.set(payload,6);
  let sum=0;for(let i=2;i<b.length-4;i+=4) sum=(sum+b.readUInt32LE(i))>>>0;
  b.writeUInt32LE(sum,b.length-4);return b;
}
function raw(at=now,count=8,rollover=true) {
  const week=Math.floor((at+18000-epoch)/weekMS), tow=Math.floor(((at+18000-epoch)%weekMS)/16000);
  const frames=[];
  for(let sv=1;sv<=count;sv++) {
    const p=Buffer.alloc(72);p.writeUInt16LE(tow,48);p.writeUInt16LE(rollover?week%1024:week,50);p[68]=sv;p[69]=3;
    frames.push(packet(7,p));
  }
  const ion=Buffer.alloc(16);ion[12]=3;frames.push(packet(6,ion));
  return Buffer.concat([Buffer.from('AGNSS data from CASIC.\n'),...frames]).toString('latin1');
}
module.exports={raw,packet,now};
