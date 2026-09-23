/* Pure snapshot validation and valuation. No network, browser storage, or UI. */
const PortfolioModel = (() => {
 const ratings=['AAA','AA+','AA','AA-','A+','A','A-','BBB+','BBB','BBB-','BB+','BB','BB-','B+','B','B-','CCC+','CCC','CCC-','CC','C','D'];
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const sum=(xs,fn=x=>x)=>xs.reduce((a,x)=>a+fn(x),0);
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 function need(ok,message){if(!ok)throw Error(message);}
 function number(n,label,min=-Infinity){need(typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e14&&n>=min,`${label}: invalid number`);}
 function text(s,label){need(typeof s==='string'&&s.trim().length>0,`${label}: missing text`);}
 function observations(rows,value,label,asOf){
  need(Array.isArray(rows),`${label}: expected observations`);let last='';
  rows.forEach(r=>{need(date(r.date)&&r.date>last&&r.date<=asOf,`${label}: dates must be unique, chronological and no later than the snapshot`);number(r[value],label,0);text(r.source,label+' source');last=r.date;});
 }
 function validate(d){
  need(d?.version===1,'Unsupported portfolio data version');need(['sample','paper'].includes(d.mode),'Invalid portfolio mode');need(date(d.asOf),'Invalid snapshot date');text(d.source,'Snapshot source');
  for(const k of ['cash','receivables','liabilities'])number(d[k],k,k==='cash'?-Infinity:0);
  need(Array.isArray(d.positions),'Missing positions');const ids=new Set();
  for(const p of d.positions){
   for(const k of ['id','issuer','name','sector','analyst','markSource'])text(p[k],k);
   need(!ids.has(p.id),'Duplicate position ID: '+p.id);ids.add(p.id);
   need(['UST','ETF','CORP'].includes(p.asset),'Unsupported asset: '+p.id);need(['UST','ETF','CORP','FUTURES'].includes(p.instrument),'Unsupported instrument: '+p.id);
   need(ratings.includes(p.rating),'Unsupported rating: '+p.id);need(['LONG','SHORT'].includes(p.side),'Unsupported side: '+p.id);
   need(date(p.markDate)&&p.markDate<=d.asOf,'Invalid mark date: '+p.id);
   number(p.quantity,p.id+' quantity');number(p.price,p.id+' price',0);number(p.entryPrice,p.id+' entry price',0);
   for(const k of ['duration','spreadDuration'])number(p[k],p.id+' '+k,0);number(p.oas,p.id+' OAS');
   for(const k of ['ytm','entryYtm','ytw'])if(p[k]!==null)number(p[k],p.id+' '+k);
   if(p.accruedInterest!==null)number(p.accruedInterest,p.id+' accrued interest',0);
   if(p.instrument==='FUTURES')need(p.asset==='UST'&&p.side==='SHORT'&&p.quantity<0&&p.quantityType==='notl','Only the legacy notional Treasury hedge is supported');
   else {need(p.instrument===p.asset&&p.side==='LONG'&&p.quantity>=0,'Unsupported position convention: '+p.id);need(p.quantityType===(p.asset==='ETF'?'sh':'par'),'Invalid quantity convention: '+p.id);}
   need(p.maturityDate===null||date(p.maturityDate),'Invalid maturity date: '+p.id);
   need(p.maturityYear===null||(Number.isInteger(p.maturityYear)&&p.maturityYear>=1900&&p.maturityYear<=9999),'Invalid maturity year: '+p.id);
   if(p.maturityDate)need(Number(p.maturityDate.slice(0,4))===p.maturityYear,'Maturity year/date mismatch: '+p.id);
   if(p.instrument==='FUTURES'||p.asset==='ETF')need(p.maturityDate===null&&p.maturityYear===null,'Fund/hedge maturity is not supported');
   observations(p.priceHistory,'price',p.id+' price history',d.asOf);
   for(const k of ['legacyMarketValue','legacyDayPnl','legacyUnrealized'])if(p[k]!==undefined)number(p[k],k);
  }
  const c=d.curve;need(c&&date(c.asOf)&&date(c.priorDate)&&c.priorDate<c.asOf&&c.asOf<=d.asOf,'Invalid curve dates');text(c.source,'Curve source');
  need(JSON.stringify(c.tenors)===JSON.stringify(['3M','1Y','2Y','5Y','7Y','10Y','20Y','30Y']),'Curve must include the eight named tenors');
  for(const k of ['now','prior']){need(Array.isArray(c[k])&&c[k].length===c.tenors.length,'Incomplete curve');c[k].forEach(v=>number(v,'Curve yield'));}
  observations(d.history,'nav','NAV history',d.asOf);
  for(const k of ['macro','events','memos','people'])need(Array.isArray(d[k]),'Missing '+k);
  d.macro.forEach(r=>need(Array.isArray(r)&&r.length===4&&r.every(x=>typeof x==='string'),'Invalid macro record'));
  d.events.forEach(r=>need(Array.isArray(r)&&r.length===4&&date(r[0])&&typeof r[1]==='string'&&typeof r[2]==='string'&&['HIGH','MED','LOW'].includes(r[3]),'Invalid calendar record'));
  d.people.forEach(r=>need(Array.isArray(r)&&r.length===3&&r.every(x=>typeof x==='string'),'Invalid person'));
  d.memos.forEach(r=>need(Array.isArray(r)&&r.length===4&&r.slice(0,3).every(x=>typeof x==='string')&&Array.isArray(r[3])&&r[3].every(t=>Array.isArray(t)&&t.length===2&&typeof t[0]==='string'&&['buy','sell','hold'].includes(t[1])),'Invalid memo'));
  for(const k of ['legacyNav','legacyCash','legacyDayPnl','legacyCashCarry'])if(d[k]!==undefined)number(d[k],k);
  return d;
 }
 function calculate(input){
  const d=validate(input);
  const positions=d.positions.map(p=>{
   const hedge=p.instrument==='FUTURES', scale=p.quantityType==='par'?0.01:1;
   const cleanValue=hedge?0:round(p.quantity*p.price*scale);
   const marketValue=round(cleanValue+(hedge?0:p.accruedInterest??0));
   return {...p,cleanValue,marketValue,priceGain:hedge?null:round(p.quantity*(p.price-p.entryPrice)*scale),dv01:(hedge?p.quantity:marketValue)*p.duration*0.0001,sdv01:marketValue*p.spreadDuration*0.0001};
  });
  const invested=round(sum(positions,p=>p.marketValue));
  const nav=round(invested+d.cash+d.receivables-d.liabilities);need(nav>0,'NAV must be positive for percentage risk analytics');
  const credit=positions.filter(p=>p.asset==='CORP'||(p.asset==='ETF'&&p.spreadDuration>0)), corp=positions.filter(p=>p.asset==='CORP');
  const creditValue=sum(credit,p=>p.marketValue),hyValue=sum(credit.filter(p=>ratings.indexOf(p.rating)>9),p=>p.marketValue);
  const weighted=(rows,key)=>{const r=rows.filter(p=>p[key]!==null&&p.marketValue>0),den=sum(r,p=>p.marketValue);return den?sum(r,p=>p.marketValue*p[key])/den:null;};
  const dv01=sum(positions,p=>p.dv01),sdv01=sum(positions,p=>p.sdv01);
  const issuers=Object.create(null);for(const p of corp){const r=issuers[p.issuer]??={value:0,sdv01:0};r.value+=p.marketValue;r.sdv01+=p.sdv01;}
  const legacyInvested=positions.every(p=>p.legacyMarketValue!==undefined)?round(sum(positions,p=>p.legacyMarketValue)):null;
  return {positions,invested,nav,cash:d.cash,dv01,sdv01,duration:dv01/(nav*0.0001),spreadDuration:sdv01/(nav*0.0001),creditValue,hyValue,igValue:creditValue-hyValue,treasuryValue:sum(positions.filter(p=>p.asset==='UST'||(p.asset==='ETF'&&!p.spreadDuration)),p=>p.marketValue),bondYtm:weighted(positions.filter(p=>p.quantityType==='par'),'ytm'),oas:weighted(credit,'oas'),issuers,belowBB:sum(positions.filter(p=>ratings.indexOf(p.rating)>11),p=>p.marketValue),missingAccrued:positions.filter(p=>p.quantityType==='par'&&p.accruedInterest===null).length,legacyInvested,legacyGap:d.legacyNav!==undefined&&legacyInvested!==null?round(legacyInvested+(d.legacyCash??d.cash)-d.legacyNav):null,markAdjustments:positions.filter(p=>p.legacyMarketValue!==undefined&&Math.abs(p.marketValue-p.legacyMarketValue)>0.005)};
 }
 function limits(m,s){
  const values=[m.duration,m.hyValue/m.nav*100,Math.max(0,...Object.values(m.issuers).map(x=>x.value))/m.nav*100,m.sdv01?Math.max(0,...Object.values(m.issuers).map(x=>x.sdv01))/m.sdv01*100:0,m.cash/m.nav*100,m.belowBB/m.nav*100,m.spreadDuration];
  const ids=['duration','hy','issuer','spreadName','cash','belowBB','spreadDuration'];
  return ids.map((id,i)=>({id,value:values[i],limit:s.limits[id]}));
 }
 function maturities(d){return d.positions.filter(p=>p.quantityType==='par'&&p.maturityDate&&p.quantity>0).map(p=>[p.maturityDate,p.id+' maturity',`${p.quantity.toLocaleString('en-US')} par · security record`,'MED']);}
 function maturityBuckets(d){const b=Object.create(null);for(const p of d.positions)if(p.quantityType==='par'&&p.maturityYear)b[p.maturityYear]=(b[p.maturityYear]||0)+p.quantity;return b;}
 return {calculate,validate,limits,maturities,maturityBuckets,ratings,round,sum};
})();
if(typeof module!=='undefined')module.exports=PortfolioModel;
