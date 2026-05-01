const APP_VERSION = '7.0.0';

const state = {
  configured: false,
  connected: false,
  loading: false,
  scanned: false,
  picks: [],
  watchlist: [],
  saved: [],
  lastPayload: {},
  lastError: '',
  lastRoute: 'checking',
  lastActionAt: null
};

const els = {
  connectionChip: document.getElementById('connectionChip'),
  scanNow: document.getElementById('scanNow'),
  testConnection: document.getElementById('testConnection'),
  refreshTop: document.getElementById('refreshTop'),
  windowHours: document.getElementById('windowHours'),
  riskProfile: document.getElementById('riskProfile'),
  leaguePreference: document.getElementById('leaguePreference'),
  sportsScope: document.getElementById('sportsScope'),
  heroScore: document.getElementById('heroScore'),
  qualifiedCount: document.getElementById('qualifiedCount'),
  checkedCount: document.getElementById('checkedCount'),
  setAOdds: document.getElementById('setAOdds'),
  lastUpdated: document.getElementById('lastUpdated'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptyCopy: document.getElementById('emptyCopy'),
  emptyMeta: document.getElementById('emptyMeta'),
  qualifiedCards: document.getElementById('qualifiedCards'),
  watchlistHead: document.getElementById('watchlistHead'),
  watchlistCards: document.getElementById('watchlistCards'),
  accaCards: document.getElementById('accaCards'),
  pickTemplate: document.getElementById('pickTemplate'),
  accaTemplate: document.getElementById('accaTemplate'),
  minimumScore: document.getElementById('minimumScore'),
  oddsZone: document.getElementById('oddsZone'),
  marketList: document.getElementById('marketList'),
  sportsScanned: document.getElementById('sportsScanned'),
  sportsWithGames: document.getElementById('sportsWithGames'),
  scannerStatus: document.getElementById('scannerStatus'),
  scannerMessage: document.getElementById('scannerMessage'),
  regionsUsed: document.getElementById('regionsUsed'),
  apiCredits: document.getElementById('apiCredits'),
  providerStatus: document.getElementById('providerStatus'),
  lastAction: document.getElementById('lastAction'),
  routeStatus: document.getElementById('routeStatus'),
  debugOutput: document.getElementById('debugOutput'),
  runFeedback: document.getElementById('runFeedback'),
  toast: document.getElementById('toast'),
  clearSaved: document.getElementById('clearSaved')
};

const settingsKey = 'bankerLabProSettingsV7';
const savedKey = 'bankerLabProSavedScansV7';

function setText(el, value) {
  if (el) el.textContent = value;
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 3600);
}

function updateRunFeedback(message) {
  setText(els.runFeedback, message);
  setText(els.lastAction, message.length > 28 ? `${message.slice(0, 28)}…` : message);
}

function saveSettings() {
  const settings = {
    windowHours: els.windowHours?.value || '24',
    riskProfile: els.riskProfile?.value || 'balanced',
    leaguePreference: els.leaguePreference?.value || 'lower-first',
    sportsScope: els.sportsScope?.value || 'global'
  };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    if (settings.windowHours && els.windowHours) els.windowHours.value = settings.windowHours;
    if (settings.riskProfile && els.riskProfile) els.riskProfile.value = settings.riskProfile;
    if (settings.leaguePreference && els.leaguePreference) els.leaguePreference.value = settings.leaguePreference;
    if (settings.sportsScope && els.sportsScope) els.sportsScope.value = settings.sportsScope;
    state.saved = JSON.parse(localStorage.getItem(savedKey) || '[]');
  } catch (_) {
    state.saved = [];
  }
}

function scoreFloor() {
  if (els.riskProfile?.value === 'strict') return 84;
  if (els.riskProfile?.value === 'wide') return 68;
  return 74;
}

function oddsZone() {
  if (els.riskProfile?.value === 'strict') return { min: 1.10, max: 1.76 };
  if (els.riskProfile?.value === 'wide') return { min: 1.06, max: 2.50 };
  return { min: 1.08, max: 2.18 };
}

function formatOdds(value) {
  const number = Number(value || 0);
  return number > 0 ? number.toFixed(2) : '--';
}

function formatUpdated(value) {
  if (!value) return 'Not scanned yet';
  return `Updated ${new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne'
  }).format(new Date(value))}`;
}

function formatLastAction() {
  if (!state.lastActionAt) return 'Not run';
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne'
  }).format(new Date(state.lastActionAt));
}

function normalisePick(item = {}) {
  return {
    id: item.id || `${item.match || ''}-${item.market || ''}`,
    match: item.match || 'Upcoming fixture',
    league: item.league || 'Global market',
    market: item.market || 'Market lean',
    odds: Number(item.odds || 0),
    confidence: Number(item.confidence || 0),
    kickoff: item.kickoff || 'Upcoming Melbourne time',
    model: item.model || 'Scanner ranked',
    tag: item.tag || 'Qualified',
    reason: item.reason || 'Ranked from live odds profile, bookmaker depth, price gap, kickoff window and league preference.',
    sportKey: item.sportKey || ''
  };
}

function statusLabel(status) {
  if (status === 'ready') return 'Connected';
  if (status === 'missing-key') return 'Missing key';
  if (status === 'key-rejected') return 'Key rejected';
  if (status === 'quota-limited') return 'Quota limited';
  if (status === 'needs-attention') return 'Needs attention';
  if (status === 'route-error') return 'Route issue';
  if (status === 'scanning') return 'Scanning';
  return 'Checking';
}

function setConnection(payload = {}) {
  const configured = Boolean(payload.configured);
  const status = payload.status || 'unknown';
  state.configured = configured;
  state.connected = configured && status === 'ready';
  document.body.classList.toggle('is-connected', state.connected);
  document.body.classList.toggle('is-error', ['needs-attention', 'error', 'key-rejected', 'quota-limited', 'route-error'].includes(status));

  let chipText = 'API key not detected';
  if (state.connected) chipText = 'Live scanner connected';
  else if (status === 'key-rejected') chipText = 'API key rejected';
  else if (status === 'quota-limited') chipText = 'API quota limited';
  else if (configured) chipText = 'Scanner needs attention';

  const strong = els.connectionChip?.querySelector('strong');
  if (strong) strong.textContent = chipText;
  setText(els.scannerStatus, statusLabel(status));
  setText(els.providerStatus, payload.providerStatusCode ? `${payload.providerStatusCode}` : statusLabel(status));
}

function setLoading(value) {
  state.loading = value;
  document.body.classList.toggle('is-loading', value);
  if (els.scanNow) {
    els.scanNow.disabled = value;
    els.scanNow.textContent = value ? 'Scanning…' : 'Run scan';
  }
  if (els.refreshTop) els.refreshTop.disabled = value;
  if (els.testConnection) els.testConnection.disabled = value;
}

function emptyStateContent() {
  const status = state.lastPayload.status || '';
  if (state.loading) {
    return {
      title: 'Scanning live markets',
      copy: 'Checking upcoming fixtures, bookmaker depth, market prices and lower-league edges now.',
      meta: ['Live route', 'Please wait']
    };
  }
  if (!state.configured) {
    return {
      title: 'API key not detected',
      copy: 'Add ODDS_API_KEY to this Netlify site with Functions scope, then redeploy. The app shell is ready, but live ranking needs the key.',
      meta: ['ODDS_API_KEY', 'Functions scope']
    };
  }
  if (status === 'key-rejected') {
    return {
      title: 'API key rejected',
      copy: 'The scanner route is working and the key reached the function, but the odds provider rejected the value. Re-copy the key value only, confirm the subscription is active, then redeploy.',
      meta: ['Key reached function', 'Provider denied']
    };
  }
  if (status === 'quota-limited') {
    return {
      title: 'API quota limited',
      copy: 'The scanner route is working, but the provider says usage is limited. Reduce scan frequency or check the provider account usage page.',
      meta: ['Route healthy', 'Quota check']
    };
  }
  if (state.lastError) {
    return {
      title: 'Scanner needs attention',
      copy: state.lastError,
      meta: ['Review details', 'Check provider']
    };
  }
  if (state.scanned && state.picks.length === 0 && state.watchlist.length > 0) {
    return {
      title: 'No full banker grade yet',
      copy: 'Fixtures were checked, but none reached the selected banker score. The closest candidates are shown below for review instead of forcing a weak pick.',
      meta: [`${state.watchlist.length} close candidates`, `${state.lastPayload.scannedEvents || 0} fixtures checked`]
    };
  }
  if (state.scanned && state.picks.length === 0) {
    return {
      title: 'No playable banker profile found',
      copy: state.lastPayload.message || 'The provider returned no usable fixtures for this sport, region and window. Try 24–48 hours, football-first, or a wider profile.',
      meta: [`${state.lastPayload.scannedEvents || 0} fixtures checked`, `${state.lastPayload.sportsScanned || 0} sports scanned`]
    };
  }
  return {
    title: 'Ready to scan',
    copy: 'Tap Run scan to check upcoming games and build today’s 3–5 odds sets.',
    meta: ['Manual scan', 'Lower-league priority']
  };
}

function renderEmpty(show) {
  if (!els.emptyState) return;
  els.emptyState.classList.toggle('hidden', !show);
  if (!show) return;
  const content = emptyStateContent();
  setText(els.emptyTitle, content.title);
  setText(els.emptyCopy, content.copy);
  if (els.emptyMeta) {
    els.emptyMeta.innerHTML = '';
    content.meta.forEach(text => {
      const item = document.createElement('span');
      item.textContent = text;
      els.emptyMeta.appendChild(item);
    });
  }
}

function renderPick(container, pick) {
  const node = els.pickTemplate.content.cloneNode(true);
  node.querySelector('.tag').textContent = pick.tag;
  node.querySelector('.score').textContent = `${Math.round(pick.confidence)}%`;
  node.querySelector('.match').textContent = pick.match;
  node.querySelector('.league').textContent = pick.league;
  node.querySelector('.market').textContent = pick.market;
  node.querySelector('.odds').textContent = formatOdds(pick.odds);
  node.querySelector('.kickoff').textContent = pick.kickoff;
  node.querySelector('.model').textContent = pick.model;
  node.querySelector('.reason').textContent = pick.reason;
  container.appendChild(node);
}

function rankPicks(list) {
  const lowerFirst = els.leaguePreference?.value === 'lower-first';
  const topLean = els.leaguePreference?.value === 'top-stability';
  return [...list].sort((a, b) => {
    const lowerA = /lower|tier|division|league one|league two|regional|npl|serie c|liga 2|championship/i.test(`${a.league} ${a.tag}`) ? 4 : 0;
    const lowerB = /lower|tier|division|league one|league two|regional|npl|serie c|liga 2|championship/i.test(`${b.league} ${b.tag}`) ? 4 : 0;
    if (lowerFirst) return (b.confidence + lowerB) - (a.confidence + lowerA);
    if (topLean) return (b.confidence - lowerB / 2) - (a.confidence - lowerA / 2);
    return b.confidence - a.confidence;
  });
}

function buildSet(name, picks, targetMin, targetMax, offset = 0) {
  const usedMatches = new Set();
  const legs = [];
  let odds = 1;
  const candidates = picks.slice(offset).concat(picks.slice(0, offset));
  for (const pick of candidates) {
    if (legs.length >= 5 || odds >= targetMin) break;
    if (usedMatches.has(pick.match) && picks.length > 4) continue;
    const nextOdds = odds * Number(pick.odds || 1);
    if (legs.length >= 2 && nextOdds > targetMax + 0.65) continue;
    legs.push(pick);
    usedMatches.add(pick.match);
    odds = nextOdds;
  }
  return { name, odds: legs.length ? odds : 0, legs };
}

function renderAccas() {
  const picks = rankPicks(state.picks).slice(0, 14);
  const sets = [
    buildSet('Set A · safest build', picks, 3.0, 5.2, 0),
    buildSet('Set B · alternate build', picks, 3.0, 5.2, 2),
    buildSet('Ultra lean · 1–2 bankers', picks.slice(0, 4), 1.55, 2.75, 0)
  ];

  if (!els.accaCards) return;
  els.accaCards.innerHTML = '';
  sets.forEach((set, index) => {
    const node = els.accaTemplate.content.cloneNode(true);
    node.querySelector('h4').textContent = set.name;
    node.querySelector('strong').textContent = formatOdds(set.odds);
    const list = node.querySelector('ol');
    if (set.legs.length) {
      set.legs.forEach(leg => {
        const item = document.createElement('li');
        item.textContent = `${leg.market} · ${leg.match} @ ${formatOdds(leg.odds)}`;
        list.appendChild(item);
      });
    } else {
      const item = document.createElement('li');
      item.textContent = state.configured ? 'Run a scan or widen the profile to build this set.' : 'Connect live data to build this set.';
      list.appendChild(item);
    }
    node.querySelector('p').textContent = index === 2
      ? 'Lowest variance shortlist for a safer single or double lean.'
      : 'Built from the highest ranked legs while avoiding repeated games where possible.';
    els.accaCards.appendChild(node);
    if (index === 0) setText(els.setAOdds, formatOdds(set.odds));
  });
}

function debugSummary(payload = {}) {
  const safe = {
    appVersion: APP_VERSION,
    route: state.lastRoute,
    status: payload.status || 'unknown',
    configured: Boolean(payload.configured),
    detectedVariable: payload.detectedVariable || null,
    providerStatusCode: payload.providerStatusCode || null,
    providerCode: payload.providerCode || null,
    scannedEvents: payload.scannedEvents || 0,
    sportsScanned: payload.sportsScanned || 0,
    sportsWithFixtures: payload.sportsWithFixtures || 0,
    activeSports: payload.activeSports || null,
    regionsUsed: payload.regionsUsed || payload.region || null,
    markets: payload.markets || null,
    apiUsage: payload.apiUsage || null,
    message: payload.message || ''
  };
  return JSON.stringify(safe, null, 2);
}

function render() {
  const qualified = rankPicks(state.picks).filter(p => p.confidence >= scoreFloor());
  const watchlist = rankPicks(state.watchlist).filter(p => !qualified.some(q => q.id === p.id)).slice(0, 9);

  if (els.qualifiedCards) {
    els.qualifiedCards.innerHTML = '';
    qualified.forEach(pick => renderPick(els.qualifiedCards, pick));
  }

  const showWatchlist = watchlist.length > 0;
  els.watchlistHead?.classList.toggle('hidden', !showWatchlist);
  els.watchlistCards?.classList.toggle('hidden', !showWatchlist);
  if (els.watchlistCards) {
    els.watchlistCards.innerHTML = '';
    watchlist.forEach(pick => renderPick(els.watchlistCards, pick));
  }

  const top = qualified[0];
  const checked = Number(state.lastPayload.scannedEvents || 0);
  const score = top ? Math.round(top.confidence) : null;
  setText(els.heroScore, score ? `${score}` : '--');
  document.body.style.setProperty('--score-angle', `${score || 0}%`);
  document.body.classList.toggle('has-picks', Boolean(qualified.length));
  setText(els.qualifiedCount, qualified.length);
  setText(els.checkedCount, checked);
  setText(els.lastUpdated, formatUpdated(state.lastPayload.generatedAt));

  setText(els.minimumScore, `${scoreFloor()}%`);
  const zone = oddsZone();
  setText(els.oddsZone, `${zone.min.toFixed(2)}–${zone.max.toFixed(2)}`);
  setText(els.marketList, state.lastPayload.markets || state.lastPayload.marketsRequested || 'h2h');
  setText(els.regionsUsed, state.lastPayload.regionsUsed || state.lastPayload.region || 'au');
  const usage = state.lastPayload.apiUsage || {};
  setText(els.apiCredits, usage.remaining ? `${usage.remaining} left` : 'Not reported');
  setText(els.sportsScanned, Number(state.lastPayload.sportsScanned || 0));
  setText(els.sportsWithGames, Number(state.lastPayload.sportsWithFixtures || 0));
  setText(els.routeStatus, state.lastRoute === 'function' ? 'Direct' : state.lastRoute === 'api' ? 'API' : state.lastRoute === 'missing' ? 'Missing' : 'Checking');
  setText(els.lastAction, formatLastAction());
  setText(els.scannerMessage, state.lastPayload.message || 'The app will never force a banker when the selected window does not produce a strong enough profile.');
  setText(els.debugOutput, debugSummary(state.lastPayload));

  renderEmpty(qualified.length === 0);
  renderAccas();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    const raw = await response.text();
    let payload = {};
    try { payload = JSON.parse(raw || '{}'); } catch (_) { payload = { message: raw || 'Unexpected scanner response' }; }
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

function buildQuery(params = {}) {
  const query = new URLSearchParams(params);
  return query.toString() ? `?${query.toString()}` : '';
}

async function callScanner(endpoint, params = {}) {
  const query = buildQuery(params);
  const routes = [`/api/${endpoint}${query}`, `/.netlify/functions/scan${endpoint === 'status' ? '?status=1' : query}`];
  let lastFailure = null;

  for (const route of routes) {
    try {
      const { response, payload } = await fetchWithTimeout(route);
      if (response.ok && !(typeof payload === 'string')) {
        state.lastRoute = route.startsWith('/api/') ? 'api' : 'function';
        return payload;
      }
      lastFailure = payload?.message || `Scanner route returned ${response.status}`;
    } catch (error) {
      lastFailure = error.name === 'AbortError' ? 'Scanner request timed out.' : error.message;
    }
  }

  state.lastRoute = 'missing';
  const error = new Error(lastFailure || 'The scanner route is not responding.');
  error.payload = {
    configured: false,
    status: 'route-error',
    message: 'The scanner route is not responding. Confirm netlify.toml and netlify/functions/scan.js are deployed from GitHub, then clear cache and redeploy.'
  };
  throw error;
}

async function checkStatus(showResult = false) {
  if (showResult) {
    setLoading(true);
    updateRunFeedback('Testing connection…');
  }
  try {
    const payload = await callScanner('status');
    state.lastPayload = { ...state.lastPayload, ...payload };
    state.lastError = '';
    state.lastActionAt = new Date().toISOString();
    setConnection(payload);
    if (showResult) showToast(payload.message || 'Connection test complete.');
  } catch (error) {
    const payload = error.payload || {};
    state.lastPayload = { ...payload, generatedAt: new Date().toISOString() };
    state.lastError = payload.message || 'The live scanner route is not responding yet. Check that netlify/functions/scan.js deployed, then redeploy from GitHub.';
    state.lastActionAt = new Date().toISOString();
    setConnection({ configured: false, status: 'route-error' });
    if (showResult) showToast('Scanner route is not responding yet.');
  } finally {
    if (showResult) setLoading(false);
    render();
  }
}

async function runScan(event) {
  event?.preventDefault?.();
  setLoading(true);
  saveSettings();
  state.lastError = '';
  state.lastActionAt = new Date().toISOString();
  updateRunFeedback('Running live scan…');
  state.lastPayload = { ...state.lastPayload, status: 'scanning', message: 'Running live scan…', generatedAt: new Date().toISOString() };
  setConnection({ ...state.lastPayload, configured: state.configured, status: 'scanning' });
  render();

  try {
    const payload = await callScanner('scan', {
      windowHours: els.windowHours?.value || '24',
      riskProfile: els.riskProfile?.value || 'balanced',
      leaguePreference: els.leaguePreference?.value || 'lower-first',
      sportsScope: els.sportsScope?.value || 'global'
    });
    state.scanned = true;
    state.lastPayload = payload;
    state.lastError = payload.status && payload.status !== 'ready' ? payload.message || '' : '';
    state.picks = Array.isArray(payload.picks) ? payload.picks.map(normalisePick) : [];
    state.watchlist = Array.isArray(payload.watchlist) ? payload.watchlist.map(normalisePick) : [];
    setConnection(payload);

    if (payload.status === 'ready') {
      if (state.picks.length) {
        showToast(`${state.picks.length} qualified candidate${state.picks.length === 1 ? '' : 's'} found.`);
      } else if (state.watchlist.length) {
        showToast('No full banker grade, closest candidates loaded.');
      } else {
        showToast('Scan completed. No playable banker profile found.');
      }
    } else {
      showToast(payload.message || 'Scanner needs attention.');
    }

    if (state.picks.length) {
      state.saved.unshift({ at: payload.generatedAt, picks: state.picks.slice(0, 8) });
      state.saved = state.saved.slice(0, 8);
      localStorage.setItem(savedKey, JSON.stringify(state.saved));
    }
  } catch (error) {
    const payload = error.payload || {};
    state.scanned = true;
    state.lastPayload = { ...payload, generatedAt: new Date().toISOString() };
    state.lastError = payload.message || error.message || 'Scanner unavailable. Check Netlify logs and API settings.';
    state.picks = [];
    state.watchlist = [];
    setConnection({ configured: Boolean(payload.configured), status: payload.status || 'needs-attention' });
    showToast(state.lastError);
  } finally {
    setLoading(false);
    render();
    document.getElementById('bankers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

[els.windowHours, els.riskProfile, els.leaguePreference, els.sportsScope].forEach(control => {
  control?.addEventListener('change', () => {
    saveSettings();
    render();
  });
});

els.scanNow?.addEventListener('click', runScan);
els.refreshTop?.addEventListener('click', runScan);
els.testConnection?.addEventListener('click', () => checkStatus(true));
els.clearSaved?.addEventListener('click', () => {
  state.saved = [];
  localStorage.removeItem(savedKey);
  showToast('Saved scan history cleared.');
});

document.querySelectorAll('.bottom-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.bottom-nav a').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js?v=7').catch(() => {}));
}

loadSettings();
setConnection({ configured: false, status: 'unknown' });
render();
checkStatus(false);
