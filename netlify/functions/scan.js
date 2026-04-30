const API_BASE = process.env.SPORTS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
const API_KEY = process.env.ODDS_API_KEY || process.env.SPORTS_API_KEY || process.env.THE_ODDS_API_KEY || process.env.ODDS_API_TOKEN || '';
const REGION = process.env.ODDS_REGION || 'au,uk,eu,us';
const MARKETS = process.env.ODDS_MARKETS || 'h2h';
const TIMEZONE = process.env.APP_TIMEZONE || 'Australia/Melbourne';
const MAX_SPORTS = Math.min(90, Math.max(8, Number(process.env.MAX_SPORTS_TO_SCAN || 65)));

const responseHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function json(statusCode, body) {
  return { statusCode, headers: responseHeaders, body: JSON.stringify(body) };
}

function configStatus(extra = {}) {
  return {
    configured: Boolean(API_KEY),
    detectedVariable: process.env.ODDS_API_KEY ? 'ODDS_API_KEY' : process.env.SPORTS_API_KEY ? 'SPORTS_API_KEY' : process.env.THE_ODDS_API_KEY ? 'THE_ODDS_API_KEY' : process.env.ODDS_API_TOKEN ? 'ODDS_API_TOKEN' : null,
    region: REGION,
    markets: MARKETS,
    timezone: TIMEZONE,
    maxSportsToScan: MAX_SPORTS,
    generatedAt: new Date().toISOString(),
    ...extra
  };
}

function text(value = '') {
  return String(value || '').toLowerCase();
}

function isLowerLeague(value = '') {
  return /npl|division|league one|league two|league 1|league 2|regional|state|first|second|third|championship|national league|serie c|serie d|segunda|primera b|liga 2|liga ii|eerste|2\. bundesliga|ligue 2|u19|u20|u21|u23|youth|reserve|reserves|j2|j3|k league 2|women/i.test(value);
}

function sportAllowed(sport, sportsScope) {
  const label = text(`${sport.key || ''} ${sport.group || ''} ${sport.title || ''}`);
  if (/outrights|winner|politics|awards|esports|fantasy|specials|novelty/i.test(label)) return false;
  if (sportsScope === 'football-only') return /soccer/.test(label);
  if (sportsScope === 'football-first') return /soccer|rugby|basketball|tennis|cricket|aussierules|volleyball|handball|netball/i.test(label);
  return /soccer|basketball|tennis|rugby|cricket|aussierules|volleyball|handball|netball|baseball|icehockey|mma|boxing/i.test(label);
}

function sportPriority(sport, sportsScope) {
  const label = text(`${sport.key || ''} ${sport.group || ''} ${sport.title || ''}`);
  let score = 0;
  if (/soccer/.test(label)) score += sportsScope === 'global' ? 60 : 90;
  if (/basketball|tennis|rugby|cricket|volleyball|handball|netball/.test(label)) score += 38;
  if (/baseball|icehockey|mma|boxing|aussierules/.test(label)) score += 18;
  if (isLowerLeague(label)) score += 30;
  if (/premier league|champions league|nba|nfl|mlb|nhl|ufc/.test(label)) score -= 7;
  return score;
}

function formatKickoff(dateString) {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return 'Upcoming Melbourne time';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function impliedProbability(odds) {
  const value = Number(odds || 0);
  return value > 1 ? 100 / value : 0;
}

function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function mean(values) {
  const list = values.filter(Number.isFinite);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
}

function priceSpread(values) {
  const list = values.filter(Number.isFinite);
  if (list.length < 2) return 0;
  return Math.max(...list) - Math.min(...list);
}

function riskSettings(riskProfile) {
  if (riskProfile === 'strict') return { floor: 84, minOdds: 1.12, maxOdds: 1.78, watchFloor: 72 };
  if (riskProfile === 'wide') return { floor: 68, minOdds: 1.08, maxOdds: 2.35, watchFloor: 60 };
  return { floor: 76, minOdds: 1.10, maxOdds: 2.05, watchFloor: 64 };
}

async function fetchJson(url) {
  const response = await fetch(url);
  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw || 'null'); } catch (_) { data = raw; }
  return { ok: response.ok, status: response.status, data, headers: Object.fromEntries(response.headers.entries()) };
}

function buildOddsUrl(sportKey, markets, commenceFrom, commenceTo, region = REGION) {
  const params = new URLSearchParams({
    apiKey: API_KEY,
    regions: region,
    markets,
    oddsFormat: 'decimal',
    dateFormat: 'iso',
    commenceTimeFrom: commenceFrom,
    commenceTimeTo: commenceTo
  });
  return `${API_BASE}/sports/${sportKey}/odds/?${params.toString()}`;
}

async function fetchOddsForSport(sport, fromIso, toIso) {
  const attempts = [];
  const marketOptions = Array.from(new Set([MARKETS, 'h2h', 'h2h,totals', 'h2h,spreads'].filter(Boolean)));
  const regionOptions = Array.from(new Set([REGION, 'au,uk,eu,us', 'au', 'uk,eu,us'].filter(Boolean)));

  for (const region of regionOptions) {
    for (const markets of marketOptions) {
      const url = buildOddsUrl(sport.key, markets, fromIso, toIso, region);
      const result = await fetchJson(url);
      const count = Array.isArray(result.data) ? result.data.length : 0;
      attempts.push({ sport: sport.key, title: sport.title, region, markets, status: result.status, count });
      if (result.ok && count > 0) return { events: result.data, attempts, marketsUsed: markets };
      if (result.ok && count === 0) break;
    }
  }
  return { events: [], attempts, marketsUsed: MARKETS };
}

function collectMarketOutcomes(event, marketKey) {
  const bucket = new Map();
  for (const bookmaker of event.bookmakers || []) {
    const market = (bookmaker.markets || []).find(item => item.key === marketKey);
    if (!market) continue;
    for (const outcome of market.outcomes || []) {
      const label = `${market.key}:${outcome.name}:${outcome.point || ''}`;
      const existing = bucket.get(label) || { marketKey: market.key, name: outcome.name, point: outcome.point, prices: [], bookmakers: 0 };
      const price = Number(outcome.price || 0);
      if (price > 1) existing.prices.push(price);
      existing.bookmakers += 1;
      bucket.set(label, existing);
    }
  }
  return [...bucket.values()];
}

function marketLabel(outcome) {
  if (outcome.marketKey === 'h2h') return `${outcome.name} · result`;
  if (outcome.marketKey === 'totals') return `${outcome.name} ${outcome.point || ''} total`.trim();
  if (outcome.marketKey === 'spreads') return `${outcome.name} ${outcome.point || ''} spread`.trim();
  return outcome.name;
}

function modelLabel(marketKey) {
  if (marketKey === 'h2h') return 'Result model';
  if (marketKey === 'totals') return 'Totals model';
  if (marketKey === 'spreads') return 'Spread model';
  return 'Market model';
}

function eventCandidates(event, settings) {
  const marketKeys = ['h2h', 'totals', 'spreads'];
  const all = [];
  for (const key of marketKeys) all.push(...collectMarketOutcomes(event, key));
  if (!all.length) return [];

  const homeAway = collectMarketOutcomes(event, 'h2h');
  const sortedH2h = homeAway
    .map(item => ({ ...item, med: median(item.prices) }))
    .filter(item => item.med > 1)
    .sort((a, b) => a.med - b.med);
  const favouriteGap = sortedH2h.length >= 2 ? Math.max(0, sortedH2h[1].med - sortedH2h[0].med) : 0;
  const lower = isLowerLeague(`${event.sport_title || ''} ${event.sport_key || ''}`);
  const sportText = `${event.sport_title || 'Global'}${lower ? ' · lower-league profile' : ''}`;

  return all.map(outcome => {
    const medOdds = median(outcome.prices);
    const avgOdds = mean(outcome.prices);
    const spread = priceSpread(outcome.prices);
    if (!medOdds || medOdds < settings.minOdds || medOdds > settings.maxOdds) return null;

    const implied = impliedProbability(medOdds);
    const books = outcome.bookmakers || outcome.prices.length;
    const consensusBoost = Math.min(8, Math.max(0, books - 1) * 1.5);
    const gapBoost = outcome.marketKey === 'h2h' ? Math.min(10, favouriteGap * 8) : 0;
    const lowerBoost = lower ? 4 : 0;
    const spreadPenalty = Math.min(9, spread * 8);
    const pricePenalty = medOdds > 2.05 ? 7 : medOdds > 1.85 ? 4 : medOdds > 1.65 ? 2 : 0;
    const marketBoost = outcome.marketKey === 'h2h' ? 3 : outcome.marketKey === 'totals' ? 1 : 0;
    const confidence = Math.round(Math.max(45, Math.min(96, implied + consensusBoost + gapBoost + lowerBoost + marketBoost - spreadPenalty - pricePenalty)));

    return {
      id: `${event.id || event.home_team}-${event.away_team}-${outcome.marketKey}-${outcome.name}-${outcome.point || ''}`,
      match: `${event.home_team || 'Home'} vs ${event.away_team || 'Away'}`,
      league: sportText,
      market: marketLabel(outcome),
      odds: Number(avgOdds || medOdds).toFixed(3),
      confidence,
      kickoff: formatKickoff(event.commence_time),
      model: modelLabel(outcome.marketKey),
      tag: confidence >= settings.floor ? (lower ? 'Lower-tier banker' : 'Qualified banker') : 'Closest watch',
      sportKey: event.sport_key || '',
      reason: `Live ranking using ${books} bookmaker${books === 1 ? '' : 's'}, median odds ${medOdds.toFixed(2)}, price spread ${spread.toFixed(2)} and ${lower ? 'lower-league weighting' : 'market stability checks'}.`
    };
  }).filter(Boolean);
}

function rankList(list, leaguePreference) {
  return [...list].sort((a, b) => {
    const lowerA = isLowerLeague(`${a.league} ${a.sportKey}`) ? 4 : 0;
    const lowerB = isLowerLeague(`${b.league} ${b.sportKey}`) ? 4 : 0;
    if (leaguePreference === 'lower-first') return (b.confidence + lowerB) - (a.confidence + lowerA);
    if (leaguePreference === 'top-stability') return (b.confidence - lowerB / 2) - (a.confidence - lowerA / 2);
    return b.confidence - a.confidence;
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: responseHeaders, body: '' };

  const path = event.path || event.rawUrl || '';
  if (path.includes('/status')) {
    return json(200, configStatus({ status: API_KEY ? 'ready' : 'missing-key', message: API_KEY ? 'Scanner route is ready.' : 'No odds API key detected.' }));
  }

  if (!API_KEY) {
    return json(200, configStatus({
      status: 'missing-key',
      picks: [],
      watchlist: [],
      scannedEvents: 0,
      sportsScanned: 0,
      sportsWithFixtures: 0,
      message: 'No odds API key detected. Add ODDS_API_KEY in Netlify with Functions scope, then redeploy.'
    }));
  }

  try {
    const query = event.queryStringParameters || {};
    const windowHours = Math.min(48, Math.max(1, Number(query.windowHours || process.env.SCAN_WINDOW_HOURS || 24)));
    const riskProfile = query.riskProfile || 'balanced';
    const leaguePreference = query.leaguePreference || 'lower-first';
    const sportsScope = query.sportsScope || 'global';
    const settings = riskSettings(riskProfile);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    const fromIso = now.toISOString();
    const toIso = windowEnd.toISOString();

    const sportsResponse = await fetchJson(`${API_BASE}/sports/?apiKey=${API_KEY}`);
    if (!sportsResponse.ok) {
      const message = sportsResponse.status === 401 || sportsResponse.status === 403
        ? 'The odds API key was detected but rejected by the provider. Check the key value, plan and account access.'
        : `Sports API returned ${sportsResponse.status}.`;
      return json(502, configStatus({ status: 'error', picks: [], watchlist: [], scannedEvents: 0, sportsScanned: 0, sportsWithFixtures: 0, message }));
    }

    const allSports = Array.isArray(sportsResponse.data) ? sportsResponse.data : [];
    const sports = allSports
      .filter(item => item.active !== false)
      .filter(item => sportAllowed(item, sportsScope))
      .sort((a, b) => sportPriority(b, sportsScope) - sportPriority(a, sportsScope))
      .slice(0, MAX_SPORTS);

    const events = [];
    const attempts = [];
    const eventsBySport = [];
    const marketsUsed = new Set();

    for (const sport of sports) {
      const result = await fetchOddsForSport(sport, fromIso, toIso);
      attempts.push(...result.attempts);
      if (result.marketsUsed) marketsUsed.add(result.marketsUsed);
      const valid = result.events
        .map(item => ({ ...item, sport_title: sport.title, sport_key: sport.key }))
        .filter(item => {
          const kickoff = new Date(item.commence_time);
          return Number.isFinite(kickoff.getTime()) && kickoff > now && kickoff <= windowEnd;
        });
      if (valid.length) {
        events.push(...valid);
        eventsBySport.push({ key: sport.key, title: sport.title, count: valid.length });
      }
      if (events.length >= 140 && riskProfile !== 'wide') break;
    }

    const allCandidates = [];
    for (const eventItem of events) allCandidates.push(...eventCandidates(eventItem, settings));

    const bestPerMarket = Array.from(new Map(allCandidates.map(item => [item.id, item])).values());
    const qualified = rankList(bestPerMarket.filter(item => item.confidence >= settings.floor), leaguePreference).slice(0, 24);
    const watchlist = rankList(bestPerMarket.filter(item => item.confidence >= settings.watchFloor && item.confidence < settings.floor), leaguePreference).slice(0, 18);

    const message = events.length === 0
      ? 'The live route is connected, but the provider returned zero fixtures for the selected scope, region and window before any banker filters were applied.'
      : qualified.length === 0
        ? `${events.length} fixtures checked. No candidate reached the selected banker floor, so the closest candidates are separated for review.`
        : `${events.length} fixtures checked. ${qualified.length} qualified candidate${qualified.length === 1 ? '' : 's'} found.`;

    return json(200, configStatus({
      status: 'ready',
      picks: qualified,
      watchlist,
      scannedEvents: events.length,
      sportsScanned: sports.length,
      sportsWithFixtures: eventsBySport.length,
      minimumScore: settings.floor,
      watchFloor: settings.watchFloor,
      oddsZone: `${settings.minOdds.toFixed(2)}-${settings.maxOdds.toFixed(2)}`,
      markets: [...marketsUsed].join(',') || MARKETS,
      eventsBySport,
      attempts: attempts.slice(0, 35),
      message
    }));
  } catch (error) {
    return json(502, configStatus({
      status: 'error',
      picks: [],
      watchlist: [],
      scannedEvents: 0,
      sportsScanned: 0,
      sportsWithFixtures: 0,
      message: error.message || 'Scanner error.'
    }));
  }
};
