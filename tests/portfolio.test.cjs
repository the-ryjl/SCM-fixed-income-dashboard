const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const model=require('../model.js'),raw=JSON.parse(fs.readFileSync('data/portfolio.json','utf8'));
const copy=()=>structuredClone(raw);
const p=model.calculate(raw);
assert.equal(p.legacyGap,49);assert.equal(p.legacyInvested,85049);assert.equal(p.invested,85266.85);assert.equal(p.nav,101108.85);
assert.equal(p.positions.find(x=>x.id==='UST 30Y').marketValue,5202);
assert.equal(p.positions.find(x=>x.id==='IEF').marketValue,4987.2);
let d=copy();d.receivables=100;d.liabilities=40;d.positions[0].accruedInterest=12.5;
assert.equal(model.calculate(d).nav,101181.35);
assert.equal(model.maturityBuckets(raw)[2056],5100);
assert(model.maturities(raw).some(e=>e[0]==='2028-08-31'));
assert(!model.maturities(raw).some(e=>e[0]==='2026-08-31'));
for(const mutation of [d=>d.positions[0].price=null,d=>d.positions.push(d.positions[0]),d=>d.curve.now.pop(),d=>d.positions[0].markDate='2026-02-30',d=>d.positions[0].quantityType='sh',d=>d.positions[0].rating='unknown',d=>d.history=[{date:'2027-01-01',nav:1,source:'test'}],d=>d.cash=-1e9]){d=copy();mutation(d);assert.throws(()=>model.calculate(d));}
d=copy();d.positions=[];const empty=model.calculate(d);assert.equal(empty.nav,15842);assert.equal(empty.bondYtm,null);
d=copy();d.history=[{date:'2026-09-01',nav:100000,source:'manual verified observation'},{date:'2026-09-04',nav:101000,source:'manual verified observation'}];model.validate(d);
// End-to-end refresh state and all renderers in a minimal browser adapter.
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',dataset:{},addEventListener(){}});return nodes.get(id);};
let payload=copy(),fail=false;
const ctx=vm.createContext({console,Intl,Date,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>null},document:{getElementById:node,querySelector:node,querySelectorAll:()=>[]},fetch:async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>structuredClone(payload)};}});
for(const file of ['model.js','settings.js','app.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
(async()=>{
 await new Promise(r=>setImmediate(r));
 assert.equal(vm.runInContext('portfolio.nav',ctx),101108.85);
 for(const tab of ['overview','book','risk','limits','macro','credit','calendar','research','settings'])assert(vm.runInContext(`builders.${tab}()`,ctx).length>0);
 assert(!vm.runInContext('overview()',ctx).includes('Bloomberg Agg'));
 payload.cash+=1000;await vm.runInContext('refreshData()',ctx);assert.equal(vm.runInContext('portfolio.nav',ctx),102108.85);assert.equal(vm.runInContext('portfolio.legacyGap',ctx),49);
 payload.positions[0].price=null;await vm.runInContext('refreshData()',ctx);assert.equal(vm.runInContext('portfolio.nav',ctx),102108.85);assert.equal(node('dataStatus').dataset.state,'error');
 fail=true;await vm.runInContext('refreshData()',ctx);assert(node('dataStatus').textContent.includes('last successful'));assert.equal(node('refreshBtn').disabled,false);
 fail=false;payload=copy();payload.positions=[];await vm.runInContext('refreshData()',ctx);
 for(const tab of ['overview','book','risk','limits','macro','credit','calendar','research'])assert(!vm.runInContext(`builders.${tab}()`,ctx).includes('NaN'));
 vm.runInContext('portfolioSettings.limits.cash=100',ctx);assert.equal(vm.runInContext("limitChecks().find(x=>x.id==='cash').status",ctx),'WATCH');
 console.log('Valuation, reconciliation, validation, maturity, empty-book rendering, refresh and failure recovery passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
