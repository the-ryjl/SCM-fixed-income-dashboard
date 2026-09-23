/* Paper portfolio setup. Browser-local until the shared backend is connected. */
const SettingsModel = (() => {
  const key = 'scm.paper-settings.v1';
  const fields = [
    ['duration','Portfolio duration ceiling','years',6,100],
    ['hy','High-yield exposure ceiling','% NAV',20,100],
    ['issuer','Single corporate issuer ceiling','% NAV',6,100],
    ['spreadName','Single corporate name spread-risk ceiling','% SDV01',25,100],
    ['cash','Cash minimum','% NAV',5,100],
    ['belowBB','Below-BB exposure ceiling','% NAV',4,100],
    ['spreadDuration','Spread duration ceiling','years',4.5,100],
  ];
  const instruments = [['UST','Treasury bonds and bills'],['ETF','Bond ETFs'],['CORP','Corporate bonds'],['FUTURES','Treasury futures (hedges)']];
  const defaults = () => ({initialCash:97800,inception:'2026-01-02',status:'provisional',allowed:instruments.map(x=>x[0]),limits:Object.fromEntries(fields.map(x=>[x[0],x[3]]))});
  function validate(s){
    if(!s || !Number.isFinite(s.initialCash) || s.initialCash<=0 || s.initialCash>1e12) throw Error('Starting cash must be greater than zero and no more than $1 trillion.');
    if(typeof s.inception!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.inception) || !Number.isFinite(Date.parse(s.inception)) || new Date(s.inception).toISOString().slice(0,10)!==s.inception) throw Error('Enter a valid inception date.');
    if(!['provisional','reviewed'].includes(s.status)) throw Error('Choose a valid review status.');
    if(!Array.isArray(s.allowed) || s.allowed.some(a=>!instruments.some(x=>x[0]===a)) || new Set(s.allowed).size!==s.allowed.length) throw Error('Invalid permitted instruments.');
    for(const [id,label,, ,max] of fields) if(!Number.isFinite(s.limits?.[id]) || s.limits[id]<0 || s.limits[id]>max) throw Error(`${label} must be between 0 and ${max}.`);
    return s;
  }
  function assess(value,limit,floor=false){
    const breach=floor?value<limit:value>limit;
    const watch=floor?(limit>0 && value<=limit/0.85):(limit>0 && value>=limit*0.85);
    return breach?'BREACH':watch?'WATCH':'OK';
  }
  return {key,fields,instruments,defaults,validate,assess};
})();
let portfolioSettings=SettingsModel.defaults(), settingsHistory=[], settingsNotice='';
try {
  const raw=localStorage.getItem(SettingsModel.key);
  if(raw){const saved=JSON.parse(raw);portfolioSettings=SettingsModel.validate(saved.settings);settingsHistory=Array.isArray(saved.history)?saved.history.filter(h=>{try{return typeof h.at==='string'&&SettingsModel.validate(h.settings);}catch{return false;}}).slice(-20):[];}
} catch {settingsNotice='Saved settings could not be read. Provisional defaults are in use; saving will replace the unreadable settings.';}
const safeText=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function settings(){
 const s=portfolioSettings;
 return `<div class="card"><div class="card-h"><h2>Paper portfolio settings</h2><span class="pill">${s.status==='provisional'?'Pending professor review':'Reviewed settings'}</span></div><div class="card-b">
 <p class="lede">Start with provisional rules and update them after your professor’s review. Settings are saved only in this browser, on this website; they are not shared with analysts.</p>
 <div class="callout"><div><b>Setup values and sample holdings.</b> Starting cash and inception date are saved for the future trade engine. The supplied snapshot balances and dated observations stay unchanged. Limits and permitted instruments apply to the sample book immediately.</div></div>
 <form id="settingsForm"><div class="settings-grid">
 <label>Initial cash (USD)<input name="initialCash" type="number" min="0.01" max="1000000000000" step="0.01" required value="${s.initialCash}"><small>Opening balance for the paper simulation, not a later cash contribution.</small></label>
 <label>Inception date<input name="inception" type="date" required value="${s.inception}"><small>Planned start of the paper portfolio.</small></label>
 <label>Review status<select name="status"><option value="provisional" ${s.status==='provisional'?'selected':''}>Provisional — pending professor review</option><option value="reviewed" ${s.status==='reviewed'?'selected':''}>Reviewed with professor</option></select><small>A manual label; saving does not request approval.</small></label></div>
 <fieldset><legend>Permitted instruments</legend><p class="lede">Existing holdings outside these permissions are flagged for review. No holdings are removed. Allowing futures does not add a futures accounting engine.</p><div class="instrument-options">${SettingsModel.instruments.map(([id,label])=>`<label><input type="checkbox" name="allowed" value="${id}" ${s.allowed.includes(id)?'checked':''}> ${label}</label>`).join('')}</div></fieldset>
 <fieldset><legend>Risk limits</legend><p class="lede">Zero disallows exposure for a ceiling; a zero cash minimum disables the floor. A breach means strictly outside the limit. WATCH begins at 85% of a ceiling, or near the cash floor.</p><div class="settings-grid">${SettingsModel.fields.map(([id,label,unit,,max])=>`<label>${label} (${unit})<input type="number" name="${id}" min="0" max="${max}" step="0.01" required value="${s.limits[id]}"></label>`).join('')}</div></fieldset>
 <div class="settings-actions"><button class="refresh" type="submit">Save settings</button><button class="secondary" type="button" id="discardSettings">Discard unsaved changes</button></div>
 <p id="settingsFeedback" role="status" aria-live="polite">${safeText(settingsNotice)}</p></form>
 </div></div><div class="card"><div class="card-h"><h2>Saved changes</h2><span class="meta">Last 20 saves · browser-local</span></div><div class="card-b">${settingsHistory.length?settingsHistory.slice().reverse().map(h=>`<details class="settings-history"><summary>${safeText(h.at)} · ${safeText(h.settings.status)}</summary><p>Initial cash: $${safeText(h.settings.initialCash)} · Inception: ${safeText(h.settings.inception)}</p><p>Permitted: ${safeText((h.settings.allowed||[]).join(', ')||'Cash only')}</p><p>${SettingsModel.fields.map(([id,label,unit])=>`${safeText(label)}: ${safeText(h.settings.limits?.[id])} ${unit}`).join(' · ')}</p></details>`).join(''):'No changes saved yet. The values above are provisional defaults.'}</div></div>`;
}
function wireSettings(){
 const form=el('settingsForm');
 el('discardSettings').onclick=()=>{built.settings=false;show('settings');};
 form.onsubmit=e=>{
   e.preventDefault();
   try {
     const f=new FormData(form), next=SettingsModel.validate({initialCash:Number(f.get('initialCash')),inception:f.get('inception'),status:f.get('status'),allowed:f.getAll('allowed'),limits:Object.fromEntries(SettingsModel.fields.map(([id])=>[id,Number(f.get(id))]))});
     const history=[...settingsHistory,{at:new Date().toISOString(),settings:next}].slice(-20);
     try{localStorage.setItem(SettingsModel.key,JSON.stringify({settings:next,history}));}catch{throw Error('This browser could not save settings. Your changes have not been applied. Enable browser storage and try again.');}
     portfolioSettings=next;settingsHistory=history;settingsNotice='Saved in this browser. Limits and instrument checks updated; sample balances are unchanged.';
     Object.keys(built).forEach(k=>delete built[k]);updateSettingsSummary();show('settings');
   }catch(err){el('settingsFeedback').textContent=err.message;}
 };
}
function unpermitted(){return portfolio?portfolio.positions.filter(p=>!portfolioSettings.allowed.includes(p.instrument)):[];}
function limitChecks(){
 if(!portfolio)return [];
 return PortfolioModel.limits(portfolio,portfolioSettings).map((r,i)=>({...r,label:SettingsModel.fields[i][1],unit:SettingsModel.fields[i][2],status:SettingsModel.assess(r.value,r.limit,r.id==='cash')}));
}
function updateSettingsSummary(){
 if(typeof sourceMode!=='undefined'&&sourceMode==='sheets'){
   const p=paperResult;
   document.querySelector('.warnchip').textContent=p?`${p.risk.breachCount} breach(es) · ${p.risk.watchCount} to watch · ${p.risk.unknownCount} unknown`:'Awaiting Google Sheets';
   document.querySelector('nav.tabs .badge').textContent=p?p.risk.breachCount+p.risk.watchCount+p.risk.unknownCount:0;
   el('setupSummary').textContent=p?`Google Sheets · ${p.audit.settings.status} rules · Initial cash $${nf0.format(p.initialCash)} · Inception ${p.inception}`:'Google Sheets workbook · connect to load shared settings';
   return;
 }
 const checks=limitChecks(),breaches=checks.filter(x=>x.status==='BREACH').length+unpermitted().length,watches=checks.filter(x=>x.status==='WATCH').length;
 document.querySelector('.warnchip').textContent=portfolio?`${breaches} breach(es) · ${watches} to watch`:'Awaiting portfolio data';
 document.querySelector('nav.tabs .badge').textContent=breaches+watches;
 el('setupSummary').textContent=`Paper portfolio · ${portfolioSettings.status==='provisional'?'Provisional rules — pending professor review':'Reviewed rules'} · Initial cash $${nf0.format(portfolioSettings.initialCash)} · Inception ${portfolioSettings.inception}`;
}
