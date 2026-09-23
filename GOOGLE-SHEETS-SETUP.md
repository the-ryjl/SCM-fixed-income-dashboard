# Connect your Google Sheets workbook

The code is ready. Your one-time Google authorization setup is the remaining step. No password, client secret, API key, service-account key, or public spreadsheet sharing is needed.

## 1. Create the Google project and enable Sheets

Sign in to [Google Cloud Console](https://console.cloud.google.com/) with your personal Google account, create/select a project named **SCM Paper Portfolio**, then open **APIs & Services → Library**. Find **Google Sheets API** and enable it.

## 2. Configure Google Auth Platform

Open **Google Auth Platform** in the same project. Complete the app setup/branding with the name **SCM Paper Portfolio**, your support email, and developer contact email.

Choose **External** with testing access. Add your personal Google account, which owns the new workbook, under **Audience → Test users**. Keep this in testing while preparing your professor demonstration. A university-only Internal client is not suitable for signing in with your personal account.

Under **Data Access**, add this scope:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

This scope grants read-only access to spreadsheets your account can access. The dashboard requests only the one configured portfolio workbook. It has no write operations. School-managed accounts may require administrator approval; an app error cannot bypass that restriction.

## 3. Create a Web application client

Open **Clients → Create client**, choose **Web application**, and name it **SCM Dashboard**. Under **Authorized JavaScript origins**, add:

```text
http://localhost
http://localhost:8765
```

For this browser token flow, leave redirect URIs empty. When you later host the dashboard, add its exact HTTPS origin too. Origins have no path or trailing slash. Use localhost in your browser, not 127.0.0.1, unless you separately register that origin.

Create the client and copy its **Client ID**, ending in `.apps.googleusercontent.com`. You do not need its client secret. Google's [client setup instructions](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) explain authorized origins and browser client IDs.

## 4. Open the dashboard and connect

From this project folder, start the existing local server:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the local dashboard](http://localhost:8765). Expand **Google Sheets connection**, paste the Client ID, and click **Connect Google Sheets**. Choose your personal Google account and approve the read-only permission. If you previously saved a university-only client ID, replace it with the client created above. Reload the dashboard after updating the project files so it uses the new workbook ID.

The dashboard switches to **Google Sheets workbook** after authorization. All tabs then use engine results or explicitly state that a feed is unavailable. Settings comes from the shared Limits tab; it cannot be overwritten by the browser's sample settings.

## 5. Check the opening balance

The dashboard now targets your [personal-account workbook](https://docs.google.com/spreadsheets/d/1rDNKCVAT1ScLunbd5nRpUf6dY3KdDOIR8Jf38Sq_EIA/edit). If you retained the template's empty ledger and provisional opening cash of **$97,800**, both cash and NAV should show **$97,800**.

Add a security in Securities, an executed trade in Trades, and a mark in Marks, then click **Refresh**. Bonds need accrued interest per 100 at execution (Trades Q) and valuation (Marks E), including explicit zero when appropriate. Proposed/cancelled trades do not affect holdings. Edit only the prepared entry rows 6–205 until workbook validation ranges are extended.

## What the connection does

- Reads all five tabs in one values request, with a preceding metadata check. Numerical values and date serials go through the workbook adapter and ledger engine. The reader includes all existing rows, up to 10,000 per tab, and fails rather than silently truncating a larger sheet. Avoid editing several related records during a refresh; Sheets is not an immutable transaction journal.
- Reads the prepared columns: Trades A:Q, Securities A:N, Marks A:O, Cash Flows A:J, Limits A:G. Keep those headers/column locations intact. Adjacent notes outside that schema are not engine inputs.
- Updates every dashboard tab only after the entire calculation succeeds. Failed reads or invalid executed trades preserve the last good result with an error message and read time. Selecting a different source clears the old source first.
- Keeps Google access tokens in page memory only; the public Client ID is saved locally. Disconnect clears the token and workbook display. It does not revoke the app's Google grant; you can revoke that in your Google Account permissions. Reloading or token expiry requires reconnection, consistent with Google's [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).
- Uses Refresh, not background polling. It does not publish the workbook, edit analyst entries, invent prices, create NAV history, or provide a live Treasury curve feed.

## If Google reports an error

- **origin_mismatch**: add the exact dashboard origin shown in your browser to the Web client's Authorized JavaScript origins.
- **access_denied**: add your account as a test user and check organization restrictions.
- **403 / denied access**: enable the Sheets API in the client project, grant Sheets read access, and use an account with access to the workbook.
- **Popup blocked / closed**: allow the Google popup and click Connect again.
- **Expired authorization**: click Connect again. The last valid calculation stays visible until a new one succeeds or you disconnect.

## Verification completed

The actual workbook was read through the existing connected Google account and passed the adapter and engine: $97,800 NAV, $97,800 cash, no positions. Transport and dashboard tests cover successful reads, invalid data, missing tabs, denied access, expired tokens, and retention of the last valid result. The dashboard's actual Google sign-in cannot be tested until you create the Web client above.
