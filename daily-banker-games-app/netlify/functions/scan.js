const API_BASE = process.env.SPORTS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
const API_KEY = process.env.ODDS_API_KEY || process.env.SPORTS_API_KEY || process.env.THE_ODDS_API_KEY || process.env.ODDS_API_TOKEN || '';
const REGION = process.env.ODDS_REGION || 'au';
const MARKETS = process.env.ODDS_MARKETS || 'h2h,totals';
const TIMEZONE = process.env.APP_TIMEZONE || 'Australia/Melbourne';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}

function envStatus() {
  return {
    source: 'status',
    configured: Boolean(API_KEY),
    detectedVariable: process.env.ODDS_API_KEY ? 'ODDS_API_KEY' : process.env.SPORTS_API_KEY ? 'SPORTS_API_KEY' : process.env.THE_ODDS_API_KEY ? 'THE_ODDS_API_KEY' : process.env.ODDS_API_TOKEN ? 'ODDS_API_TOKEN' : null,
    region: REGION,
    markets: MARKETS,
    timezone: TIMEZONE,
    generatedAt: new Date().toISOString()
  };
}

function formatKickoff(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Upcoming Melbourne time';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short'
  }).format(date);
}

function impliedProbability(decimalOdds) {
  return decimalOdds > 1 ? Math.round((1 / decimalOdds) * 100) : 0;
}

function isLowerLeague(title = '') {
  return /npl|division|league one|league two|regional|premier league 2|first|second|third|u21|u23|state|serie c|serie d|segunda|primera b|championship|national league|liga 2|liga ii/i.test(title);
}

function modelLabel(marketKey) {
  if (marketKey === 'h2h') return 'Result safety';
  if (marketKey === 'totals') return 'Goal band';
  return 'Market model';
}

function marketName(market, outcome) {
  if (market.key === 'h2h') return `${outcome.name} · 1X2 lean`;
  if (market.key === 'totals') return `${outcome.name} ${market.point || ''} Goals`.trim();
  return outcome.name;
}

function rankOutcome(event, market, outcome) {
  const odds = Number(outcome.price || 0);
  if (!odds || odds < 1.18 || odds > 1.9) return null;

  const implied = impliedProbability(odds);
  const lower = isLowerLeague(event.sport_title);
  const lowerBoost = lower ? 5 : 0;
  const totalsBoost = market.key === 'totals' ? 2 : 0;
  const pricePenalty = odds > 1.72 ? 3 : odds > 1.58 ? 1 : 0;
  const confidence = Math.min(96, Math.max(70, implied + lowerBoost + totalsBoost - pricePenalty));

  return {
    match: `${event.home_team} vs ${event.away_team}`,
    league: `${event.sport_title}${lower ? ' · lower-league edge' : ''}`,
    market: marketName(market, outcome),
    odds,
    confidence,
    kickoff: formatKickoff(event.commence_time),
    model: modelLabel(market.key),
    tag: lower ? 'LOWER TIER' : 'QUALIFIED',
    reason: `Ranked using implied probability, price range, kickoff window and ${lower ? 'lower-league edge weighting' : 'market safety profile'}.`
  };
}

exports.handler = async (event) => {
  const path = event.rawUrl || event.path || '';
  if (path.includes('/status')) {
    return json(200, envStatus());
  }

  if (!API_KEY) {
    return json(200, {
      ...envStatus(),
      source: 'configuration',
      requiresConfiguration: true,
      picks: [],
      scannedEvents: 0,
      message: 'No API key detected. Add ODDS_API_KEY to this Netlify site, then redeploy.'
    });
  }

  try {
    const query = event.queryStringParameters || {};
    const windowHours = Math.min(24, Math.max(1, Number(query.windowHours || process.env.SCAN_WINDOW_HOURS || 12)));
    const safetyMode = query.safetyMode || 'strict';
    const leagueBias = query.leagueBias || 'lower-first';
    const floor = safetyMode === 'strict' ? 88 : safetyMode === 'balanced' ? 84 : 80;
    const now = new Date();
    const windowEnd = new Date(Date.now() + windowHours * 60 * 60 * 1000);

    const sportsRes = await fetch(`${API_BASE}/sports/?apiKey=${API_KEY}`);
    if (!sportsRes.ok) {
      const message = sportsRes.status === 401 || sportsRes.status === 403
        ? 'The odds API key was detected but rejected. Check the key value and account access.'
        : `Sports API error ${sportsRes.status}`;
      throw new Error(message);
    }
    const sports = await sportsRes.json();
    const soccerSports = sports.filter(s => s.active && /^soccer_/i.test(s.key)).slice(0, 28);

    const events = [];
    await Promise.all(soccerSports.map(async (sport) => {
      const url = `${API_BASE}/sports/${sport.key}/odds/?apiKey=${API_KEY}&regions=${REGION}&markets=${encodeURIComponent(MARKETS)}&oddsFormat=decimal&dateFormat=iso`;
      const oddsRes = await fetch(url);
      if (!oddsRes.ok) return;
      const data = await oddsRes.json();
      data.forEach(item => {
        const kickoff = new Date(item.commence_time);
        if (kickoff > now && kickoff <= windowEnd) {
          events.push({ ...item, sport_title: sport.title });
        }
      });
    }));

    const picks = [];
    for (const game of events) {
      const primaryBookmaker = (game.bookmakers || [])[0];
      if (!primaryBookmaker) continue;
      for (const market of primaryBookmaker.markets || []) {
        for (const outcome of market.outcomes || []) {
          const pick = rankOutcome(game, market, outcome);
          if (pick && pick.confidence >= floor) picks.push(pick);
        }
      }
    }

    const deduped = Array.from(new Map(picks.map(p => [`${p.match}-${p.market}`, p])).values());
    deduped.sort((a, b) => {
      const lowerA = /LOWER|lower/i.test(`${a.league} ${a.tag}`) ? 6 : 0;
      const lowerB = /LOWER|lower/i.test(`${b.league} ${b.tag}`) ? 6 : 0;
      if (leagueBias === 'lower-first') return (b.confidence + lowerB) - (a.confidence + lowerA);
      return b.confidence - a.confidence;
    });

    return json(200, {
      source: 'api',
      configured: true,
      picks: deduped.slice(0, 14),
      generatedAt: new Date().toISOString(),
      scannedEvents: events.length,
      minimumScore: floor
    });
  } catch (error) {
    return json(502, {
      source: 'api',
      configured: Boolean(API_KEY),
      picks: [],
      scannedEvents: 0,
      message: error.message,
      generatedAt: new Date().toISOString()
    });
  }
};
