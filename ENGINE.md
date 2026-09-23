# Paper portfolio calculation engine

The engine is implemented, tested, and wired to the dashboard's Google Sheets source mode. The read-only Google connection requires the one-time setup in [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md). Refresh then reads the workbook and recalculates every dashboard view. Illustrative sample mode is still available separately.

Run the purchase → settlement → coupon → partial sale demonstration:

```sh
node examples/run-ledger.cjs
```

All example securities, marks and cash flows are illustrative test data. They are not inserted into the live workbook.

## Inputs and use

`ledger.js` exports `PortfolioLedger.calculate(input)` in Node and defines `PortfolioLedger` when loaded in a browser. The input is plain JSON containing `asOf`, `settings`, `securities`, `trades`, `marks`, and `cashFlows`. See `examples/paper-ledger.json` for a complete example. Each calculation rebuilds from the supplied records without changing them or using the system clock.

```js
const engine = require('./ledger.js');
const workbook = require('./workbook.js');
// tabs is a map of tab names to row arrays, with workbook row 5 first.
const input = workbook.fromWorkbook(tabs, '2026-09-17');
const result = engine.calculate(input);
```

The adapter supports the existing five tab names and header labels, including their required-field asterisks. Fetch **unformatted numeric values** and **serial-number dates** from Sheets; ISO dates also work. Do not pass formatted currency, percentages, or locale date strings. Read from row 5 through the last input row, including all columns; formula/reference columns are ignored. Missing headers, duplicate IDs, incomplete executed records, and inconsistent input types fail the calculation. Proposed and cancelled records never affect balances. Executed trades dated after the valuation date are excluded.

**Bond accrued interest:** Trades now has `Execution accrued per 100` in column Q, with validation and an updated row check. It is the actual accrued interest paid/received at execution, per $100 par, separate from the clean execution price. Enter an explicit zero where appropriate. The engine rejects executed bond trades without this value. Marks has `Accrued per 100`, also required for held bonds; its row check now flags missing values. Trade-date execution accrued interest and valuation-date accrued interest are distinct inputs.

## Calculation conventions

- USD, long-only Treasury bonds/bills, corporate bonds, and ETFs. Bonds use par and prices per 100; ETFs use shares and prices per share.
- Executed trades affect holdings on trade date. Cash moves on settlement date. Until settlement, buys produce liabilities and sells produce receivables. An unusually large sale fee can instead create a payable.
- Trades are ordered by trade date, then their original workbook row order. Same-day ordering determines FIFO lots. Do not reorder same-day executed rows without intending to change that sequence.
- Bond consideration is `par × (clean price + execution accrued per 100) / 100`. Purchase fees increase cost basis; sale fees reduce proceeds. Settlement amounts are rounded to cents per trade.
- Sales remove FIFO lot cost, including acquired accrued interest and purchase fees. Realized gain is net proceeds minus that cost; unrealized gain is dirty market value minus remaining cost. These are **dirty-price gains**, not separate clean-price performance attribution.
- Bond market value includes supplied mark accrued interest. ETF market value is shares × mark. The latest mark on/before valuation is selected; older marks produce a stale warning. Future marks are never used. Missing prices or bond accrued interest stop valuation.
- NAV is market value + settled cash + unsettled receivables − unsettled liabilities.
- Explicit coupon, distribution and interest receipts count as income. Financing costs count as expenses. Contributions and withdrawals change capital, not P&L. Cash Flows must not duplicate trade settlements or fees. `Other` requires classification before calculation.
- Total P&L is realized gain + unrealized gain + income − expenses. It must reconcile to NAV − opening cash − net contributions, within half a cent before presentation rounding. Internal lot arithmetic retains precision; displayed totals round to cents.
- Duration/DV01 and spread-duration/SDV01 use supplied analytics, not a pricing model. Missing required analytics or credit ratings result in `UNKNOWN` risk checks. Treasury spread duration defaults to zero. YTM and YTW remain distinct supplied fields.
- Corporate issuer limits aggregate by exact issuer text, so maintain consistent issuer names. Unrated credit exposure makes high-yield and below-BB checks unknown. ETF classification relies on supplied spread duration and rating.
- Cash is a floor; other risk limits are ceilings. Breaches are strictly outside the limit; WATCH starts at 85% of a ceiling or within the matching buffer above a cash floor. A zero cash floor disables the check. Negative cash is preserved and flagged when the floor is enabled; it is not silently funded.
- Unpermitted holdings remain valued and generate breaches. Changing settings rebuilds the simulation; initial capital and inception are not later cash-flow adjustments. Records before inception are rejected. Keep dated copies of approved inputs for reproducible presentations.

## Deliberate limits of this first version

Futures, short positions, FX, automatic coupon schedules, accrued-interest/day-count calculation, principal redemption, corporate actions, pending non-trade income receivables, and time-weighted/money-weighted returns are not implemented. Futures fail explicitly even if permitted in settings. Matured holdings warn that redemption needs processing; the engine does not invent redemption entries. Record actual sourced cash receipts and marks rather than estimated payments.

The settings input is one complete snapshot, not a historical schedule. A future-effective Limits row is rejected by the adapter. Changing setup values intentionally restates the simulation. The engine is not an immutable trade journal or a multiuser approval system. The existing sample dashboard's legacy notional futures hedge is not an engine input.

## Verified example

Starting with $10,000, buy 1,000 par at 99 clean + 1 accrued, paying $2 fees. Collect a $20 coupon, then sell 400 par at 102 clean + 0.1 accrued, paying $1 fees. Mark the remaining 600 par at the same dirty price.

At September 17, before the sale settles: cash $9,018; receivable $407.40; holdings $612.60; NAV **$10,038**. Realized gain is $6.60, unrealized gain $11.40, and income $20: total P&L **$38**. After settlement, cash becomes $9,425.40 and NAV is unchanged.

## Next integration work

1. Complete the user's Google Web client setup and actual sign-in test. The read-only transport, source controls, and engine-derived dashboard views are implemented and tested with simulated Google responses; the actual workbook also passes adapter/engine checks through the connected account.
2. Add genuine saved observations for performance/history; do not substitute the demonstration series.

Checks: `node tests/ledger.test.cjs`, `node tests/sheets.test.cjs`, `node tests/settings.test.cjs`, and `node tests/portfolio.test.cjs`.
