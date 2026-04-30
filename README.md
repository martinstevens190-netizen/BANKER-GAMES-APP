# Banker Lab Pro

Mobile-first daily 3-5 odds banker scanner for global football fixtures.

## Deploy on Netlify

1. Upload the contents of this folder to GitHub.
2. Import the repository into Netlify.
3. Use these build settings:
   - Build command: `npm run build`
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
4. Add site environment variables:

```env
ODDS_API_KEY=your_real_api_key_here
ODDS_REGION=au
ODDS_MARKETS=h2h,totals
APP_TIMEZONE=Australia/Melbourne
SCAN_WINDOW_HOURS=12
```

The scanner also recognises `SPORTS_API_KEY`, `THE_ODDS_API_KEY`, or `ODDS_API_TOKEN`, but `ODDS_API_KEY` is the recommended name.

## After adding variables

Trigger a fresh Production deploy in Netlify. Then test:

- `/api/status` should show `configured: true`
- `/api/scan` should show `configured: true`

The app never exposes the API key to the browser. It only checks whether a key exists inside the Netlify Function.

## Notes

No betting model can guarantee outcomes. The app ranks lower-variance candidates from available odds data and applies strict filters for safer accumulator building.
