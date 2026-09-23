const sheetsConnection=GoogleSheetsPortfolio.create();
let connectingGoogle=false;
function sheetsControls(busy){
 for(const id of ['portfolioSource','connectGoogle','disconnectGoogle','googleClientId'])el(id).disabled=busy;
}
function clearPortfolioSource(mode){
 sourceMode=mode;paperResult=null;portfolio=null;snapshot=null;lastSuccess=null;
 Object.keys(built).forEach(k=>delete built[k]);
 el('portfolioMeta').textContent=mode==='sheets'?'Google Sheets · awaiting workbook':'Illustrative sample · awaiting snapshot';
 el('syncMeta').textContent='Not loaded';updateSettingsSummary();show(activeTab);
}
async function refreshSheets(){
 if(loading||connectingGoogle)return;
 loading=true;sheetsControls(true);el('refreshBtn').disabled=true;el('refreshBtn').textContent='Loading…';
 setStatus('loading','Reading all five workbook tabs and recalculating the paper portfolio…');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
   const loaded=await sheetsConnection.read({signal:controller.signal});
   const input=PortfolioWorkbook.fromWorkbook(loaded.tabs,today()), next=PortfolioLedger.calculate(input);
   // Commit only when every tab has been read and the complete ledger validates.
   paperResult=next;portfolio=next;snapshot={mode:'paper',asOf:next.asOf,source:loaded.source.title};lastSuccess=new Date();
   Object.keys(built).forEach(k=>delete built[k]);
   el('portfolioMeta').textContent=`Google Sheets paper portfolio · valuation ${next.asOf}`;
   el('syncMeta').textContent='Read '+lastSuccess.toLocaleTimeString();
   el('googleStatus').textContent='Connected to '+loaded.source.title+'. Refresh reads the latest workbook inputs.';
   updateSettingsSummary();show(activeTab);
   const old=next.warnings.filter(w=>w.code==='STALE_MARK').length;
   setStatus(old?'stale':'loaded',`Google Sheets · ${next.audit.appliedTrades.length} executed trade(s) · ${next.audit.appliedCashFlows.length} cash flow(s). ${old} mark(s) older than ${next.asOf}. ${next.risk.unknownCount} risk check(s) unknown. Marks are workbook inputs, not live market quotes.`);
 }catch(error){
   const message=error.name==='AbortError'?'Google Sheets request timed out':error.message;
   setStatus('error',`Refresh failed: ${message} ${paperResult?'Showing the last successful workbook calculation from '+lastSuccess.toLocaleTimeString()+'.':'No workbook values loaded.'}`);
   el('googleStatus').textContent=sheetsConnection.authorized()?'Connected, but the workbook could not be calculated. Correct the issue and Refresh.':'Not connected. Use Connect Google Sheets to authorize access.';
 }finally{clearTimeout(timeout);loading=false;sheetsControls(false);el('refreshBtn').disabled=false;el('refreshBtn').textContent='Refresh';}
}
el('portfolioSource').addEventListener('change',async()=>{
 if(loading||connectingGoogle){el('portfolioSource').value=sourceMode;return;}
 clearPortfolioSource(el('portfolioSource').value);
 if(sourceMode==='sheets')el('googleSetup').open=true;
 await refreshData();
});
el('connectGoogle').addEventListener('click',async()=>{
 if(loading||connectingGoogle)return;
 const clientId=el('googleClientId').value.trim();
 try{localStorage.setItem('scm.google-client-id',clientId);}catch{}
 connectingGoogle=true;sheetsControls(true);el('refreshBtn').disabled=true;el('googleStatus').textContent='Complete Google sign-in in the popup…';
 try{
   await sheetsConnection.authorize(clientId);
   if(sourceMode!=='sheets')clearPortfolioSource('sheets');
   el('portfolioSource').value='sheets';connectingGoogle=false;await refreshSheets();
 }catch(error){el('googleStatus').textContent=error.message;}
 finally{connectingGoogle=false;sheetsControls(false);el('refreshBtn').disabled=loading;}
});
el('disconnectGoogle').addEventListener('click',()=>{
 if(loading||connectingGoogle)return;
 sheetsConnection.disconnect();
 if(sourceMode==='sheets'){clearPortfolioSource('sheets');setStatus('loaded','Disconnected. Workbook values have been cleared from this page.');}
 el('googleStatus').textContent='Disconnected from this page. Reconnect to read the workbook.';
});
try{el('googleClientId').value=localStorage.getItem('scm.google-client-id')||'';}catch{}
