# Banker Lab Pro

Mobile-first live odds scanner for daily 3-5 odds banker sets.

## What this app does

- Connects to The Odds API through a Netlify Function.
- Uses a smart scanner flow: active sports list, fixture preflight, then odds calls only for sports with games.
- Prioritises lower leagues only when their live profile is stronger than higher-tier games.
- Ranks banker candidates using odds zone, implied probability, bookmaker depth, price spread, market type and lower-league weighting.
- Builds Set A, Set B and an ultra lean set from qualified candidates.
- Shows closest candidates separately when no full banker grade is reached.
- Shows diagnostics for sports checked, sports with fixtures, regions used and API credits.

## Recommended Netlify environment variables

Add these in Netlify under Site configuration > Environment variables:

```env
ODDS_API_KEY=your_real_key_here
ODDS_REGION=au
ODDS_MARKETS=h2h
APP_TIMEZONE=Australia/Melbourne
SCAN_WINDOW_HOURS=24
MAX_EVENT_SPORTS_TO_SCAN=42
MAX_ODDS_SPORTS_TO_SCAN=12
```

You can add more regions later, for example `au,uk,eu,us`, but one region is better while confirming the scanner because each extra bookmaker region can increase API usage.

Make sure `ODDS_API_KEY` applies to Functions scope, then trigger a fresh deploy.

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
```

## Important

No betting app can guarantee outcomes. This app is designed to avoid forcing weak picks and to separate near-miss candidates from qualified banker profiles.
