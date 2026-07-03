"use strict";
const ALGO_VER=8;
let FILES=null, RIGHTS=new Map(), RIGHTS_STATE={status:"raw",reason:"missing",count:0}, RIGHTS_STAMP="raw", cancelled=false, DB=null;

function zscore(a){
  const n=a.length;let m=0;for(let i=0;i<n;i++)m+=a[i];m/=n;
  let s=0;for(let i=0;i<n;i++){const d=a[i]-m;s+=d*d}
  s=Math.sqrt(s/n)||1;
  const out=new Float64Array(n);
  for(let i=0;i<n;i++)out[i]=(a[i]-m)/s;
  return out;
}
function cosine(a,b){
  let ab=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){ab+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}
  return aa&&bb?ab/Math.sqrt(aa*bb):0;
}
function resample(a,m){
  const n=a.length,out=new Float64Array(m);
  if(n===1){out.fill(a[0]);return out}
  for(let i=0;i<m;i++){
    const t=i*(n-1)/(m-1),j=Math.floor(t),f=t-j;
    out[i]=j+1<n?a[j]*(1-f)+a[j+1]*f:a[j];
  }
  return out;
}
function dtwDist(a,b,w){
  const n=a.length,m=b.length,INF=1e18;
  const prev=new Float64Array(m+1).fill(INF),cur=new Float64Array(m+1);
  prev[0]=0;
  for(let i=1;i<=n;i++){
    cur.fill(INF);
    const lo=Math.max(1,i-w),hi=Math.min(m,i+w);
    for(let j=lo;j<=hi;j++){
      const d=Math.abs(a[i-1]-b[j-1]);
      cur[j]=d+Math.min(prev[j],prev[j-1],cur[j-1]);
    }
    prev.set(cur);
  }
  return prev[m];
}
function zigAmps(closes,th){
  if(!closes||!closes.length)return [];
  const piv=[closes[0]];let dir=0,ext=closes[0];
  for(let i=1;i<closes.length;i++){
    const c=closes[i];
    if(dir===0){if(c>piv[0]*(1+th)){dir=1;ext=c}else if(c<piv[0]*(1-th)){dir=-1;ext=c}}
    else if(dir===1){if(c>ext)ext=c;else if(c<ext*(1-th)){piv.push(ext);dir=-1;ext=c}}
    else{if(c<ext)ext=c;else if(c>ext*(1+th)){piv.push(ext);dir=1;ext=c}}
  }
  piv.push(ext);
  const amps=[];
  for(let i=1;i<piv.length;i++)amps.push(piv[i]/piv[i-1]-1);
  return amps;
}
function zigSim(aAmps,bAmps){
  if(!aAmps.length&&!bAmps.length)return 0.5;
  if(!aAmps.length||!bAmps.length)return 0;
  const m=8,ra=resample(aAmps,m),rb=resample(bAmps,m);
  let sim=cosine(ra,rb);
  const cd=Math.abs(aAmps.length-bAmps.length)/Math.max(aAmps.length,bAmps.length);
  sim*=(1-Math.min(0.5,cd*0.5));
  return Math.max(0,sim);
}
function parseDayBuffer(buf){
  const dv=new DataView(buf),n=Math.floor(buf.byteLength/32);
  const ds=[],os=[],hs=[],ls=[],cs=[],as=[],vs=[];let rejected=0,lastD=0;
  for(let i=0;i<n;i++){
    const p=i*32;
    const d=dv.getUint32(p,true),o=dv.getUint32(p+4,true)/100,h=dv.getUint32(p+8,true)/100;
    const l=dv.getUint32(p+12,true)/100,c=dv.getUint32(p+16,true)/100,a=dv.getFloat32(p+20,true),v=dv.getUint32(p+24,true);
    if(d<19900101||d>29991231||d<=lastD||![o,h,l,c,a,v].every(Number.isFinite)||Math.min(o,h,l,c)<=0||a<0||h<Math.max(o,l,c)||l>Math.min(o,h,c)){rejected++;continue}
    ds.push(d);os.push(o);hs.push(h);ls.push(l);cs.push(c);as.push(a);vs.push(v);lastD=d;
  }
  return {dates:Int32Array.from(ds),opens:Float64Array.from(os),highs:Float64Array.from(hs),lows:Float64Array.from(ls),
    closes:Float64Array.from(cs),amounts:Float64Array.from(as),vols:Float64Array.from(vs),rejected};
}
function resolveRightsState(rights,decodeError){
  if(decodeError)return {status:"error",reason:String(decodeError.message||decodeError),count:0};
  if(rights===null||rights===undefined)return {status:"raw",reason:"missing",count:0};
  let count=0;for(const a of rights.values())count+=a.length;
  return count?{status:"valid",reason:"ok",count}:{status:"error",reason:"未解密到有效权息记录",count:0};
}
function corporateActionFactor(prev,ev){
  const share=1+(ev.bonus||0)/10+(ev.rights||0)/10;
  const price=(prev-(ev.cash||0)/10+(ev.rightsPrice||0)*(ev.rights||0)/10)/(prev*share);
  return {priceFactor:price,volumeFactor:share};
}
function applyCorporateActions(series,events){
  const {dates,opens,highs,lows,closes,vols}=series,factors=new Map();let applied=0;
  for(const ev of events){
    let lo=0,hi=dates.length-1,idx=dates.length;
    while(lo<=hi){const m=(lo+hi)>>1;if(dates[m]>=ev.d){idx=m;hi=m-1}else lo=m+1}
    if(idx<=0||idx>=dates.length)continue;
    const f=corporateActionFactor(closes[idx-1],ev);
    if(Number.isFinite(f.priceFactor)&&f.priceFactor>0.2&&f.priceFactor<1.5&&f.volumeFactor>0){
      const old=factors.get(idx)||{p:1,v:1};old.p*=f.priceFactor;old.v*=f.volumeFactor;factors.set(idx,old);applied++;
    }
  }
  let pf=1,vf=1;
  for(let i=dates.length-1;i>=0;i--){
    const f=factors.get(i+1);if(f){pf*=f.p;vf*=f.v}
    if(pf!==1){closes[i]*=pf;if(opens)opens[i]*=pf;if(highs)highs[i]*=pf;if(lows)lows[i]*=pf}
    // 前复权价格换算到除权后的新股本口径；成交量必须按相同股本倍数放大。
    // 对纯送转事件，调整后的“价格 × 成交量”因此仍与原始成交额口径一致。
    if(vf!==1)vols[i]*=vf;
  }
  return applied;
}
function parseDayQfq(buf,key){
  const p=parseDayBuffer(buf),events=RIGHTS_STATE.status==="valid"?(RIGHTS.get(key.slice(2))||[]):[];
  const applied=applyCorporateActions(p,events),ok=RIGHTS_STATE.status==="valid";
  return {...p,warn:!ok,qStatus:ok?"qfq":"raw",rightsStatus:RIGHTS_STATE.status,rightsReason:RIGHTS_STATE.reason,
    qEvents:applied,nBars:p.dates.length,lastD:p.dates.length?p.dates[p.dates.length-1]:0};
}

function normalizeTimeframe(value){return value==="week"||value==="month"?value:"day"}
function dateOrdinal(d){const s=String(d);return Math.floor(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8))/864e5)}
function periodKey(d,timeframe){
  if(timeframe==="month")return Math.floor(d/100);
  if(timeframe==="week"){
    const s=String(d),dt=new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8)));
    return dateOrdinal(d)-((dt.getUTCDay()+6)%7);
  }
  return d;
}
function aggregateSeries(series,timeframe="day",endD=Infinity){
  timeframe=normalizeTimeframe(timeframe);
  if(timeframe==="day"&&endD===Infinity){if(!series.periods)series.periods=series.dates;return series}
  const dates=[],periods=[],opens=[],highs=[],lows=[],closes=[],amounts=[],vols=[];
  const hasOHLC=!!series.opens,hasAmount=!!series.amounts;
  let key=null,o=0,h=0,l=0,c=0,amt=0,v=0,lastD=0;
  const flush=()=>{
    if(key===null)return;
    dates.push(lastD);periods.push(key);closes.push(c);vols.push(v);
    if(hasOHLC){opens.push(o);highs.push(h);lows.push(l)}
    if(hasAmount)amounts.push(amt);
  };
  for(let i=0;i<series.dates.length;i++){
    const d=series.dates[i];if(d>endD)break;
    const next=periodKey(d,timeframe);
    if(next!==key){flush();key=next;o=hasOHLC?series.opens[i]:0;h=hasOHLC?series.highs[i]:0;l=hasOHLC?series.lows[i]:0;amt=0;v=0}
    if(hasOHLC){h=Math.max(h,series.highs[i]);l=Math.min(l,series.lows[i])}
    c=series.closes[i];amt+=hasAmount?series.amounts[i]:0;v+=series.vols[i];lastD=d;
  }
  flush();
  return {...series,dates:Int32Array.from(dates),periods:Int32Array.from(periods),closes:Float64Array.from(closes),vols:Float64Array.from(vols),
    opens:hasOHLC?Float64Array.from(opens):undefined,highs:hasOHLC?Float64Array.from(highs):undefined,lows:hasOHLC?Float64Array.from(lows):undefined,
    amounts:hasAmount?Float64Array.from(amounts):undefined,nBars:dates.length,lastD:dates.length?dates[dates.length-1]:0,timeframe};
}

function decodeGbbq(buf,keyB64){
  const bin=atob(keyB64),kb=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)kb[i]=bin.charCodeAt(i);
  const kd=new DataView(kb.buffer),src=new Uint8Array(buf),dv=new DataView(buf);
  const count=Math.min(dv.getUint32(0,true),Math.floor((src.length-4)/29)),out=new Map();
  let off=4;
  for(let r=0;r<count;r++){
    const clear=new Uint8Array(29),cd=new DataView(clear.buffer);
    for(let block=0;block<3;block++){
      let eax=kd.getUint32(0x44,true),num=(eax^dv.getUint32(off,true))>>>0;
      let numold=dv.getUint32(off+4,true);
      for(let j=0x40;j>0;j-=4){
        eax=kd.getUint32(((num>>>16)&255)*4+0x448,true);
        eax=(eax+kd.getUint32((num>>>24)*4+0x48,true))>>>0;
        eax=(eax^kd.getUint32(((num>>>8)&255)*4+0x848,true))>>>0;
        eax=(eax+kd.getUint32((num&255)*4+0xC48,true))>>>0;
        eax=(eax^kd.getUint32(j,true))>>>0;
        const old=num;num=(numold^eax)>>>0;numold=old;
      }
      numold=(numold^kd.getUint32(0,true))>>>0;
      cd.setUint32(block*8,numold,true);cd.setUint32(block*8+4,num,true);off+=8;
    }
    clear.set(src.subarray(off,off+5),24);off+=5;
    let code="";for(let i=1;i<8&&clear[i];i++)code+=String.fromCharCode(clear[i]);
    const d=cd.getUint32(8,true),cat=clear[12];
    if(cat===1&&/^\d{6}$/.test(code)){
      const ev={d,cash:cd.getFloat32(13,true),rightsPrice:cd.getFloat32(17,true),bonus:cd.getFloat32(21,true),rights:cd.getFloat32(25,true)};
      if([ev.cash,ev.rightsPrice,ev.bonus,ev.rights].every(Number.isFinite)){
        if(!out.has(code))out.set(code,[]);out.get(code).push(ev);
      }
    }
  }
  for(const a of out.values())a.sort((x,y)=>x.d-y.d);
  return out;
}
function ma20Arr(c){
  const n=c.length,out=new Float64Array(n).fill(NaN);
  let s=0;
  for(let i=0;i<n;i++){s+=c[i];if(i>=20)s-=c[i-20];if(i>=19)out[i]=s/20}
  return out;
}
function windowStats(c,s,e){
  let pk=0,mdd=0;
  const rets=[];
  for(let i=s;i<=e;i++){
    if(c[i]>pk)pk=c[i];
    const dd=c[i]/pk-1;if(dd<mdd)mdd=dd;
    if(i>s)rets.push(c[i]/c[i-1]-1);
  }
  let m=0;for(const r of rets)m+=r;m/=rets.length||1;
  let sd=0;for(const r of rets)sd+=(r-m)*(r-m);sd=Math.sqrt(sd/(rets.length||1));
  return {mdd,sd};
}
function logSlice(c,s,e){
  const out=new Float64Array(e-s+1);
  for(let i=s;i<=e;i++)out[i-s]=Math.log(Math.max(c[i],1e-9));
  return out;
}
function retSlice(c,s,e){
  const out=new Float64Array(e-s);
  for(let i=s+1;i<=e;i++)out[i-s-1]=c[i]/c[i-1]-1;
  return out;
}
function bsearch(dates,d){
  let lo=0,hi=dates.length-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(dates[m]===d)return m;if(dates[m]<d)lo=m+1;else hi=m-1}
  return -1;
}
function alignCommonDates(a,b){
  const dates=[],ac=[],av=[],bc=[],bv=[];let i=0,j=0;
  const ak=a.periods||a.dates,bk=b.periods||b.dates;
  while(i<ak.length&&j<bk.length){
    if(ak[i]===bk[j]){dates.push(a.dates[i]);ac.push(a.closes[i]);av.push(a.vols[i]);bc.push(b.closes[j]);bv.push(b.vols[j]);i++;j++}
    else if(ak[i]<bk[j])i++;else j++;
  }
  return {dates:Int32Array.from(dates),aCloses:Float64Array.from(ac),aVols:Float64Array.from(av),bCloses:Float64Array.from(bc),bVols:Float64Array.from(bv)};
}
function sliceSeriesByDate(stk,startD,endD){
  let lo=0,hi=stk.dates.length;while(lo<hi){const m=(lo+hi)>>1;if(stk.dates[m]<startD)lo=m+1;else hi=m}const s=lo;
  lo=s;hi=stk.dates.length;while(lo<hi){const m=(lo+hi)>>1;if(stk.dates[m]<=endD)lo=m+1;else hi=m}const e=lo;
  return {dates:stk.dates.subarray(s,e),periods:stk.periods?stk.periods.subarray(s,e):undefined,closes:stk.closes.subarray(s,e),vols:stk.vols.subarray(s,e)};
}
function overlapRatio(a,b,L){return Math.max(0,Math.min(a.e,b.e)-Math.max(a.s,b.s)+1)/L}
function dedupeOverlaps(rows,threshold,L){
  const out=[];for(const r of [...rows].sort((a,b)=>(b.score??b.coarse??0)-(a.score??a.coarse??0))){if(!out.some(x=>x.key===r.key&&overlapRatio(x,r,L)>threshold))out.push(r)}return out;
}
function mergePerStockCandidates(rows,localLimit,globalLimit){
  const by=new Map();for(const r of rows){if(!by.has(r.key))by.set(r.key,[]);by.get(r.key).push(r)}
  return [...by.values()].flatMap(a=>a.sort((x,y)=>(y.score??y.coarse??0)-(x.score??x.coarse??0)).slice(0,localLimit))
    .sort((x,y)=>(y.score??y.coarse??0)-(x.score??x.coarse??0)).slice(0,globalLimit);
}
function historicalMaxEnd(dates,refStartD){return lastIdxBefore(dates,refStartD)-1}
function recentWindowStarts(n,L,recentBars,step){
  if(n<L)return [];
  const N=Math.max(L,Number.isFinite(recentBars)?Math.floor(recentBars):L),first=Math.max(0,n-N),last=n-L,out=[];
  for(let s=first;s<=last;s+=Math.max(1,step||1))out.push(s);
  if(out[out.length-1]!==last)out.push(last);
  return out;
}
function recentFreshnessCutoff(dates,refEndIndex,lookback=30){
  if(!dates||!dates.length)return 0;
  const end=Math.min(dates.length-1,Math.max(0,refEndIndex));
  return dates[Math.max(0,end-Math.max(0,Math.floor(lookback)))]||0;
}
function wilsonInterval(wins,n,z=1.96){if(!n)return null;const p=wins/n,z2=z*z,den=1+z2/n,mid=(p+z2/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/den;return [mid-half,mid+half]}
function clusterHorizonValues(rows,horizon,maxGapDays=7){
  const valid=rows.filter(r=>r.fut&&Number.isFinite(r.fut[horizon])).sort((a,b)=>a.endD-b.endD),out=[];let vals=[],anchor=null;
  for(const r of valid){const day=dateOrdinal(r.endD);if(anchor!==null&&day-anchor>maxGapDays){out.push(vals.reduce((a,b)=>a+b,0)/vals.length);vals=[];anchor=day}else if(anchor===null)anchor=day;vals.push(r.fut[horizon])}
  if(vals.length)out.push(vals.reduce((a,b)=>a+b,0)/vals.length);return out;
}
function bootstrapWinInterval(values,iterations=1000,seed=20260703){
  if(!values.length)return null;let x=seed>>>0||1;const rnd=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296},samples=[];
  for(let n=0;n<iterations;n++){let wins=0;for(let i=0;i<values.length;i++)if(values[Math.floor(rnd()*values.length)]>0)wins++;samples.push(wins/values.length)}
  samples.sort((a,b)=>a-b);return [samples[Math.floor(iterations*.025)],samples[Math.min(iterations-1,Math.floor(iterations*.975))]];
}
function isCacheValid(hit,file,rv,ver=ALGO_VER){return !!hit&&hit.ver===ver&&hit.rv===rv&&hit.size===file.size&&hit.mtime===file.lastModified}
function adaptiveCoarseThreshold(base,L){
  // 短窗口（周线/月线常见）重采样为32点后余弦噪声更大，按窗口长度线性放宽门槛，最多降低0.15。
  return Math.max(0.3,base-Math.min(0.15,Math.max(0,48-L)*0.005));
}

function idbOpen(){
  return new Promise((res,rej)=>{
    const rq=indexedDB.open("kline_tool_v2",1);
    rq.onupgradeneeded=()=>rq.result.createObjectStore("stocks",{keyPath:"key"});
    rq.onsuccess=()=>res(rq.result);
    rq.onerror=()=>rej(rq.error);
  });
}
function idbGet(db,key){
  return new Promise(res=>{
    try{
      const rq=db.transaction("stocks","readonly").objectStore("stocks").get(key);
      rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>res(null);
    }catch(_){res(null)}
  });
}
function idbPutBatch(db,recs){
  return new Promise(res=>{
    try{
      const tx=db.transaction("stocks","readwrite"),st=tx.objectStore("stocks");
      for(const r of recs)st.put(r);
      tx.oncomplete=()=>res();tx.onerror=()=>res();
    }catch(_){res()}
  });
}

async function getStock(key,pending){
  const f0=FILES.get(key);
  if(!f0)return null;
  const file=f0.getFile?await f0.getFile():f0;
  const hit=DB?await idbGet(DB,key):null;
  if(isCacheValid(hit,file,RIGHTS_STAMP,ALGO_VER)){
    return {dates:new Int32Array(hit.dates),closes:new Float64Array(hit.closes),vols:new Float64Array(hit.vols),warn:hit.warn,qStatus:hit.qStatus,qEvents:hit.qEvents,lastD:hit.lastD};
  }
  const buf=await file.arrayBuffer();
  const p=parseDayQfq(buf,key);
  pending.push({key,ver:ALGO_VER,rv:RIGHTS_STAMP,size:file.size,mtime:file.lastModified,dates:p.dates.buffer,closes:p.closes.buffer,vols:p.vols.buffer,warn:p.warn,qStatus:p.qStatus,qEvents:p.qEvents,lastD:p.lastD});
  return p;
}

function subScores(stk,s,e,R,zzth){
  const L=e-s+1;
  const zcum=zscore(logSlice(stk.closes,s,e));
  const cum=Math.max(0,cosine(zcum,R.zcum));
  const zret=zscore(retSlice(stk.closes,s,e));
  const ret=Math.max(0,cosine(zret,R.zret));
  const zig=zigSim(R.amps,zigAmps(stk.closes.subarray(s,e+1),zzth));
  let maS=0.5;
  {
    const rel=new Float64Array(L);let ok=true;
    for(let i=s;i<=e;i++){const m=stk.ma20[i];if(isNaN(m)){ok=false;break}rel[i-s]=(stk.closes[i]-m)/m}
    if(ok)maS=Math.max(0,cosine(zscore(rel),R.zma));
  }
  const lv=new Float64Array(L);
  for(let i=s;i<=e;i++)lv[i-s]=Math.log(1+stk.vols[i]);
  const volS=Math.max(0,cosine(zscore(lv),R.zvol));
  const ws=windowStats(stk.closes,s,e);
  const vdd=Math.max(0,1-Math.min(1,Math.abs(ws.sd-R.stats.sd)/(R.stats.sd+1e-9)*0.7+Math.abs(ws.mdd-R.stats.mdd)*1.8));
  return {cum,ret,zig,ma:maS,vol:volS,vdd};
}

self.onmessage=async ev=>{
  const msg=ev.data;
  if(msg.type==="files"){
    FILES=new Map(msg.entries);RIGHTS_STAMP=msg.rightsStamp||"raw";let decodeError=null;
    try{RIGHTS=msg.gbbq?decodeGbbq(msg.gbbq,msg.keyB64):null}
    catch(err){RIGHTS=new Map();decodeError=err}
    RIGHTS_STATE=resolveRightsState(RIGHTS,decodeError);
    if(RIGHTS_STATE.status!=="valid")RIGHTS_STAMP="raw:"+RIGHTS_STATE.reason;
    postMessage({type:"rightsStatus",ok:RIGHTS_STATE.status==="valid",status:RIGHTS_STATE.status,reason:RIGHTS_STATE.reason,stocks:RIGHTS?RIGHTS.size:0});return
  }
  if(msg.type==="series"){
    try{
      const f0=FILES.get(msg.key),f=f0.getFile?await f0.getFile():f0;
      const p=aggregateSeries(parseDayQfq(await f.arrayBuffer(),msg.key),msg.timeframe,msg.endD||Infinity);
      postMessage({type:"series",reqId:msg.reqId,dates:p.dates,opens:p.opens,highs:p.highs,lows:p.lows,closes:p.closes,amounts:p.amounts,vols:p.vols,
        rejected:p.rejected,qStatus:p.qStatus,qEvents:p.qEvents,rightsStatus:p.rightsStatus,rightsReason:p.rightsReason});
    }catch(err){postMessage({type:"series",reqId:msg.reqId,error:String(err)})}
    return;
  }
  if(msg.type==="cancel"){cancelled=true;return}
  if(msg.type!=="match")return;
  cancelled=false;
  const cfg=msg.cfg;
  try{await runMatch(cfg)}catch(err){postMessage({type:"error",msg:String(err&&err.stack||err)})}
};

async function runMatch(cfg){
  if(!DB){try{DB=await idbOpen()}catch(_){DB=null}}
  // 缓存按证券惰性读取，避免把全市场历史数组一次性反序列化进内存。
  const pending=[];
  const post=o=>postMessage(o);

  const refKey=cfg.refKey;
  const timeframe=normalizeTimeframe(cfg.timeframe);
  const refDaily=await getStock(refKey,pending);
  if(!refDaily){post({type:"error",msg:"未找到参考股票数据"});return}
  const refStk=aggregateSeries(refDaily,timeframe,cfg.d2);
  refStk.ma20=ma20Arr(refStk.closes);
  let rs=-1,re=-1;
  for(let i=0;i<refStk.dates.length;i++){
    const d=refStk.dates[i];
    if(d>=cfg.d1&&rs<0)rs=i;
    if(d<=cfg.d2)re=i;
  }
  const minPeriods=timeframe==="day"?16:8;
  if(rs<0||re<=rs||re-rs+1<minPeriods){post({type:"error",msg:`参考区间内${timeframe==="month"?"月线":timeframe==="week"?"周线":"日线"}不足${minPeriods}个周期`});return}
  const L=re-rs+1;
  const R={
    zcum:zscore(logSlice(refStk.closes,rs,re)),
    zret:zscore(retSlice(refStk.closes,rs,re)),
    amps:zigAmps(refStk.closes.subarray(rs,re+1),cfg.zzth),
    stats:windowStats(refStk.closes,rs,re),
    z32:zscore(resample(logSlice(refStk.closes,rs,re),32)),
    z48:zscore(resample(logSlice(refStk.closes,rs,re),48))
  };
  {
    const rel=new Float64Array(L);
    for(let i=rs;i<=re;i++){const m=refStk.ma20[i];rel[i-rs]=isNaN(m)?0:(refStk.closes[i]-m)/m}
    R.zma=zscore(rel);
    const lv=new Float64Array(L);
    for(let i=rs;i<=re;i++)lv[i-rs]=Math.log(1+refStk.vols[i]);
    R.zvol=zscore(lv);
  }
  const refStartD=refStk.dates[rs],refEndD=refStk.dates[re];

  const stSet=new Set(cfg.exST?cfg.stKeys||[]:[]);
  const keys=[];
  for(const k of FILES.keys()){
    const mkt=k.slice(0,2),c=k.slice(2);
    let board=null;
    if(mkt==="bj")board="bj";
    else if(c.startsWith("68"))board="kcb";
    else if(c.startsWith("30"))board="cyb";
    else if(mkt==="sh"&&/^(60)/.test(c)||mkt==="sz"&&/^(00)/.test(c))board="main";
    else if(mkt==="sh"&&/^(51|56|58)/.test(c)||mkt==="sz"&&/^(15|16)/.test(c))board="etf";
    if(!board)continue;
    if(!cfg.boards[board])continue;
    if(cfg.exST&&stSet.has(k))continue;
    keys.push(k);
  }

  const t0=Date.now();
  const coarseThreshold=Math.min(0.95,Math.max(0.3,Number(cfg.coarseThreshold)||0.75));
  const coarseThresholdEffective=adaptiveCoarseThreshold(coarseThreshold,L);
  const K_COARSE=Math.min(2000,Math.max(50,Math.floor(cfg.coarseLimit)||600));
  const K_DTW=Math.min(K_COARSE,Math.max(20,Math.floor(cfg.dtwLimit)||200));
  const dtwBand=Math.min(24,Math.max(1,Math.floor(cfg.dtwBand)||6));
  const coarse=[];
  const scratch=new Float64Array(32);
  const mode=cfg.mode;
  const freshnessBars=timeframe==="month"?2:timeframe==="week"?6:30;
  const recentCutoff=mode==="recent"?recentFreshnessCutoff(refStk.dates,re,freshnessBars):0;
  const effectiveRecentBars=mode==="recent"?Math.max(L,Number.isFinite(cfg.recentBars)?Math.floor(cfg.recentBars):L):null;
  let done=0,skipped=0;const skipReasons={},skipDetails=[];
  const skip=(reason,key,err)=>{skipped++;skipReasons[reason]=(skipReasons[reason]||0)+1;if(err&&skipDetails.length<8)skipDetails.push({key,reason,error:String(err&&err.message||err)})};
  const total=keys.length;

  // 4路并发预取：读文件/读缓存与计算重叠，缩短首次全市场扫描耗时。
  const PREFETCH=4,inflight=new Map();
  const prefetch=i=>{for(let j=i;j<Math.min(total,i+PREFETCH);j++){const k2=keys[j];if(!inflight.has(k2))inflight.set(k2,getStock(k2,pending).catch(err=>({__loadError:err})))}};

  for(let ki=0;ki<total;ki++){
    const key=keys[ki];
    if(cancelled){post({type:"cancelled"});return}
    done++;
    prefetch(ki);
    if(done%40===0){
      const el=(Date.now()-t0)/1000,rate=done/el;
      post({type:"progress",done,total,rate:rate.toFixed(0),eta:Math.max(0,(total-done)/rate).toFixed(0),phase:"粗筛"});
      await new Promise(r=>setTimeout(r));
    }
    try{
      const daily=await inflight.get(key);inflight.delete(key);
      if(daily&&daily.__loadError)throw daily.__loadError;
      if(!daily){skip("无数据",key);continue}
      const stk=aggregateSeries(daily,timeframe);
      const n=stk.dates.length;
      if(cfg.exNew&&daily.dates.length<120){skip("上市不足120日",key);continue}
      if(mode==="recent"&&stk.dates[n-1]<recentCutoff){skip("最后交易日过早",key);continue}
      if(pending.length>=200&&DB){await idbPutBatch(DB,pending.splice(0))}

      if(mode==="peer"){
        if(key===refKey)continue;
        const refWin={dates:refStk.dates.subarray(rs,re+1),periods:refStk.periods?refStk.periods.subarray(rs,re+1):undefined,closes:refStk.closes.subarray(rs,re+1),vols:refStk.vols.subarray(rs,re+1)};
        const peerSlice=sliceSeriesByDate(stk,refStartD,refEndD);
        const al=alignCommonDates(refWin,peerSlice);
        if(al.dates.length<L*0.95){skip("同期共同交易日不足",key);continue}
        const cc=Array.from(al.bCloses),rr=Array.from(al.aCloses);
        const zA=zscore(cc.map(x=>Math.log(x))),zB=zscore(rr.map(x=>Math.log(x)));
        const cum=Math.max(0,cosine(zA,zB));
        const ra=[],rb=[];
        for(let k2=1;k2<cc.length;k2++){ra.push(cc[k2]/cc[k2-1]-1);rb.push(rr[k2]/rr[k2-1]-1)}
        if(ra.length<L*0.7){skip("同期收益序列不足",key);continue}
        const ret=Math.max(0,cosine(zscore(ra),zscore(rb)));
        if(0.5*cum+0.5*ret<0.3){skip("同期粗筛未通过",key);continue}
        const s=bsearch(stk.dates,al.dates[0]),e=bsearch(stk.dates,al.dates[al.dates.length-1]);
        const peerStk={closes:al.bCloses,vols:al.bVols};peerStk.ma20=ma20Arr(peerStk.closes);
        const peerRef={zcum:zscore(al.aCloses.map(x=>Math.log(x))),zret:zscore(retSlice(al.aCloses,0,al.aCloses.length-1)),
          amps:zigAmps(al.aCloses,cfg.zzth),stats:windowStats(al.aCloses,0,al.aCloses.length-1)};
        const refMa=ma20Arr(al.aCloses),rma=new Float64Array(al.aCloses.length),rvol=new Float64Array(al.aCloses.length);
        for(let q=0;q<al.aCloses.length;q++){rma[q]=Number.isNaN(refMa[q])?0:(al.aCloses[q]-refMa[q])/refMa[q];rvol[q]=Math.log(1+al.aVols[q])}
        peerRef.zma=zscore(rma);peerRef.zvol=zscore(rvol);
        const sub=subScores(peerStk,0,peerStk.closes.length-1,peerRef,cfg.zzth);
        sub.cum=cum;sub.ret=ret;
        coarse.push({key,s,e,sub,warn:stk.warn,stk:packStk(stk,s,e),coarse:0.5*cum+0.5*ret});
      }else{
        const minLen=mode==="recent"?L:L+5;
        if(n<minLen){skip("窗口数据不足",key);continue}
        let starts;
        if(mode==="recent"){
          starts=recentWindowStarts(n,L,cfg.recentBars,cfg.step);
        }else{
          let maxE=n-1;if(cfg.isolate)maxE=historicalMaxEnd(stk.dates,refStartD);
          starts=[];for(let s=0;s+L-1<=maxE;s+=cfg.step)starts.push(s);
        }
        const lsAll=new Float64Array(n);
        for(let i=0;i<n;i++)lsAll[i]=Math.log(Math.max(stk.closes[i],1e-9));
        let bestOfStock=[];
        let slideChecks=0;
        for(const s of starts){
          if(++slideChecks%256===0){if(cancelled){post({type:"cancelled"});return}await new Promise(r=>setTimeout(r,0))}
          const e=s+L-1;
          if(key===refKey){
            if(mode==="recent"&&overlapRatio({s,e},{s:rs,e:re},L)>0.7)continue;
            if(mode!=="recent"&&!(e<rs||s>re))continue;
          }
          for(let q=0;q<32;q++){
            const t=q*(L-1)/31,j=Math.floor(t),f=t-j;
            const a=lsAll[s+j],b=s+j+1<=e?lsAll[s+j+1]:a;
            scratch[q]=a*(1-f)+b*f;
          }
          let m=0;for(let q=0;q<32;q++)m+=scratch[q];m/=32;
          let sd=0;for(let q=0;q<32;q++){const d=scratch[q]-m;sd+=d*d}
          sd=Math.sqrt(sd/32)||1;
          let dot=0;
          for(let q=0;q<32;q++)dot+=((scratch[q]-m)/sd)*R.z32[q];
          const cs=dot/32;
          if(cs>coarseThresholdEffective)bestOfStock.push([cs,s]);
        }
        if(!bestOfStock.length){skip("形态粗筛未通过",key);continue}
        bestOfStock.sort((a,b)=>b[0]-a[0]);
        bestOfStock=bestOfStock.slice(0,10);
        for(const[cs,s]of bestOfStock){
          // 粗筛只保留轻量候选（key+窗口+粗分），完整子分与展示数据延迟到全局裁剪之后计算，显著降低内存峰值。
          coarse.push({key,s,e:s+L-1,coarse:cs,warn:stk.warn});
        }
      }
    }catch(err){skip("计算异常",key,err)}
  }
  if(pending.length&&DB)await idbPutBatch(DB,pending.splice(0));
  const diversified=mergePerStockCandidates(coarse,10,K_COARSE);
  coarse.length=0;coarse.push(...diversified);

  post({type:"progress",done:total,total,phase:"精排",rate:"",eta:""});
  // 精排：仅对全局裁剪后的候选（≤K_COARSE）按证券重新读取解析缓存，计算完整子分与展示数据。
  {
    const byKey=new Map();
    for(const c of coarse){if(!c.sub||!c.stk){if(!byKey.has(c.key))byKey.set(c.key,[]);byKey.get(c.key).push(c)}}
    let rdone=0;
    for(const[key,cands]of byKey){
      if(cancelled){post({type:"cancelled"});return}
      let stk=null;
      try{
        const daily=await getStock(key,pending);
        if(daily){stk=aggregateSeries(daily,timeframe);stk.ma20=ma20Arr(stk.closes)}
      }catch(_){}
      for(const c of cands){
        if(stk&&c.e<stk.dates.length){c.sub=subScores(stk,c.s,c.e,R,cfg.zzth);c.stk=packStk(stk,c.s,c.e)}
        else c.drop=true;
      }
      if(++rdone%40===0)await new Promise(r=>setTimeout(r));
    }
    if(pending.length&&DB)await idbPutBatch(DB,pending.splice(0));
    const finalists=coarse.filter(c=>!c.drop&&c.sub&&c.stk);
    coarse.length=0;coarse.push(...finalists);
  }
  const W=cfg.weights,wsum=W.ret+W.cum+W.zig+W.ma+W.vol+W.vdd||1;
  for(const c of coarse){
    const s=c.sub;
    c.score=(W.ret*s.ret+W.cum*s.cum+W.zig*s.zig+W.ma*s.ma+W.vol*s.vol+W.vdd*s.vdd)/wsum;
    if(c.warn)c.score*=0.92;
  }
  coarse.sort((a,b)=>b.score-a.score);
  const dtwTop=coarse.slice(0,K_DTW),wd=Math.min(Math.max(cfg.wDtw,0),50)/100;
  for(const c of dtwTop){
    const z=zscore(resample(c.stk.win.map(x=>Math.log(x)),48));
    const dist=dtwDist(z,R.z48,dtwBand);
    c.sub.dtw=1/(1+dist/48);
    c.score=(1-wd)*c.score+wd*c.sub.dtw;
  }
  coarse.sort((a,b)=>b.score-a.score);

  const kept=[],byStock={};
  for(const c of coarse){
    const arr=byStock[c.key]||(byStock[c.key]=[]);
    if(arr.length>=cfg.perStock)continue;
    let ov=false;
    for(const k of arr){
      const inter=Math.min(c.e,k.e)-Math.max(c.s,k.s)+1;
      if(inter>0.7*L){ov=true;break}
    }
    if(ov)continue;
    arr.push(c);kept.push(c);
    if(kept.length>=cfg.topN)break;
  }

  const toRow=c=>{
    const st=c.stk;
    return {key:c.key,startD:st.startD,endD:st.endD,score:c.score,sub:c.sub,warn:c.warn,
      fut:st.fut,nn:st.nnSmall,futNn:st.futNn,lastD:st.lastD};
  };
  const rows=kept.map(toRow),statRows=dedupeOverlaps(kept,0.7,L).map(toRow),statSummary={};
  for(const hk of["r5","r10","r20","r60"]){const raw=statRows.map(r=>r.fut[hk]).filter(Number.isFinite),clusters=clusterHorizonValues(statRows,hk,7).sort((a,b)=>a-b);statSummary[hk]={rawN:raw.length,periodN:clusters.length,win:clusters.length?clusters.filter(x=>x>0).length/clusters.length:null,interval:bootstrapWinInterval(clusters),median:clusters.length?clusters[Math.floor(clusters.length/2)]:null}}
  post({type:"result",rows,statRows,meta:{mode,timeframe,recentBars:effectiveRecentBars,scanned:total,skipped,skipReasons,skipDetails,settings:{preset:cfg.preset||"custom",coarseThreshold,coarseThresholdEffective,K_COARSE,K_DTW,dtwBand},statSummary,L,refStartD,refEndD,elapsed:((Date.now()-t0)/1000).toFixed(1),
    refWarn:refStk.warn,candidates:coarse.length,refNn:Array.from(resample(refStk.closes.subarray(rs,re+1),120)).map(x=>x/refStk.closes[rs])}});
}

function lastIdxBefore(dates,d){
  let lo=0,hi=dates.length-1,ans=0;
  while(lo<=hi){const m=(lo+hi)>>1;if(dates[m]<d){ans=m+1;lo=m+1}else hi=m-1}
  return ans;
}
function packStk(stk,s,e){
  const L=e-s+1,c0=stk.closes[s];
  const win=Array.from(stk.closes.subarray(s,e+1));
  const nnSmall=Array.from(resample(stk.closes.subarray(s,e+1),120)).map(x=>x/c0);
  const n=stk.dates.length;
  const fut={};
  for(const h of[5,10,20,60])fut["r"+h]=e+h<n?stk.closes[e+h]/stk.closes[e]-1:null;
  let mu=null,md=null;
  if(e+60<n){
    let pk=stk.closes[e],tr=stk.closes[e];mu=0;md=0;
    for(let i=e+1;i<=e+60;i++){
      const c=stk.closes[i];
      if(c/stk.closes[e]-1>mu)mu=c/stk.closes[e]-1;
      if(c>pk)pk=c;
      const dd=c/pk-1;if(dd<md)md=dd;
    }
  }
  fut.maxUp=mu;fut.maxDn=md;
  const fe=Math.min(n-1,e+60);
  const futNn=fe>e?Array.from(stk.closes.subarray(e,fe+1)).map(x=>x/c0):[];
  return {startD:stk.dates[s],endD:stk.dates[e],win,nnSmall,fut,futNn:futNn.length>1?Array.from(resample(new Float64Array(futNn),Math.min(60,futNn.length))):[],lastD:stk.lastD};
}
self.__KLINE_TEST_API__={version:ALGO_VER,parseDayBuffer,resolveRightsState,corporateActionFactor,applyCorporateActions,
  aggregateSeries,periodKey,zscore,cosine,dtwDist,zigAmps,alignCommonDates,sliceSeriesByDate,dedupeOverlaps,mergePerStockCandidates,historicalMaxEnd,recentWindowStarts,recentFreshnessCutoff,wilsonInterval,clusterHorizonValues,bootstrapWinInterval,isCacheValid,adaptiveCoarseThreshold};
