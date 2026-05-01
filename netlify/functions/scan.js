const API_BASE = process.env.SPORTS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
const API_KEY = process.env.ODDS_API_KEY || process.env.SPORTS_API_KEY || process.env.THE_ODDS_API_KEY || process.env.ODDS_API_TOKEN || '';
const REGION_RAW = process.env.ODDS_REGION || process.env.ODDS_PRIMARY_REGION || 'au';
const MARKETS_RAW = process.env.ODDS_MARKETS || 'h2h';
const TIMEZONE = process.env.APP_TIMEZONE || 'Australia/Melbourne';
const MAX_EVENT_SPORTS = Math.min(70, Math.max(8, Number(process.env.MAX_EVENT_SPORTS_TO_SCAN || process.env.MAX_SPORTS_TO_SCAN || 42)));
const MAX_ODDS_SPORTS = Math.min(24, Math.max(4, Number(process.env.MAX_ODDS_SPORTS_TO_SCAN || 12)));
const FETCH_TIMEOUT_MS = Math.min(9000, Math.max(2500, Number(process.env.FETCH_TIMEOUT_MS || 5200)));

const VALID_REGIONS = new Set(['au', 'uk', 'eu', 'us', 'us2']);
const VALID_MARKETS = new Set(['h2h', 'spreads', 'totals']);

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

function parseList(value, fallback, allowed) {
  const parts = String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .filter(item => !allowed || allowed.has(item));
  return parts.length ? Array.from(new Set(parts)) : fallback;
}

const REGION_LIST = parseList(REGION_RAW, ['au'], VALID_REGIONS);
const MARKET_LIST = parseList(MARKETS_RAW, ['h2h'], VALID_MARKETS);

function configStatus(extra = {}) {
  return {
    configured: Boolean(API_KEY),
    detectedVariable: process.env.ODDS_API_KEY ? 'ODDS_API_KEY' : process.env.SPORTS_API_KEY ? 'SPORTS_API_KEY' : process.env.THE_ODDS_API_KEY ? 'THE_ODDS_API_KEY' : process.env.ODDS_API_TOKEN ? 'ODDS_API_TOKEN' : null,
    region: REGION_LIST.join(','),
    markets: MARKET_LIST.join(','),
    timezone: TIMEZONE,
    maxEventSportsToScan: MAX_EVENT_SPORTS,
    maxOddsSportsToScan: MAX_ODDS_SPORTS,
    generatedAt: new Date().toISOString(),
    ...extra
  };
}

function text(value = '') {
  return String(value || '').toLowerCase();
}

function isLowerLeague(value = '') {
  return /npl|division|league one|league two|league 1|league 2|regional|state|first|second|third|championship|national league|serie c|serie d|segunda|primera b|liga 2|liga ii|eerste|2\. bundesliga|ligue 2|u19|u20|u21|u23|youth|reserve|reserves|j2|j3|k league 2|women|superettan|usl|a-league women|wsl/i.test(value);
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
  if (/soccer/.test(label)) score += sportsScope === 'global' ? 65 : 95;
  if (/basketball|tennis|rugby|cricket|volleyball|handball|netball/.test(label)) score += 34;
  if (/baseball|icehockey|mma|boxing|aussierules/.test(label)) score += 16;
  if (isLowerLeague(label)) score += 34;
  if (/premier league|champions league|nba|nfl|mlb|nhl|ufc/.test(label)) score -= 8;
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
  if (riskProfile === 'strict') return { floor: 84, minOdds: 1.10, maxOdds: 1.76, watchFloor: 72 };
  if (riskProfile === 'wide') return { floor: 68, minOdds: 1.06, maxOdds: 2.50, watchFloor: 58 };
  return { floor: 74, minOdds: 1.08, maxOdds: 2.18, watchFloor: 63 };
}

function apiUsage(headers = {}) {
  return {
    remaining: headers['x-requests-remaining'] || null,
    used: headers['x-requests-used'] || null,
    last: headers['x-requests-last'] || null
  };
}

function describeApiError(result) {
  const data = result.data || {};
  const code = data.error_code || data.code || '';
  const detail = data.message || data.error || (typeof data === 'string' ? data : '');
  if (result.status === 401 || result.status === 403 || /INVALID_KEY|DEACTIVATED_KEY|MISSING_KEY/i.test(code)) {
    return 'The odds API key was detected but the provider rejected it. Check the key value and subscription.';
  }
  if (result.status === 429 || /EXCEEDED_FREQ_LIMIT/i.test(code)) {
    return 'The provider rate-limited the scanner. Wait a minute, then run again. This version uses fewer odds calls.';
  }
  if (result.status === 402 || /OUT_OF_USAGE_CREDITS/i.test(code)) {
    return 'The provider says the monthly usage credits are used up. Check the account portal or reduce scan frequency.';
  }
  if (/INVALID_REGION/i.test(code)) return 'One of the bookmaker regions is invalid. Use au, uk, eu, us, or us2.';
  if (/INVALID_MARKET/i.test(code)) return 'One of the market keys is invalid for this endpoint. Use h2h first for the safest setup.';
  return detail ? `Provider response ${result.status}: ${detail}` : `Provider response ${result.status}.`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw || 'null'); } catch (_) { data = raw; }
    return { ok: response.ok, status: response.status, data, headers: Object.fromEntries(response.headers.entries()) };
  } catch (error) {
    return { ok: false, status: 0, data: { message: error.name === 'AbortError' ? 'Request timed out' : error.message }, headers: {} };
  } finally {
    clearTimeout(timeout);
  }
}

function buildEventsUrl(sportKey, commenceFrom, commenceTo) {
  const params = new URLSearchParams({
    apiKey: API_KEY,
    dateFormat: 'iso',
    commenceTimeFrom: commenceFrom,
    commenceTimeTo: commenceTo
  });
  return `${API_BASE}/sports/${sportKey}/events?${params.toString()}`;
}

function buildOddsUrl(sportKey, market, commenceFrom, commenceTo, region) {
  const params = new URLSearchParams({
    apiKey: API_KEY,
    regions: region,
    markets: market,
    oddsFormat: 'decimal',
    dateFormat: 'iso',
    commenceTimeFrom: commenceFrom,
    commenceTimeTo: commenceTo
  });
  return `${API_BASE}/sports/${sportKey}/odds/?${params.toString()}`;
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function preflightEvents(sports, fromIso, toIso, now, windowEnd) {
  const selected = sports.slice(0, MAX_EVENT_SPORTS);
  const checks = await mapLimit(selected, 6, async sport => {
    const result = await fetchJson(buildEventsUrl(sport.key, fromIso, toIso));
    const events = Array.isArray(result.data) ? result.data : [];
    const valid = events.filter(item => {
      const kickoff = new Date(item.commence_time);
      return Number.isFinite(kickoff.getTime()) && kickoff > now && kickoff <= windowEnd;
    });
    return {
      sport,
      status: result.status,
      ok: result.ok,
      count: valid.length,
      usage: apiUsage(result.headers),
      events: valid
    };
  });
  return checks.filter(Boolean);
}

async function fetchOddsForSport(sport, fromIso, toIso, preferredRegions, preferredMarkets) {
  const attempts = [];
  let lastUsage = {};
  for (const region of preferredRegions) {
    for (const market of preferredMarkets) {
      const result = await fetchJson(buildOddsUrl(sport.key, market, fromIso, toIso, region));
      const count = Array.isArray(result.data) ? result.data.length : 0;
      lastUsage = apiUsage(result.headers);
      attempts.push({ sport: sport.key, title: sport.title, region, markets: market, status: result.status, count, usage: lastUsage });
      if (!result.ok) {
        const message = describeApiError(result);
        return { events: [], attempts, marketsUsed: market, regionUsed: region, error: message, status: result.status, usage: lastUsage };
      }
      if (count > 0) return { events: result.data, attempts, marketsUsed: market, regionUsed: region, usage: lastUsage };
    }
  }
  return { events: [], attempts, marketsUsed: preferredMarkets.join(','), regionUsed: preferredRegions.join(','), usage: lastUsage };
}

async function fetchUpcomingFallback(fromIso, toIso, now, windowEnd) {
  const attempts = [];
  for (const region of REGION_LIST.slice(0, 2)) {
    const result = await fetchJson(buildOddsUrl('upcoming', 'h2h', fromIso, toIso, region));
    const count = Array.isArray(result.data) ? result.data.length : 0;
    const usage = apiUsage(result.headers);
    attempts.push({ sport: 'upcoming', title: 'Upcoming cross-sport fallback', region, markets: 'h2h', status: result.status, count, usage });
    if (!result.ok) return { events: [], attempts, error: describeApiError(result), usage };
    if (count > 0) {
      const valid = result.data.filter(item => {
        const kickoff = new Date(item.commence_time);
        return Number.isFinite(kickoff.getTime()) && kickoff > now && kickoff <= windowEnd;
      });
      return { events: valid, attempts, usage };
    }
  }
  return { events: [], attempts, usage: {} };
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
  const marketKeys = MARKET_LIST.includes('h2h') ? ['h2h', ...MARKET_LIST.filter(item => item !== 'h2h')] : MARKET_LIST;
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
    const consensusBoost = Math.min(9, Math.max(0, books - 1) * 1.65);
    const gapBoost = outcome.marketKey === 'h2h' ? Math.min(11, favouriteGap * 8.5) : 0;
    const lowerBoost = lower ? 4.5 : 0;
    const spreadPenalty = Math.min(10, spread * 8.5);
    const pricePenalty = medOdds > 2.12 ? 8 : medOdds > 1.90 ? 5 : medOdds > 1.68 ? 2.5 : 0;
    const marketBoost = outcome.marketKey === 'h2h' ? 3 : outcome.marketKey === 'totals' ? 1 : 0;
    const confidence = Math.round(Math.max(44, Math.min(96, implied + consensusBoost + gapBoost + lowerBoost + marketBoost - spreadPenalty - pricePenalty)));

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
      reason: `Ranked from ${books} bookmaker${books === 1 ? '' : 's'}, median odds ${medOdds.toFixed(2)}, market spread ${spread.toFixed(2)} and ${lower ? 'lower-league weighting' : 'stability checks'}.`
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
    if (!API_KEY) {
      return json(200, configStatus({ status: 'missing-key', message: 'No odds API key detected.' }));
    }
    const sportsResponse = await fetchJson(`${API_BASE}/sports/?apiKey=${API_KEY}`);
    if (!sportsResponse.ok) {
      return json(200, configStatus({
        status: 'needs-attention',
        message: describeApiError(sportsResponse),
        apiUsage: apiUsage(sportsResponse.headers)
      }));
    }
    return json(200, configStatus({
      status: 'ready',
      message: 'Scanner route is ready. Run a scan to check fixtures and odds.',
      activeSports: Array.isArray(sportsResponse.data) ? sportsResponse.data.filter(item => item.active !== false).length : 0,
      apiUsage: apiUsage(sportsResponse.headers)
    }));
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
      return json(200, configStatus({
        status: 'needs-attention',
        picks: [],
        watchlist: [],
        scannedEvents: 0,
        sportsScanned: 0,
        sportsWithFixtures: 0,
        message: describeApiError(sportsResponse),
        apiUsage: apiUsage(sportsResponse.headers)
      }));
    }

    const allSports = Array.isArray(sportsResponse.data) ? sportsResponse.data : [];
    const sports = allSports
      .filter(item => item.active !== false)
      .filter(item => sportAllowed(item, sportsScope))
      .sort((a, b) => sportPriority(b, sportsScope) - sportPriority(a, sportsScope));

    const eventChecks = await preflightEvents(sports, fromIso, toIso, now, windowEnd);
    const sportsWithEvents = eventChecks
      .filter(item => item.ok && item.count > 0)
      .sort((a, b) => {
        const lowerA = isLowerLeague(`${a.sport.key} ${a.sport.title}`) ? 5 : 0;
        const lowerB = isLowerLeague(`${b.sport.key} ${b.sport.title}`) ? 5 : 0;
        return (sportPriority(b.sport, sportsScope) + lowerB + Math.min(8, b.count)) - (sportPriority(a.sport, sportsScope) + lowerA + Math.min(8, a.count));
      })
      .slice(0, MAX_ODDS_SPORTS);

    const events = [];
    const attempts = [];
    const eventsBySport = [];
    const marketsUsed = new Set();
    const regionsUsed = new Set();
    let lastApiUsage = apiUsage(sportsResponse.headers);
    let providerMessage = '';

    const oddsMarketOrder = MARKET_LIST.includes('h2h') ? ['h2h', ...MARKET_LIST.filter(item => item !== 'h2h')] : MARKET_LIST;
    const regionOrder = REGION_LIST.length > 1 ? [REGION_LIST[0], ...REGION_LIST.slice(1, 3)] : REGION_LIST;

    for (const check of sportsWithEvents) {
      const result = await fetchOddsForSport(check.sport, fromIso, toIso, regionOrder, oddsMarketOrder);
      attempts.push(...result.attempts);
      if (result.usage) lastApiUsage = result.usage;
      if (result.error) {
        providerMessage = result.error;
        break;
      }
      if (result.marketsUsed) marketsUsed.add(result.marketsUsed);
      if (result.regionUsed) regionsUsed.add(result.regionUsed);
      const valid = result.events
        .map(item => ({ ...item, sport_title: check.sport.title, sport_key: check.sport.key }))
        .filter(item => {
          const kickoff = new Date(item.commence_time);
          return Number.isFinite(kickoff.getTime()) && kickoff > now && kickoff <= windowEnd;
        });
      if (valid.length) {
        events.push(...valid);
        eventsBySport.push({ key: check.sport.key, title: check.sport.title, count: valid.length });
      }
      if (events.length >= 120 && riskProfile !== 'wide') break;
    }

    if (!events.length && !providerMessage) {
      const fallback = await fetchUpcomingFallback(fromIso, toIso, now, windowEnd);
      attempts.push(...fallback.attempts);
      if (fallback.usage) lastApiUsage = fallback.usage;
      if (fallback.error) providerMessage = fallback.error;
      if (fallback.events.length) {
        events.push(...fallback.events.map(item => ({ ...item, sport_title: item.sport_title || 'Upcoming global', sport_key: item.sport_key || 'upcoming' })));
        eventsBySport.push({ key: 'upcoming', title: 'Upcoming global fallback', count: fallback.events.length });
        marketsUsed.add('h2h');
        regionsUsed.add(REGION_LIST[0]);
      }
    }

    if (providerMessage) {
      return json(200, configStatus({
        status: 'needs-attention',
        picks: [],
        watchlist: [],
        scannedEvents: events.length,
        sportsScanned: eventChecks.length,
        sportsWithFixtures: sportsWithEvents.length,
        minimumScore: settings.floor,
        watchFloor: settings.watchFloor,
        oddsZone: `${settings.minOdds.toFixed(2)}-${settings.maxOdds.toFixed(2)}`,
        regionsUsed: [...regionsUsed].join(',') || REGION_LIST[0],
        apiUsage: lastApiUsage,
        attempts: attempts.slice(0, 40),
        message: providerMessage
      }));
    }

    const allCandidates = [];
    for (const eventItem of events) allCandidates.push(...eventCandidates(eventItem, settings));

    const bestPerMarket = Array.from(new Map(allCandidates.map(item => [item.id, item])).values());
    const qualified = rankList(bestPerMarket.filter(item => item.confidence >= settings.floor), leaguePreference).slice(0, 24);
    const watchlist = rankList(bestPerMarket.filter(item => item.confidence >= settings.watchFloor && item.confidence < settings.floor), leaguePreference).slice(0, 18);

    const message = events.length === 0
      ? `${eventChecks.length} sport routes checked and ${sportsWithEvents.length} had fixtures, but no odds were returned for the selected regions and window.`
      : qualified.length === 0
        ? `${events.length} fixtures checked. No candidate reached the banker floor, so closest candidates are separated for review.`
        : `${events.length} fixtures checked. ${qualified.length} qualified candidate${qualified.length === 1 ? '' : 's'} found.`;

    return json(200, configStatus({
      status: 'ready',
      picks: qualified,
      watchlist,
      scannedEvents: events.length,
      sportsScanned: eventChecks.length,
      sportsWithFixtures: sportsWithEvents.length,
      minimumScore: settings.floor,
      watchFloor: settings.watchFloor,
      oddsZone: `${settings.minOdds.toFixed(2)}-${settings.maxOdds.toFixed(2)}`,
      markets: [...marketsUsed].join(',') || oddsMarketOrder.join(','),
      regionsUsed: [...regionsUsed].join(',') || REGION_LIST[0],
      apiUsage: lastApiUsage,
      eventsBySport,
      attempts: attempts.slice(0, 40),
      message
    }));
  } catch (error) {
    return json(200, configStatus({
      status: 'needs-attention',
      picks: [],
      watchlist: [],
      scannedEvents: 0,
      sportsScanned: 0,
      sportsWithFixtures: 0,
      message: error.message || 'Scanner error. Check Netlify function logs for this deploy.'
    }));
  }
};
