/* Adapter for the five Google Sheets tabs. Supply unformatted values with row 5
 * as the first row (e.g. Sheets values.get A5:Q205). No Google credentials here. */
const PortfolioWorkbook = (() => {
  const blank = v => v === '' || v == null;
  const date = v => typeof v === 'number' && Number.isInteger(v)
    ? new Date(Date.UTC(1899,11,30) + v * 86400000).toISOString().slice(0,10) : v;
  function rows(grid, name) {
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) throw Error(`${name}: header row required`);
    const headers = grid[0].map(h => String(h).replace(/\s*\*$/, '').trim());
    if (new Set(headers).size !== headers.length) throw Error(`${name}: duplicate headers`);
    return grid.slice(1).map((row, i) => ({row, sheetRow:i+6})).filter(({row}) => row.some(v => !blank(v)))
      .map(({row, sheetRow}) => ({...Object.fromEntries(headers.map((h,i) => [h, row[i]])), sheetRow}));
  }
  function fromWorkbook(tabs, asOf) {
    const parsed = Object.fromEntries(['Trades','Securities','Marks','Cash Flows','Limits'].map(name => [name, rows(tabs[name], name)]));
    const get = (r, key) => blank(r[key]) ? null : r[key];
    // Filter using only input columns, so calculated reference cells never create records.
    const map = (name, fields) => {
      const headers = tabs[name][0].map(h => String(h).replace(/\s*\*$/, '').trim());
      for (const key of Object.keys(fields)) if (key !== 'Execution accrued per 100' && !headers.includes(key)) throw Error(`${name}: missing column ${key}`);
      return parsed[name].filter(r => Object.keys(r).some(k => !['sheetRow','Row check','Security name (reference)','Instrument (reference)'].includes(k) && !blank(r[k])))
        .map(r => Object.fromEntries(Object.entries(fields).map(([key, target]) => [target, /date$|^inception$/i.test(target) ? date(get(r,key)) : get(r,key)])));
    };
    const limitRows = parsed.Limits.filter(r => !blank(r['Rule ID']));
    const limits = Object.create(null);
    for (const r of limitRows) {
      if (Object.hasOwn(limits, r['Rule ID'])) throw Error(`Limits: duplicate rule ${r['Rule ID']}`);
      // A setup snapshot is applied as a whole; dated future rules need a versioned settings engine.
      if (!blank(r['Effective date'])) {
        const effective = date(r['Effective date']);
        if (typeof effective !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effective) || !Number.isFinite(Date.parse(effective)) || new Date(effective).toISOString().slice(0,10) !== effective) throw Error(`Limits: invalid effective date ${r['Rule ID']}`);
        if (effective > asOf) throw Error(`Limits: future effective rule ${r['Rule ID']}`);
      }
      limits[r['Rule ID']] = r.Value;
    }
    const permission = {allowUST:'UST', allowETF:'ETF', allowCORP:'CORP', allowFUTURES:'FUTURES'};
    for (const id of Object.keys(permission)) if (!['Yes','No'].includes(limits[id])) throw Error(`Limits: ${id} must be Yes or No`);
    const settings = {initialCash:limits.initialCash, inception:date(limits.inception),
      status:limitRows.every(r => r['Review status'] === 'Reviewed') ? 'reviewed' : 'provisional',
      allowed:Object.keys(permission).filter(id => limits[id] === 'Yes').map(id => permission[id]),
      limits:Object.fromEntries(['duration','hy','issuer','spreadName','cash','belowBB','spreadDuration'].map(id => [id,limits[id]]))};
    return {asOf, settings,
      trades:map('Trades', {'Trade ID':'id','Analyst':'analyst','Trade date':'tradeDate','Settlement date':'settlementDate','Security ID':'securityId','Side':'side','Quantity':'quantity','Quantity type':'quantityType','Execution price':'price','Fees (USD)':'fees','Status':'status','Research URL':'researchUrl','Execution accrued per 100':'executionAccruedPer100'}),
      securities:map('Securities', {'Security ID':'id','Security name':'name','Issuer':'issuer','Instrument':'instrument','Quantity type':'quantityType','Coupon (%)':'coupon','Maturity date':'maturityDate','Currency':'currency','Rating':'rating'}),
      marks:map('Marks', {'Mark ID':'id','Mark date':'date','Security ID':'securityId','Clean price':'price','Accrued per 100':'accruedPer100','YTM (%)':'ytm','YTW (%)':'ytw','Duration (years)':'duration','Spread duration (years)':'spreadDuration','OAS (bp)':'oas','Source URL':'sourceUrl'}),
      cashFlows:map('Cash Flows', {'Cash flow ID':'id','Date':'date','Type':'type','Security ID':'securityId','Amount (USD)':'amount','Direction':'direction','Analyst':'analyst','Source / research URL':'sourceUrl'})};
  }
  return {fromWorkbook};
})();
if (typeof module !== 'undefined') module.exports = PortfolioWorkbook;
