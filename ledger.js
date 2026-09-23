/* Pure paper-portfolio ledger. USD, long cash securities, FIFO dirty cost basis.
 * No I/O, automatic prices, synthetic history, or mutation of input records. */
const PortfolioLedger = (() => {
  const ratings = ['AAA','AA+','AA','AA-','A+','A','A-','BBB+','BBB','BBB-','BB+','BB','BB-','B+','B','B-','CCC+','CCC','CCC-','CC','C','D'];
  const instruments = {Treasury:'UST', Corporate:'CORP', ETF:'ETF', Futures:'FUTURES'};
  const rules = ['duration','hy','issuer','spreadName','cash','belowBB','spreadDuration'];
  const sum = (xs, f = x => x) => xs.reduce((a, x) => a + f(x), 0);
  const money = n => Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  function need(ok, message) { if (!ok) throw new Error(message); }
  function num(n, label, min = -1e12) { need(typeof n === 'number' && Number.isFinite(n) && n >= min && Math.abs(n) <= 1e12, `${label}: invalid number`); }
  function text(s, label) { need(typeof s === 'string' && s.trim().length > 0, `${label}: required`); }
  function unique(rows, label) {
    need(Array.isArray(rows), `${label}: expected rows`);
    const seen = new Set();
    for (const r of rows) { need(r && typeof r === 'object', `${label}: invalid row`); text(r.id, `${label} ID`); need(!seen.has(r.id), `${label}: duplicate ID ${r.id}`); seen.add(r.id); }
  }
  function calculate(input) {
    const {asOf, settings, trades, securities, marks, cashFlows} = input;
    need(isDate(asOf), 'Invalid valuation date');
    need(settings && isDate(settings.inception) && settings.inception <= asOf, 'Invalid inception date or valuation before inception');
    num(settings.initialCash, 'Initial cash', 0); need(settings.initialCash > 0, 'Initial cash must be positive');
    need(Array.isArray(settings.allowed) && settings.allowed.every(x => Object.values(instruments).includes(x)), 'Invalid instrument permissions');
    for (const id of rules) { num(settings.limits?.[id], `Limit ${id}`, 0); need(settings.limits[id] <= 100, `Limit ${id}: above 100`); }
    unique(trades, 'Trades'); unique(securities, 'Securities'); unique(marks, 'Marks'); unique(cashFlows, 'Cash flows');
    const refs = new Map(securities.map(s => [s.id, s])), books = new Map(), warnings = [], settlements = [], appliedTrades = [], appliedFlows = [];
    const checked = new Set();
    function security(id) {
      const s = refs.get(id); need(s, `Unknown security: ${id}`);
      if (!checked.has(id)) {
        text(s.name, `${id} name`); text(s.issuer, `${id} issuer`);
        need(Object.hasOwn(instruments, s.instrument), `${id}: unsupported instrument`);
        need(s.instrument !== 'Futures', `${id}: futures accounting is not supported`);
        need(s.currency === 'USD', `${id}: only USD is supported`);
        need(s.quantityType === (s.instrument === 'ETF' ? 'shares' : 'par'), `${id}: invalid quantity type`);
        if (s.instrument !== 'ETF') {
          need(isDate(s.maturityDate), `${id}: maturity date required`); num(s.coupon, `${id} coupon`, 0);
        }
        need(s.rating == null || s.rating === '' || s.rating === 'NR' || ratings.includes(s.rating), `${id}: invalid rating`);
        checked.add(id);
      }
      return s;
    }
    let cash = settings.initialCash, realized = 0, income = 0, expenses = 0, netContributions = 0;
    // Workbook row order breaks ties on the same date; input is never sorted in place.
    const executed = trades.filter(t => {
      need(['Proposed','Executed','Cancelled'].includes(t.status), `${t.id}: invalid status`);
      if (t.status !== 'Executed') return false;
      need(isDate(t.tradeDate), `${t.id}: invalid trade date`);
      need(t.tradeDate >= settings.inception, `${t.id}: executed trade precedes inception`);
      return t.tradeDate <= asOf;
    }).sort((a,b) => a.tradeDate.localeCompare(b.tradeDate));
    for (const t of executed) {
      const s = security(t.securityId), bond = s.instrument !== 'ETF';
      text(t.analyst, `${t.id} analyst`); text(t.researchUrl, `${t.id} research link`);
      need(isDate(t.settlementDate) && t.settlementDate >= t.tradeDate, `${t.id}: invalid settlement date`);
      need(!bond || t.tradeDate < s.maturityDate, `${t.id}: trade on/after maturity`);
      need(t.side === 'Buy' || t.side === 'Sell', `${t.id}: invalid side`);
      need(t.quantityType === s.quantityType, `${t.id}: quantity type mismatch`);
      num(t.quantity, `${t.id} quantity`, 0); need(t.quantity > 0, `${t.id}: quantity must be positive`);
      num(t.price, `${t.id} price`, 0); need(t.price > 0, `${t.id}: price must be positive`); num(t.fees, `${t.id} fees`, 0);
      if (bond) num(t.executionAccruedPer100, `${t.id} execution accrued per 100 (explicit zero allowed)`, 0);
      const gross = money(t.quantity * (t.price + (bond ? t.executionAccruedPer100 : 0)) * (bond ? .01 : 1));
      const amount = money(t.side === 'Buy' ? gross + t.fees : gross - t.fees);
      num(gross, `${t.id} consideration`, 0); num(amount, `${t.id} settlement amount`);
      let book = books.get(s.id);
      if (!book) { book = {security:s, lots:[], realized:0}; books.set(s.id, book); }
      if (t.side === 'Buy') book.lots.push({tradeId:t.id, date:t.tradeDate, quantity:t.quantity, cost:amount});
      else {
        const available = sum(book.lots, l => l.quantity);
        need(t.quantity <= available + 1e-9, `${t.id}: sale exceeds holdings (short sales unsupported)`);
        let left = t.quantity, removedCost = 0;
        for (const lot of book.lots) {
          if (left <= 1e-9) break;
          const taken = Math.min(left, lot.quantity), cost = lot.cost * taken / lot.quantity;
          removedCost += cost; lot.quantity -= taken; lot.cost -= cost; left -= taken;
        }
        book.lots = book.lots.filter(l => l.quantity > 1e-9);
        book.realized += amount - removedCost; realized += amount - removedCost;
      }
      const signedCash = t.side === 'Buy' ? -amount : amount;
      settlements.push({tradeId:t.id, securityId:s.id, date:t.settlementDate, amount:signedCash, settled:t.settlementDate <= asOf});
      if (t.settlementDate <= asOf) cash += signedCash;
      appliedTrades.push(t.id);
    }
    const flowDirections = {Contribution:'In', Withdrawal:'Out', Coupon:'In', Distribution:'In', Interest:'In', 'Financing cost':'Out'};
    for (const f of cashFlows) {
      need(isDate(f.date), `${f.id}: invalid cash-flow date`);
      need(f.date >= settings.inception, `${f.id}: cash flow precedes inception`);
      if (f.date > asOf) continue;
      need(Object.hasOwn(flowDirections, f.type), `${f.id}: unsupported cash-flow type; classify Other before calculation`);
      need(f.direction === flowDirections[f.type], `${f.id}: incorrect cash direction`);
      num(f.amount, `${f.id} amount`, 0); need(f.amount > 0, `${f.id}: amount must be positive`);
      text(f.analyst, `${f.id} analyst`); text(f.sourceUrl, `${f.id} source link`);
      if (['Coupon','Distribution'].includes(f.type)) text(f.securityId, `${f.id} security ID`);
      if (f.securityId) security(f.securityId);
      cash += f.direction === 'In' ? f.amount : -f.amount;
      if (f.type === 'Contribution' || f.type === 'Withdrawal') netContributions += f.direction === 'In' ? f.amount : -f.amount;
      else if (f.type === 'Financing cost') expenses += f.amount;
      else income += f.amount;
      appliedFlows.push(f.id);
    }
    const markIndex = new Map(), markKeys = new Set();
    for (const m of marks) {
      need(isDate(m.date), `${m.id}: invalid mark date`);
      if (m.date > asOf) continue;
      need(refs.has(m.securityId), `${m.id}: unknown security`);
      const key = `${m.securityId}\u0000${m.date}`; need(!markKeys.has(key), `${m.id}: duplicate security/date mark`); markKeys.add(key);
      const previous = markIndex.get(m.securityId);
      if (!previous || m.date > previous.date) markIndex.set(m.securityId, m);
    }
    const positions = [];
    for (const book of books.values()) {
      const s = book.security, quantity = sum(book.lots, l => l.quantity);
      if (quantity <= 1e-9) continue;
      const m = markIndex.get(s.id), bond = s.instrument !== 'ETF';
      need(m, `${s.id}: no mark on/before valuation date`); text(m.sourceUrl, `${m.id} mark source`);
      num(m.price, `${m.id} price`, 0); need(m.price > 0, `${m.id}: mark must be positive`);
      if (bond) num(m.accruedPer100, `${m.id} accrued per 100 (explicit zero allowed)`, 0);
      for (const key of ['ytm','ytw','duration','spreadDuration','oas']) if (m[key] != null) num(m[key], `${m.id} ${key}`, ['duration','spreadDuration'].includes(key) ? 0 : -1e12);
      if (m.date < asOf) warnings.push({code:'STALE_MARK', securityId:s.id, date:m.date});
      if (bond && s.maturityDate <= asOf) warnings.push({code:'MATURITY_REQUIRES_REDEMPTION', securityId:s.id, date:s.maturityDate});
      if (!settings.allowed.includes(instruments[s.instrument])) warnings.push({code:'UNPERMITTED_INSTRUMENT', securityId:s.id});
      const cleanValue = quantity * m.price * (bond ? .01 : 1), accruedInterest = bond ? quantity * m.accruedPer100 / 100 : 0;
      const marketValue = cleanValue + accruedInterest, costBasis = sum(book.lots, l => l.cost);
      num(marketValue, `${s.id} market value`, 0);
      positions.push({id:s.id, name:s.name, issuer:s.issuer, instrument:instruments[s.instrument], quantityType:s.quantityType, quantity,
        maturityDate:s.maturityDate ?? null, rating:s.rating || 'NR', markDate:m.date, markSource:m.sourceUrl, price:m.price,
        cleanValue, accruedInterest, marketValue, costBasis, realizedGain:book.realized, unrealizedGain:marketValue-costBasis,
        ytm:m.ytm ?? null, ytw:m.ytw ?? null, duration:m.duration ?? null,
        spreadDuration:m.spreadDuration ?? (s.instrument === 'Treasury' ? 0 : null), oas:m.oas ?? null,
        lots:book.lots.map(l => ({...l}))});
    }
    const unsettled = settlements.filter(s => !s.settled);
    const receivables = sum(unsettled, s => Math.max(s.amount, 0)), liabilities = sum(unsettled, s => Math.max(-s.amount, 0));
    const invested = sum(positions, p => p.marketValue), nav = cash + receivables - liabilities + invested;
    const unrealized = sum(positions, p => p.unrealizedGain), totalPnl = realized + unrealized + income - expenses;
    const reconciliationDifference = nav - (settings.initialCash + netContributions + totalPnl);
    need(Math.abs(reconciliationDifference) < .005, 'Ledger reconciliation failed');
    const risk = calculateRisk(positions, nav, cash, settings);
    if (risk.checks.some(c => c.status === 'UNKNOWN')) warnings.push({code:'INCOMPLETE_RISK', message:'One or more limits cannot be assessed; missing inputs are not zero.'});
    return {version:1, mode:'paper', asOf, inception:settings.inception, initialCash:settings.initialCash,
      cash:money(cash), receivables:money(receivables), liabilities:money(liabilities), invested:money(invested), nav:money(nav),
      netContributions:money(netContributions), realizedGain:money(realized), unrealizedGain:money(unrealized), income:money(income), expenses:money(expenses), totalPnl:money(totalPnl),
      reconciliationDifference:money(reconciliationDifference), positions, settlements, warnings, risk,
      audit:{appliedTrades, appliedCashFlows:appliedFlows, ignoredTrades:trades.filter(t => !appliedTrades.includes(t.id)).map(t => t.id), costMethod:'FIFO dirty cost including purchase fees', accounting:'Trade-date holdings; settlement-date cash', settings:JSON.parse(JSON.stringify(settings))}};
  }
  function calculateRisk(positions, nav, cash, settings) {
    const weighted = key => positions.every(p => p[key] !== null) ? sum(positions, p => p.marketValue * p[key]) : null;
    const durationSum = weighted('duration'), spreadSum = weighted('spreadDuration');
    const credit = positions.filter(p => p.instrument === 'CORP' || (p.instrument === 'ETF' && p.spreadDuration !== 0));
    const rated = credit.every(p => ratings.includes(p.rating));
    const issuers = new Map();
    for (const p of positions.filter(p => p.instrument === 'CORP')) {
      const i = issuers.get(p.issuer) ?? {value:0, spread:0}; i.value += p.marketValue; i.spread += p.marketValue * (p.spreadDuration ?? 0); issuers.set(p.issuer, i);
    }
    const percent = value => nav > 0 && value !== null ? value / nav * 100 : null;
    const values = {duration:nav > 0 && durationSum !== null ? durationSum / nav : null,
      spreadDuration:nav > 0 && spreadSum !== null ? spreadSum / nav : null,
      hy:percent(rated ? sum(credit.filter(p => ratings.indexOf(p.rating) > 9), p => p.marketValue) : null),
      belowBB:percent(rated ? sum(credit.filter(p => ratings.indexOf(p.rating) > 11), p => p.marketValue) : null),
      issuer:percent(Math.max(0, ...[...issuers.values()].map(i => i.value))), cash:percent(cash),
      spreadName:nav <= 0 || spreadSum === null ? null : spreadSum === 0 ? 0 : Math.max(0, ...[...issuers.values()].map(i => i.spread)) / spreadSum * 100};
    const checks = rules.map(id => {
      const value = values[id], limit = settings.limits[id], floor = id === 'cash';
      const breach = floor ? limit > 0 && value < limit : value > limit;
      const watch = limit > 0 && (floor ? value <= limit / .85 : value >= limit * .85);
      return {id, value, limit, status:value === null ? 'UNKNOWN' : breach ? 'BREACH' : watch ? 'WATCH' : 'OK'};
    });
    const permissionBreaches = positions.filter(p => !settings.allowed.includes(p.instrument)).map(p => p.id);
    return {dv01:durationSum === null ? null : durationSum * .0001, sdv01:spreadSum === null ? null : spreadSum * .0001, values, checks, permissionBreaches,
      breachCount:checks.filter(c => c.status === 'BREACH').length + permissionBreaches.length,
      watchCount:checks.filter(c => c.status === 'WATCH').length, unknownCount:checks.filter(c => c.status === 'UNKNOWN').length};
  }
  return {calculate};
})();
if (typeof module !== 'undefined') module.exports = PortfolioLedger;
