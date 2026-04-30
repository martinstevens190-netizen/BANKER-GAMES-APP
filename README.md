# Banker Lab Pro

Mobile-first live odds scanner for daily 3-5 odds banker sets.

## What this app does

- Connects to The Odds API through a Netlify Function.
- Scans upcoming global fixtures inside your selected time window.
- Ranks banker candidates using odds zone, implied probability, bookmaker depth, price spread, market type, kickoff window and lower-league weighting.
- Builds Set A, Set B and an ultra lean set from qualified candidates.
- Shows closest candidates separately when no full banker grade is reached.
- Saves settings on the device.

## Netlify environment variables

Add these in Netlify under Site configuration > Environment variables:

```env
ODDS_API_KEY=your_real_key_here
ODDS_REGION=au,uk,eu,us
ODDS_MARKETS=h2h
APP_TIMEZONE=Australia/Melbourne
SCAN_WINDOW_HOURS=24
MAX_SPORTS_TO_SCAN=65
```

Make sure `ODDS_API_KEY` applies to Functions scope, then trigger a fresh deploy.

## Netlify settings

```text
Build command: npm run build
Publish directory: .
Functions directory: netlify/functions
```

## Test links after deploy

```text
/api/status
/api/scan?windowHours=24&riskProfile=balanced&leaguePreference=lower-first&sportsScope=global
```

## Important

No betting app can guarantee outcomes. This app is designed to avoid forcing weak picks and to separate near-miss candidates from qualified banker profiles.
