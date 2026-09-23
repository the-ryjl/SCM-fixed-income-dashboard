# SCM Fixed Income & Credit

A paper-portfolio dashboard with two explicit sources: an illustrative snapshot, or a private Google Sheets workbook calculated by the trade-ledger engine. Live pricing and futures accounting are not connected. Google Sheets mode requires the one-time [Google authorization setup](GOOGLE-SHEETS-SETUP.md).

The trade-ledger engine is implemented and tested. See [ENGINE.md](ENGINE.md) for its conventions, workbook input contract, limitations, and the complete paper-trading demonstration. Selecting Google Sheets uses that engine across every tab; selecting the illustrative sample preserves the original snapshot workflow.

## Run locally

From this directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765. Opening `index.html` directly as a local file does not support the data fetch. Deploy all of the files below together to a static host when ready.

## Structure

- `index.html`: layout, styling and script loading.
- `data/portfolio.json`: dated positions/security records, marks, cash, curve, calendar, research, and observation history.
- `model.js`: pure validation, valuation, aggregate risk inputs and maturities.
- `app.js`: rendering, sorting, refresh, loading/error/staleness states.
- `settings.js`: browser-local settings, rule checks and settings history.
- `ledger.js`: trade-date holdings, FIFO cost, settlements, cash flows, NAV, P&L, and risk checks.
- `workbook.js`: converts the five workbook tabs into ledger inputs; no network access.
- `sheets.js`: read-only Google authorization and workbook transport, with in-memory tokens.
- `sheets-ui.js`: source selection, connection controls, transactional refresh and error retention.
- `paper-views.js`: workbook-derived views, separate from illustrative sample data.
- `examples/paper-ledger.json`: clearly labeled test data, separate from the dashboard and live workbook.

## Refresh

In sample mode, edit the data file and click Refresh. Each request bypasses the browser cache, times out after 10 seconds, validates a complete snapshot, then commits the calculated result. All data-dependent views are invalidated and rebuilt on display. A failed request or invalid payload retains the previous good snapshot and shows an error. An initial failure shows no portfolio values; sample Settings remains accessible. Sample Refresh preserves unsaved Settings form edits.

In Google Sheets mode, Refresh reads the five tabs, converts their values, calculates the ledger and commits all views together. It times out after 20 seconds. Shared settings come from Limits, and unavailable market/research/history feeds are explicitly shown as unavailable. The workbook is read-only to the dashboard. A failed refresh retains the last successful workbook calculation; switching sources or disconnecting clears the prior source's values. Setup and limitations are in [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md).

The loaded time is distinct from the source observation date. Snapshot/curve dates more than three calendar days old are flagged stale (a simple prototype policy, not a market holiday calendar); marks older than the snapshot are also flagged. Reloading old sample data does not make it current.

## Valuation and original reconciliation

- Bonds: par quantity × clean price / 100 + supplied accrued interest in dollars.
- ETFs: shares × price.
- NAV: summed position values + cash + other receivables − liabilities.
- Other receivables must exclude accrued interest already included in position values.
- Missing bond accrued interest is explicitly `null`; clean value is used with a provisional-NAV warning. It is not asserted to be zero.
- The legacy notional futures hedge has zero snapshot value and an approximate signed notional × duration × 0.0001 DV01. Contract sizing, margin and variation settlement are not implemented. Do not use it as actual futures accounting.
- The old position values total $85,049; plus $15,842 cash gives $100,891, $49 above the old $100,842 headline. No source record explains that difference, so no balancing adjustment was invented.
- Quantity/price calculations add $217.85 to the old market values. Largest correction: 5,100 par × 102 / 100 = $5,202 for the 30-year Treasury, versus the stored $5,000. Corrected invested value is $85,266.85 and provisional NAV is $101,108.85, before missing accrued interest and any unrecorded cash/settlement items.
- `legacy*` fields preserve the original inputs for audit, not calculation. Cash itself remains a supplied sample balance until a trade/cash-flow ledger is implemented.

## History and labels

The former synthetic NAV, benchmark and seeded 60D sparklines have been removed. `history` contains only supplied dated observations `{date, nav, source}`. Each position's `priceHistory` uses `{date, price, source}`. Dates must be chronological, unique and no later than the snapshot. No sample snapshots are automatically appended as genuine history. Zero/one observations show an empty state; two or more produce an actual-date chart. Absolute NAV is not a cash-flow-adjusted total return. Benchmark, daily P&L and YTD return remain unavailable until their required inputs and return engine exist.

YTM is explicitly a supplied measure for cash bonds, with a market-value-weighted bond-only aggregate. The original ETF yields had no identified convention and were removed. YTW is a separate nullable sourced field; it is never inferred from YTM. Price gain is a simple current-quantity mark-minus-entry estimate, excluding income, fees and accrued interest, not total P&L or lot accounting.

Scenarios use first-order DV01 only. Convexity is unavailable. Illustrative VaR uses assumed daily 7 bp rate and 8 bp spread volatility, zero correlation, normality and a 1.645 multiplier; it is not calibrated/backtested. Average rating is unavailable rather than hardcoded.

Maturity dates/years are explicit security records. Treasury dates were transcribed from the original sample names. Corporate bonds only supplied a year; no exact day was invented. The maturity wall sums par quantities. Only exact dates create calendar events; the false 2026 Treasury maturity was removed. Macro events, curve levels and archived research remain marked as unverified sample content.

## Settings and scope

Starting cash/inception are future simulation setup values and do not overwrite the supplied snapshot or its history. Permissions and risk limits apply immediately to current holdings; changing a permission flags holdings without deleting them. Limits are strict breaches outside the boundary. WATCH starts at 85% of a ceiling (or within the corresponding buffer above the cash floor). Zero ceilings prohibit exposure; a zero cash floor is disabled. Issuer risk aggregates by the security record's `issuer` field. Below-BB includes BB− and lower, correcting the old incomplete filter.

Sample settings are stored in the browser for this origin, with the last 20 saves. They are not shared analyst settings or an immutable audit trail. Google Sheets mode instead reads the shared Limits tab and presents it as read-only in the dashboard.

## Checks

```sh
node tests/settings.test.cjs
node tests/portfolio.test.cjs
node tests/ledger.test.cjs
node tests/sheets.test.cjs
node examples/run-ledger.cjs
```

Covers known valuation/reconciliation values, accrued interest and liabilities, dates and instrument conventions, duplicates and missing marks, par maturities, limit boundaries, empty holdings, all view renderers, refresh/recalculation, and invalid/offline refresh retaining the last good snapshot.
