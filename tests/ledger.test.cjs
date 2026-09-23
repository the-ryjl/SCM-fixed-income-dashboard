const assert = require('node:assert/strict');
const engine = require('../ledger.js');
const adapter = require('../workbook.js');
const example = require('../examples/paper-ledger.json');
const copy = () => structuredClone(example);
const calc = (date, mutate = () => {}) => { const x = copy(); x.asOf = date; mutate(x); return engine.calculate(x); };
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
// Independently reconciled lifecycle: purchase dirty consideration 1,000 + fee 2.
let p = calc('2026-09-02');
assert.equal(p.cash,10000); assert.equal(p.liabilities,1002); assert.equal(p.invested,1000); assert.equal(p.nav,9998); assert.equal(p.totalPnl,-2);
p = calc('2026-09-03'); assert.equal(p.cash,8998); assert.equal(p.liabilities,0); assert.equal(p.nav,9998);
p = calc('2026-09-15'); assert.equal(p.cash,9018); assert.equal(p.nav,10028); assert.equal(p.income,20); assert.equal(p.totalPnl,28);
// Sell 400 par: dirty proceeds 408.40 less $1 fee; FIFO basis removed 400.80.
p = calc('2026-09-17'); assert.equal(p.cash,9018); assert.equal(p.receivables,407.4); assert.equal(p.positions[0].quantity,600);
assert.equal(p.invested,612.6); assert.equal(p.realizedGain,6.6); assert.equal(p.unrealizedGain,11.4); assert.equal(p.nav,10038); assert.equal(p.totalPnl,38);
p = calc('2026-09-18'); assert.equal(p.cash,9425.4); assert.equal(p.receivables,0); assert.equal(p.nav,10038);
// Cash flows are classified separately from investment performance.
p = calc('2026-09-17', x => x.cashFlows.push({ ...x.cashFlows[0], id:'deposit', type:'Contribution', amount:500 }, {...x.cashFlows[0], id:'expense', type:'Financing cost', direction:'Out', amount:3}));
assert.equal(p.netContributions,500); assert.equal(p.nav,10535); assert.equal(p.totalPnl,35);
// Multiple lots establish FIFO (not average cost), including purchase and sale fees.
const etf = {asOf:'2026-09-17', settings:copy().settings, securities:[{id:'ETF',name:'Test fund',issuer:'Fund issuer',instrument:'ETF',quantityType:'shares',currency:'USD',rating:'AAA'}],cashFlows:[],
  trades:[[2,100,2,'Buy'],[3,110,3,'Buy'],[3,120,1,'Sell']].map(([quantity,price,fees,side],i) => ({...copy().trades[0],id:`t${i}`,securityId:'ETF',quantityType:'shares',quantity,price,fees,side})),
  marks:[{id:'m',securityId:'ETF',date:'2026-09-17',price:120,duration:2,spreadDuration:0,sourceUrl:'https://example.com'}]};
p = engine.calculate(etf); assert.equal(p.positions[0].quantity,2); assert.equal(p.positions[0].costBasis,222); assert.equal(p.realizedGain,46); assert.equal(p.unrealizedGain,18); assert.equal(p.totalPnl,64); assert.equal(p.nav,10064);
const full = structuredClone(etf); full.trades[2].quantity=5; full.marks=[];
p=engine.calculate(full); assert.equal(p.positions.length,0); assert.equal(p.realizedGain,64); assert.equal(p.nav,10064);
// Missing risk must not quietly pass a limit, while Treasury spread duration is zero.
p=calc('2026-09-17', x => delete x.marks[2].duration); assert.equal(p.risk.checks.find(c=>c.id==='duration').status,'UNKNOWN'); assert.equal(p.risk.sdv01,0);
p=engine.calculate({...etf, marks:[{...etf.marks[0],rating:undefined,spreadDuration:null}],securities:[{...etf.securities[0],rating:'NR'}]});
assert.equal(p.risk.checks.find(c=>c.id==='hy').status,'UNKNOWN'); assert.equal(p.risk.checks.find(c=>c.id==='spreadName').status,'UNKNOWN');
p=calc('2026-09-17', x => { x.settings.allowed=[]; x.settings.limits.cash=95; }); assert.equal(p.risk.permissionBreaches.length,1); assert.equal(p.risk.checks.find(c=>c.id==='cash').status,'BREACH');
p=calc('2026-09-17', x => { x.settings.limits.cash=0; }); assert.equal(p.risk.checks.find(c=>c.id==='cash').status,'OK');
// Non-executed and future activity cannot change the book; future marks cannot leak.
p=calc('2026-09-17', x => { x.trades.push({id:'proposal',status:'Proposed'}, {id:'cancel',status:'Cancelled'}, {...x.trades[0],id:'future',tradeDate:'2026-10-01'}); x.marks.push({...x.marks[2],id:'future-mark',date:'2026-10-01',price:900}); }); assert.equal(p.nav,10038); assert.equal(p.audit.ignoredTrades.length,3);
// Every validation failure prevents any partial output.
for (const [mutate,pattern] of [
 [x=>delete x.trades[0].executionAccruedPer100,/execution accrued/], [x=>delete x.marks[2].accruedPer100,/accrued per 100/],
 [x=>x.trades.push({...x.trades[0]}),/duplicate ID/], [x=>x.trades[1].quantity=1001,/exceeds holdings/],
 [x=>x.trades[0].settlementDate='2026-09-01',/settlement date/], [x=>x.trades[0].quantityType='shares',/quantity type/],
 [x=>x.trades[0].tradeDate='2026-02-30',/trade date/], [x=>x.settings.inception='2026-09-03',/precedes inception/],
 [x=>x.securities[0].instrument='Futures',/futures accounting/], [x=>x.securities[0].currency='EUR',/only USD/],
 [x=>x.marks=[],/no mark/], [x=>x.marks.push({...x.marks[2],id:'duplicate-date'}),/duplicate security\/date/],
 [x=>x.cashFlows[0].direction='Out',/cash direction/], [x=>x.cashFlows[0].type='Other',/classify Other/],
 [x=>x.trades[0].price='99',/invalid number/], [x=>x.trades[0].fees=-1,/invalid number/],
]) assert.throws(()=>calc('2026-09-17',mutate),pattern);
const untouched=JSON.stringify(example); engine.calculate(example); assert.equal(JSON.stringify(example),untouched);
// Empty workbook / current native header contract, Sheets date serials, and appended accrued field.
const tabs={
 Trades:[['Trade ID *','Analyst *','Trade date *','Settlement date *','Security ID *','Side *','Quantity *','Quantity type *','Execution price *','Fees (USD) *','Status *','Research URL *','Notes','Security name (reference)','Instrument (reference)','Row check']],
 Securities:[['Security ID *','Security name *','Issuer *','Instrument *','Quantity type *','Coupon (%)','Maturity date','Currency *','Rating']],
 Marks:[['Mark ID *','Mark date *','Security ID *','Clean price *','Accrued per 100','YTM (%)','YTW (%)','Duration (years)','Spread duration (years)','OAS (bp)','Source URL *']],
 'Cash Flows':[['Cash flow ID *','Date *','Type *','Security ID','Amount (USD) *','Direction *','Analyst *','Source / research URL *']],
 Limits:[['Rule ID','Value','Review status']]};
for(const [id,value] of Object.entries({...example.settings.limits,initialCash:10000,inception:46266,allowUST:'Yes',allowETF:'Yes',allowCORP:'Yes',allowFUTURES:'No'})) tabs.Limits.push([id,value,'Provisional']);
let normalized=adapter.fromWorkbook(tabs,'2026-09-17'); assert.equal(normalized.settings.inception,'2026-09-01');
p=engine.calculate(normalized); assert.equal(p.nav,10000); assert.equal(p.totalPnl,0);
tabs.Trades[0].push('Execution accrued per 100');
tabs.Trades.push(['t','Analyst',46267,46268,'DEMO-BOND','Buy',1000,'par',99,2,'Executed','https://example.com','','','','',0]);
normalized=adapter.fromWorkbook(tabs,'2026-09-17'); assert.equal(normalized.trades[0].tradeDate,'2026-09-02'); assert.equal(normalized.trades[0].executionAccruedPer100,0);
tabs.Trades[1]=Array(13).fill(''); tabs.Trades[1][12]='Only a note';
assert.throws(()=>engine.calculate(adapter.fromWorkbook(tabs,'2026-09-17')),/Trades ID/);
tabs.Marks[0][3]='Wrong header'; assert.throws(()=>adapter.fromWorkbook(tabs,'2026-09-17'),/missing column Clean price/);
console.log('Ledger lifecycle, FIFO, settlement, income, validation, risk completeness, immutability and workbook adapter checks passed.');
