/* Read-only Google Sheets transport. Tokens stay in memory, never in URLs/storage. */
const GoogleSheetsPortfolio = (() => {
  const spreadsheetId = '1rDNKCVAT1ScLunbd5nRpUf6dY3KdDOIR8Jf38Sq_EIA';
  const scope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const columns = {Trades:'Q', Securities:'N', Marks:'O', 'Cash Flows':'J', Limits:'G'};
  function create({fetchImpl = (...args) => fetch(...args), now = () => Date.now(), oauth = () => globalThis.google?.accounts?.oauth2} = {}) {
    let token = '', expires = 0, generation = 0;
    function disconnect() { token = ''; expires = 0; generation++; }
    function authorized() { return Boolean(token) && now() < expires; }
    function authorize(clientId) {
      if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) return Promise.reject(Error('Paste a valid Google Web application client ID.'));
      const api = oauth();
      if (!api) return Promise.reject(Error('Google sign-in has not loaded. Check your connection or browser blocker and retry.'));
      disconnect(); const attempt = generation;
      return new Promise((resolve, reject) => {
        const client = api.initTokenClient({client_id:clientId, scope, include_granted_scopes:false,
          callback:response => {
            if (attempt !== generation) return reject(Error('Connection cancelled.'));
            if (response.error || !response.access_token) return reject(Error('Google authorization was declined or failed. Please connect again.'));
            if (!api.hasGrantedAllScopes(response, scope)) return reject(Error('Read access to Google Sheets is required. Please connect again.'));
            token = response.access_token; expires = now() + Math.max(0, Number(response.expires_in) - 60) * 1000;
            if (!authorized()) { disconnect(); return reject(Error('Google returned an expired authorization. Please reconnect.')); }
            resolve();
          }, error_callback:() => reject(Error('Google sign-in was closed or blocked. Allow the popup and try again.'))});
        client.requestAccessToken({prompt:'select_account'});
      });
    }
    async function read({signal} = {}) {
      if (!authorized()) { disconnect(); throw Error('Connect Google Sheets to authorize reading the workbook.'); }
      const currentToken = token, attempt = generation;
      async function get(url) {
        const response = await fetchImpl(url, {headers:{Authorization:'Bearer '+currentToken}, cache:'no-store', signal});
        if (attempt !== generation) throw Error('Connection changed. Refresh again.');
        if (!response.ok) {
          if (response.status === 401) { disconnect(); throw Error('Google authorization expired. Connect again.'); }
          if (response.status === 403) throw Error('Google denied access. Check workbook access, enable the Sheets API, and check your Google organization restrictions.');
          if (response.status === 404) throw Error('The portfolio workbook was not found for this Google account.');
          if (response.status === 429) throw Error('Google is temporarily limiting requests. Wait a moment and refresh.');
          throw Error('Google Sheets request failed (HTTP '+response.status+').');
        }
        return response.json();
      }
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const metadata = await get(base+'?fields=spreadsheetId,properties(title),sheets(properties(title,gridProperties))');
      if (metadata.spreadsheetId !== spreadsheetId) throw Error('Unexpected workbook returned by Google.');
      const params = new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE', dateTimeRenderOption:'SERIAL_NUMBER', majorDimension:'ROWS'});
      for (const [name, lastColumn] of Object.entries(columns)) {
        const props = metadata.sheets?.find(s => s.properties?.title === name)?.properties;
        if (!props) throw Error(`Workbook tab missing: ${name}`);
        const rows = props.gridProperties?.rowCount;
        if (!Number.isInteger(rows) || rows < 5 || rows > 10000) throw Error(`${name}: expected 5–10,000 sheet rows; no rows were silently skipped.`);
        // Read every existing row, including outside the formatted table, so inputs cannot disappear.
        params.append('ranges', `'${name}'!A5:${lastColumn}${rows}`);
      }
      const payload = await get(base+'/values:batchGet?'+params);
      if (payload.spreadsheetId !== spreadsheetId || payload.valueRanges?.length !== 5) throw Error('Google returned an incomplete workbook.');
      const tabs = {};
      Object.keys(columns).forEach((name, i) => {
        const block = payload.valueRanges[i];
        const actualName = block.range?.split('!')[0].replace(/^'|'$/g, '');
        if (actualName !== name || !Array.isArray(block.values) || !block.values.length) throw Error(`Missing or mismatched data for ${name}`);
        tabs[name] = block.values;
      });
      return {tabs, source:{spreadsheetId, title:metadata.properties.title, readAt:new Date(now()).toISOString()}};
    }
    return {authorize, authorized, disconnect, read};
  }
  return {create, spreadsheetId, scope};
})();
if (typeof module !== 'undefined') module.exports = GoogleSheetsPortfolio;
