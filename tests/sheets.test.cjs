const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const transport=require('../sheets.js'),adapter=require('../workbook.js'),engine=require('../ledger.js');
const example=require('../examples/paper-ledger.json');
const specs={
 Trades:['trades',{'Trade ID':'id','Analyst':'analyst','Trade date':'tradeDate','Settlement date':'settlementDate','Security ID':'securityId','Side':'side','Quantity':'quantity','Quantity type':'quantityType','Execution price':'price','Fees (USD)':'fees','Status':'status','Research URL':'researchUrl','Execution accrued per 100':'executionAccruedPer100'}],
 Securities:['securities',{'Security ID':'id','Security name':'name','Issuer':'issuer','Instrument':'instrument','Quantity type':'quantityType','Coupon (%)':'coupon','Maturity date':'maturityDate','Currency':'currency','Rating':'rating'}],
 Marks:['marks',{'Mark ID':'id','Mark date':'date','Security ID':'securityId','Clean price':'price','Accrued per 100':'accruedPer100','YTM (%)':'ytm','YTW (%)':'ytw','Duration (years)':'duration','Spread duration (years)':'spreadDuration','OAS (bp)':'oas','Source URL':'sourceUrl'}],
 'Cash Flows':['cashFlows',{'Cash flow ID':'id','Date':'date','Type':'type','Security ID':'securityId','Amount (USD)':'amount','Direction':'direction','Analyst':'analyst','Source / research URL':'sourceUrl'}]
};
function fixture(){
 const tabs={};
 for(const [name,[key,map]] of Object.entries(specs))tabs[name]=[Object.keys(map),...example[key].map(r=>Object.values(map).map(k=>r[k]??''))];
 tabs.Limits=[['Rule ID','Value','Review status'],...Object.entries({...example.settings.limits,initialCash:10000,inception:example.settings.inception,allowUST:'Yes',allowETF:'Yes',allowCORP:'Yes',allowFUTURES:'No'}).map(([id,v])=>[id,v,'Provisional'])];
 return tabs;
}
const names=['Trades','Securities','Marks','Cash Flows','Limits'];
const metadata=()=>({spreadsheetId:transport.spreadsheetId,properties:{title:'Test workbook'},sheets:names.map(title=>({properties:{title,gridProperties:{rowCount:1000,columnCount:26}}}))});
let tabs=fixture(),status=200,requests=[],clock=1000,deny=false,meta=metadata();
const oauth={hasGrantedAllScopes:()=>!deny,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'test-token',expires_in:3600})})};
const fetchImpl=async(url,options)=>{
 requests.push({url,options});
 return {ok:status===200,status,json:async()=>url.includes('values:batchGet')?{spreadsheetId:transport.spreadsheetId,valueRanges:names.map(name=>({range:`'${name}'!A5:Q1000`,values:tabs[name]}))}:meta};
};
(async()=>{
 const client=transport.create({fetchImpl,now:()=>clock,oauth:()=>oauth});
 await assert.rejects(()=>client.read(),/Connect Google/);assert.equal(requests.length,0);
 await assert.rejects(()=>client.authorize('bad'),/valid Google/);
 await client.authorize('123-test.apps.googleusercontent.com');assert(client.authorized());
 let loaded=await client.read();assert.equal(engine.calculate(adapter.fromWorkbook(loaded.tabs,'2026-09-17')).nav,10038);
 assert.equal(requests.length,2);assert(!requests.some(r=>r.url.includes('test-token')));
 assert(requests.every(r=>r.options.headers.Authorization==='Bearer test-token'));
 const url=new URL(requests[1].url);assert.equal(url.searchParams.getAll('ranges').length,5);assert.equal(url.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');assert.equal(url.searchParams.get('dateTimeRenderOption'),'SERIAL_NUMBER');
 status=403;await assert.rejects(()=>client.read(),/denied access/);
 status=429;await assert.rejects(()=>client.read(),/limiting requests/);
 status=401;await assert.rejects(()=>client.read(),/expired/);assert(!client.authorized());status=200;
 await client.authorize('123-test.apps.googleusercontent.com');clock+=3600000;assert(!client.authorized());await assert.rejects(()=>client.read(),/Connect Google/);
 deny=true;await assert.rejects(()=>client.authorize('123-test.apps.googleusercontent.com'),/Read access/);deny=false;
 await client.authorize('123-test.apps.googleusercontent.com');meta.sheets.pop();await assert.rejects(()=>client.read(),/tab missing: Limits/);meta=metadata();
 meta.sheets[0].properties.gridProperties.rowCount=10001;await assert.rejects(()=>client.read(),/no rows were silently skipped/);meta=metadata();
 let release;
 const deferred=transport.create({oauth:()=>oauth,fetchImpl:()=>new Promise(r=>release=r)});
 await deferred.authorize('123-test.apps.googleusercontent.com');const reading=deferred.read();deferred.disconnect();release({ok:true,json:async()=>metadata()});await assert.rejects(()=>reading,/Connection changed/);
 // Browser orchestration: success, bad ledger preserving last good result, all tabs, disconnect.
 const nodes=new Map(),stored=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',dataset:{},listeners:{},addEventListener(e,f){this.listeners[e]=f;}});return nodes.get(id);};
 class FixedDate extends Date { constructor(...args){super(...(args.length?args:['2026-09-17T16:00:00Z']));} static now(){return Date.parse('2026-09-17T16:00:00Z');} }
 const ctx=vm.createContext({console,Intl,Date:FixedDate,URLSearchParams,AbortController,setTimeout,clearTimeout,
  google:{accounts:{oauth2:oauth}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
  document:{getElementById:node,querySelector:node,querySelectorAll:()=>[]},
  fetch:async(url,options)=>url.startsWith('https:')?fetchImpl(url,options):({ok:true,json:async()=>JSON.parse(fs.readFileSync('data/portfolio.json','utf8'))})});
 for(const file of ['model.js','settings.js','ledger.js','workbook.js','sheets.js','paper-views.js','app.js','sheets-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 await new Promise(r=>setImmediate(r));
 node('googleClientId').value='123-test.apps.googleusercontent.com';
 await node('connectGoogle').listeners.click();
 assert.equal(vm.runInContext('sourceMode',ctx),'sheets');assert.equal(vm.runInContext('portfolio.nav',ctx),10038);
 assert(node('portfolioMeta').textContent.includes('Google Sheets'));
 for(const tab of ['overview','book','risk','limits','macro','credit','calendar','research','settings']){
  const html=vm.runInContext(`paperView('${tab}')`,ctx);assert(html.length>0);assert(!html.includes('NaN'));assert(!html.includes('undefined'));
 }
 assert(!vm.runInContext("paperView('settings')",ctx).includes('settingsForm'));
 tabs.Trades[1][9]=-1;await vm.runInContext('refreshData()',ctx);assert.equal(vm.runInContext('portfolio.nav',ctx),10038);assert.equal(node('dataStatus').dataset.state,'error');assert(node('dataStatus').textContent.includes('last successful'));
 tabs=fixture();status=401;await vm.runInContext('refreshData()',ctx);assert.equal(vm.runInContext('portfolio.nav',ctx),10038);assert(node('googleStatus').textContent.includes('Not connected'));status=200;
 await node('disconnectGoogle').listeners.click();assert.equal(vm.runInContext('portfolio',ctx),null);assert.equal(vm.runInContext('paperResult',ctx),null);
 assert.deepEqual([...stored.keys()],['scm.google-client-id']);
 console.log('Google read-only transport, scope/expiry/errors, complete workbook reads, dashboard refresh, retention, views and disconnect passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
