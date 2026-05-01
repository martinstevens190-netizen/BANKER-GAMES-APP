# Banker Lab Pro v7

Mobile-first live odds scanner for daily 3-5 odds banker sets.

## What changed in v7

- Run Scan now gives visible feedback immediately.
- Added Test Connection button.
- Added route fallback: the app tries `/api/scan`, then direct `/.netlify/functions/scan`.
- Added provider diagnostics so an API key problem does not look like a dead button.
- Added clearer scanner states: connected, missing key, key rejected, quota limited, route issue.
- Added cache-busting for `app.js` and `styles.css` so older phone cache does not keep stale code.
- Updated service worker cache to v7 with network-first loading.
- Clean production copy throughout the app.

## Recommended Netlify environment variables

Add these in Netlify under Site configuration > Environment variables:

```env
ODDS_API_KEY=your_real_key_value_only
ODDS_REGION=au
ODDS_MARKETS=h2h
APP_TIMEZONE=Australia/Melbourne
SCAN_WINDOW_HOURS=24
MAX_EVENT_SPORTS_TO_SCAN=42
MAX_ODDS_SPORTS_TO_SCAN=12
```

Important: the value for `ODDS_API_KEY` should be only the key itself. Do not paste `ODDS_API_KEY=` into the value box.

Make sure `ODDS_API_KEY` applies to Functions scope, then run:

```text
Deploys > Trigger deploy > Clear cache and deploy site
```

## Netlify settings

```text
Build command: npm run build
Publish directory: .
Functions directory: netlify/functions
```

## Self-check links after deploy

```text
/api/status
/api/scan?windowHours=24&riskProfile=balanced&leaguePreference=lower-first&sportsScope=global
/.netlify/functions/scan?status=1
```

If the app says `API key rejected`, the function is deployed and receiving a value, but the provider rejected the key. Re-copy the provider key value only, check the provider account/subscription, then clear cache and redeploy.

## Important

No betting app can guarantee outcomes. This app is designed to avoid forcing weak picks and to separate near-miss candidates from qualified banker profiles.
