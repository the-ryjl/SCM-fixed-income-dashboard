const engine = require('../ledger.js');
const input = require('./paper-ledger.json');
console.log('Illustrative engine demonstration — these are not actual portfolio records.');
console.table(['2026-09-02','2026-09-03','2026-09-15','2026-09-17','2026-09-18'].map(asOf => {
  const p = engine.calculate({...input,asOf});
  return {date:asOf, par:p.positions[0]?.quantity ?? 0,cash:p.cash,receivables:p.receivables,liabilities:p.liabilities,invested:p.invested,NAV:p.nav,totalPnL:p.totalPnl};
}));
