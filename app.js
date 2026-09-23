/* Display and refresh orchestration. All portfolio inputs are in data/portfolio.json. */
let snapshot=null, portfolio=null, activeTab='overview', loading=false, lastSuccess=null;
let paperResult=null, sourceMode='sample';
const built={};
const el=id=>document.getElementById(id);
const nf0=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
const money=n=>n===null?'—':dollars.format(Object.is(n,-0)?0:n);
const num=(n,d=2)=>n===null?'—':n.toFixed(d);
const pct=n=>n===null?'—':num(n)+'%';
const esc=s=>safeText(s);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stat=(label,value,detail='')=>`<div class="stat"><div class="k">${label}</div><div class="v">${value}</div><div class="s">${detail}</div></div>`;
const card=(title,body,meta='')=>`<div class="card"><div class="card-h"><h2>${title}</h2><div class="meta">${meta}</div></div><div class="card-b">${body}</div></div>`;
const notice=text=>`<div class="callout warn"><div>${text}</div></div>`;
const table=(headers,rows)=>`<div class="tbl-wrap"><table class="grid"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
function seriesChart(rows,key,label){
 if(rows.length<2)return `<div class="empty">${rows.length?'History begins on '+esc(rows[0].date)+'. One saved observation; a chart needs two.':'No saved observations yet. History will begin with the first dated observation.'}</div>`;
 const values=rows.map(r=>r[key]),min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*0.12,Math.abs(max)*0.001,0.01),lo=min-pad,hi=max+pad;
 const first=Date.parse(rows[0].date),range=Date.parse(rows.at(-1).date)-first;
 const xy=rows.map(r=>[60+(Date.parse(r.date)-first)/range*480,170-(r[key]-lo)/(hi-lo)*140]);
 const path=xy.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
 return `<svg viewBox="0 0 560 215" role="img" aria-label="${esc(label)}" width="100%"><text x="2" y="30" font-size="11">${num(hi)}</text><text x="2" y="173" font-size="11">${num(lo)}</text><path d="${path}" fill="none" stroke="#1a5c3a" stroke-width="2"/><text x="60" y="200" font-size="11">${esc(rows[0].date)}</text><text x="540" y="200" text-anchor="end" font-size="11">${esc(rows.at(-1).date)}</text></svg><p class="chart-cap">Saved observations only; no synthetic points. ${esc(label)}.</p>`;
}
function curveView(){
 const c=snapshot.curve,all=[...c.now,...c.prior],min=Math.min(...all)-0.1,max=Math.max(...all)+0.1;
 const times=[0.25,1,2,5,7,10,20,30],x=t=>48+(t/30)*490,y=v=>180-(v-min)/(max-min)*145;
 const path=a=>a.map((v,i)=>`${i?'L':'M'}${x(times[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
 return `<div class="curve-tbl">${c.tenors.map((t,i)=>`<div><div class="t">${t}</div><div class="y">${pct(c.now[i])}</div><div class="c">${num((c.now[i]-c.prior[i])*100,0)} bp</div></div>`).join('')}</div><svg viewBox="0 0 560 220" width="100%" role="img" aria-label="Dated sample Treasury curves with maturity in years"><text x="0" y="30" font-size="11">${pct(max)}</text><text x="0" y="182" font-size="11">${pct(min)}</text><path d="${path(c.prior)}" stroke="#98a29b" stroke-dasharray="4 4" fill="none"/><path d="${path(c.now)}" stroke="#1a5c3a" stroke-width="2" fill="none"/>${[0,5,10,20,30].map(t=>`<text x="${x(t)}" y="210" text-anchor="middle" font-size="11">${t}y</text>`).join('')}</svg><p class="chart-cap">Solid: ${esc(c.asOf)} · Dashed: ${esc(c.priorDate)} · ${esc(c.source)}</p>`;
}
function reconciliation(){
 const p=portfolio,d=snapshot;
 const rows=[['Market value (clean prices + supplied accrued interest)',money(p.invested)],['Cash',money(d.cash)],['Other receivables (excludes accrued interest above)',money(d.receivables)],['Liabilities',money(-d.liabilities)],['Calculated NAV',money(p.nav)]];
 let audit='';
 if(p.legacyGap!==null)audit=`<p>The legacy snapshot position values total ${money(p.legacyInvested)}. With the original cash balance, that is ${money(p.legacyInvested+(d.legacyCash??d.cash))}, versus the old headline NAV of ${money(d.legacyNav)}: an unexplained ${money(p.legacyGap)} gap. No balancing entry was invented.</p><p>Repricing from quantities and marks changes invested value by ${money(p.invested-p.legacyInvested)}. The current calculated NAV, including current cash and other balances, is ${money(p.nav)}.</p>${table(['Position','Legacy value','Recalculated value'],p.markAdjustments.map(x=>[esc(x.id),money(x.legacyMarketValue),money(x.marketValue)]))}`;
 return card('NAV reconciliation',table(['Component','USD'],rows)+notice(`${p.missingAccrued} bond position(s) lack accrued interest. Their clean values are included, but NAV remains provisional. The notional futures hedge has zero snapshot value; margin and settlement accounting are not implemented.`)+audit,'Quantity × price; no balancing plug');
}
function overview(){
 const p=portfolio;
 return card('Portfolio',`<div class="stats">${stat('Provisional NAV',money(p.nav),'Snapshot valuation')}${stat('Daily P&amp;L','—','Previous marks and cash-flow history required')}${stat('YTD return','—','Verified return history required')}${stat('Bond YTM',pct(p.bondYtm),'Value-weighted cash bonds only; ETFs excluded')}${stat('Duration',num(p.duration,1)+' yrs','Ceiling '+portfolioSettings.limits.duration+' yrs')}${stat('Estimated DV01',money(p.dv01)+'/bp','Includes notional hedge approximation')}${stat('Cash',pct(p.cash/p.nav*100),'Minimum '+portfolioSettings.limits.cash+'%')}</div>`,esc(snapshot.asOf))+
 `<div class="split">${card('Treasury curve',curveView(),'Dated sample; no live feed')}${card('Portfolio exposure',table(['Sleeve','Market value','% NAV'],[['Treasuries and rates ETFs',p.treasuryValue],['IG credit',p.igValue],['HY credit',p.hyValue],['Cash',p.cash]].map(([s,v])=>[s,money(v),pct(v/p.nav*100)])))}</div>`+
 card('Recorded NAV history',seriesChart(snapshot.history,'nav','Absolute NAV in USD; not a total-return chart'),'No benchmark data connected')+reconciliation();
}
function book(){
 const rows=portfolio.positions.map(p=>[esc(p.id)+'<span class="pname">'+esc(p.name)+'</span>',esc(p.analyst),esc(p.instrument),esc(p.rating),num(p.quantity,0)+' '+esc(p.quantityType),num(p.price),p.quantityType==='par'?pct(p.ytm):'—',pct(p.ytw),num(p.duration,1),money(p.marketValue),money(p.priceGain),esc(p.markDate)+'<span class="pname">'+esc(p.markSource)+'</span>',p.maturityDate?esc(p.maturityDate):p.maturityYear?`${p.maturityYear} (year only)`:'—',`<details><summary>History (${p.priceHistory.length})</summary><div style="width:300px;white-space:normal">${seriesChart(p.priceHistory,'price',p.id+' price')}</div></details>`]);
 return card('Book — positions',notice('Marks are supplied snapshot inputs, not live quotes. Bond prices are per $100 par; ETFs are per share. Price gain is quantity × (mark − entry price), excluding coupons, fees and accrued interest; it is not total P&L. ETF yield measures and YTW are unavailable unless sourced explicitly.')+`<div id="bookTable">${table(['Security','Analyst','Instrument','Rating','Size','Price','YTM','YTW','Duration','Market value','Price gain (est.)','Mark date','Maturity','Price history'],rows)}</div>`+`<p>Total market value: <b>${money(portfolio.invested)}</b> · Cash: ${money(portfolio.cash)} · NAV: ${money(portfolio.nav)}</p>`,`${rows.length} positions · click a column to sort`);
}
function risk(){
 const p=portfolio,rateShock=7,spreadShock=8,rr=p.dv01*rateShock,cr=p.sdv01*spreadShock,vol=Math.hypot(rr,cr),var95=1.645*vol;
 return notice('Illustrative risk estimates: supplied modified/spread durations, first-order price sensitivity, and a notional futures hedge approximation. VaR assumes 7 bp daily rate volatility, 8 bp spread volatility, zero correlation and normally distributed changes. These inputs are not calibrated or backtested.')+
 card('Risk estimates',`<div class="stats">${stat('Duration',num(p.duration,2)+' yrs')}${stat('Spread duration',num(p.spreadDuration,2)+' yrs')}${stat('Convexity','—','Not supplied; excluded from scenarios')}${stat('Credit OAS',num(p.oas,0)+' bp','Supplied OAS; value-weighted')}${stat('Illustrative 1-day VaR, 95%',money(var95),pct(var95/p.nav*100)+' of NAV')}</div>`)+
 card('Parallel rate scenarios',table(['Yield change','Estimated P&L','% NAV'],[-100,-50,-25,25,50,100].map(b=>[`${b>0?'+':''}${b} bp`,money(-p.dv01*b),pct(-p.dv01*b/p.nav*100)])),'First order only; no convexity')+
 card('Spread widening scenarios',table(['Spread change','Estimated P&L','% NAV'],[10,25,50,100].map(b=>['+'+b+' bp',money(-p.sdv01*b),pct(-p.sdv01*b/p.nav*100)])))+
 card('Risk by position',table(['Security','Rate DV01 ($/bp)','Spread DV01 ($/bp)'],p.positions.map(x=>[esc(x.id),money(x.dv01),money(x.sdv01)])));
}
function limits(){
 const outside=unpermitted();
 return card('Limits &amp; guidelines',`<p class="lede">Calculated from the current snapshot and saved settings. A limit breach and each unpermitted holding contribute to the header count.</p>`+table(['Rule','Actual','Limit','Status'],limitChecks().map(x=>[x.label,num(x.value)+' '+x.unit,x.limit+' '+x.unit,`<span class="status ${x.status}">${x.status}</span>`]))+`<h3 class="mini" style="margin-top:24px">Instrument permissions</h3>`+(outside.length?outside.map(p=>notice(`${esc(p.id)}: ${esc(p.instrument)} is not permitted. Review this holding.`)).join(''):'All holdings use permitted instruments.'),'Saved rules · provisional valuation');
}
function memoCards(ms){return ms.map(m=>`<div class="memo"><h3>${esc(m[0])}</h3><div class="by">${esc(m[1])}</div><p>${esc(m[2])}</p><div class="tags">${m[3].map(t=>`<span class="tag ${t[1]}">${esc(t[0])}</span>`).join('')}</div></div>`).join('')||'<p>No research records.</p>';}
function macro(){
 const c=snapshot.curve;
 return card('Treasury curve',curveView(),'Sample curve; dated inputs')+card('Curve spreads',table(['Measure','Current','Prior'],[['2s10s',2,5],['5s30s',3,7],['3m10y',0,5]].map(([n,a,b])=>[n,num((c.now[b]-c.now[a])*100,0)+' bp',num((c.prior[b]-c.prior[a])*100,0)+' bp'])))+
 card('Macro reference',notice('Legacy sample macro figures. Not independently verified or connected to a release feed.')+table(['Series','Sample reading','Prior / context'],snapshot.macro.map(r=>r.slice(0,3).map(esc))));
}
function credit(){
 const p=portfolio,buckets=PortfolioModel.maturityBuckets(snapshot);
 return card('Credit exposure',`<div class="stats">${stat('IG credit',money(p.igValue))}${stat('HY credit',money(p.hyValue))}${stat('Credit OAS',num(p.oas,0)+' bp')}${stat('Average rating','—','No rating aggregation methodology selected')}</div>`)+
 card('Issuer concentration',table(['Corporate issuer','Market value','% NAV','Spread DV01'],Object.entries(p.issuers).sort((a,b)=>b[1].value-a[1].value).map(([name,x])=>[esc(name),money(x.value),pct(x.value/p.nav*100),money(x.sdv01)])))+
 card('Maturity wall',table(['Maturity year','Par outstanding'],Object.entries(buckets).sort((a,b)=>a[0]-b[0]).map(([year,value])=>[year,money(value)]))+notice('Uses security-record maturity years and par quantities, not market values. Corporate sample records provide years only; exact coupon and maturity dates must be supplied before scheduling cash flows.'),'Cash bonds only');
}
function calendar(){
 const now=today(), all=[...snapshot.events,...PortfolioModel.maturities(snapshot)].sort((a,b)=>a[0].localeCompare(b[0]));
 const grouped={};for(const e of all){const key=e[0]<now?'Past events':e[0].slice(0,7);(grouped[key]??=[]).push(e);}
 return card('Economic &amp; desk calendar',notice('Macro events are unverified sample entries. Bond maturity events come from exact security-record dates. Year-only maturities appear in Credit, without an invented day.')+Object.entries(grouped).map(([k,rows])=>`<h3 class="mini" style="margin-top:24px">${k}</h3>${rows.map(e=>`<div class="evt"><span class="d">${esc(e[0])}</span><span class="n">${esc(e[1])}<br><small>${esc(e[2])}</small></span><span class="imp ${e[3]}">${e[3]}</span></div>`).join('')}`).join(''),`Calendar reference: ${now} (New York)`);
}
function research(){return card('Research &amp; theses',notice('Archived sample research, preserved as authored. Statements about allocations, limits and market conditions may not match current settings or recalculated values.')+memoCards(snapshot.memos))+card('People &amp; coverage',table(['Name','Coverage'],snapshot.people.map(p=>[esc(p[0]),esc(p[1])])));}
const builders={overview,book,risk,limits,macro,credit,calendar,research,settings};
function show(tab){
 if(!builders[tab])return;activeTab=tab;
 document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 document.querySelectorAll('main > section').forEach(s=>s.hidden=s.id!=='tab-'+tab);
 if(!portfolio&&(tab!=='settings'||sourceMode==='sheets')){el('tab-'+tab).innerHTML='<div class="empty">Portfolio data is not available. Connect Google Sheets or use Refresh to load or retry.</div>';return;}
 if(!built[tab]){el('tab-'+tab).innerHTML=paperResult?paperView(tab):builders[tab]();built[tab]=true;if(tab==='settings'&&!paperResult)wireSettings();if(tab==='book')wireSort();}
}
function wireSort(){
 const tbl=el('bookTable').querySelector('table');
 tbl.querySelectorAll('th').forEach((th,i)=>th.addEventListener('click',()=>{const asc=th.dataset.asc!=='1';th.dataset.asc=asc?'1':'0';const rows=[...tbl.tBodies[0].rows];rows.sort((a,b)=>{let x=a.cells[i].innerText,y=b.cells[i].innerText;const numeric=[4,5,6,7,8,9,10].includes(i);if(numeric){x=Number(x.replace(/[^0-9.\-]/g,''));y=Number(y.replace(/[^0-9.\-]/g,''));return asc?x-y:y-x;}return asc?x.localeCompare(y):y.localeCompare(x);});rows.forEach(r=>tbl.tBodies[0].appendChild(r));}));
}
function setStatus(state,message){el('dataStatus').dataset.state=state;el('dataStatus').textContent=message;}
function freshness(){
 const d=snapshot,now=today(),age=Math.floor((Date.parse(now)-Date.parse(d.asOf))/86400000),curveAge=Math.floor((Date.parse(now)-Date.parse(d.curve.asOf))/86400000),staleMarks=d.positions.filter(p=>p.markDate<d.asOf).length;
 setStatus(age>3||curveAge>3||staleMarks?'stale':'loaded',`${d.mode==='sample'?'SAMPLE DATA — not market-verified.':'Paper portfolio.'} Snapshot ${d.asOf}${age>3?' — STALE ('+age+' calendar days old)':''}. ${staleMarks} mark(s) older than snapshot. Curve ${d.curve.asOf}${curveAge>3?' — STALE':''}. Source: ${d.source}. Refresh reloads the data file; no live market feed is connected.`);
}
async function refreshData(){
 if(sourceMode==='sheets')return refreshSheets();
 if(loading)return;loading=true;el('refreshBtn').disabled=true;el('refreshBtn').textContent='Loading…';setStatus('loading','Loading and validating the portfolio snapshot…');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('./data/portfolio.json',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Data request failed (HTTP '+response.status+').');
  const data=await response.json(),calculated=PortfolioModel.calculate(data);
  // Commit only a fully validated snapshot. Failures retain the previous one.
  snapshot=data;portfolio=calculated;lastSuccess=new Date();
  for(const key of Object.keys(built))if(key!=='settings')delete built[key];
  el('portfolioMeta').textContent=`Paper portfolio · ${data.mode==='sample'?'sample':'supplied'} snapshot as of ${data.asOf}`;
  el('syncMeta').textContent='Loaded '+lastSuccess.toLocaleTimeString();
  updateSettingsSummary();show(activeTab);freshness();
 }catch(error){setStatus('error',`Refresh failed: ${error.name==='AbortError'?'request timed out':error.message} ${snapshot?'Showing last successful snapshot from '+snapshot.asOf+'.':'No portfolio data loaded. Serve this folder over HTTP and retry.'}`);}
 finally{clearTimeout(timeout);loading=false;el('refreshBtn').disabled=false;el('refreshBtn').textContent='Refresh';}
}
el('tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)show(b.dataset.tab);});
el('refreshBtn').addEventListener('click',refreshData);
updateSettingsSummary();show('overview');refreshData();
