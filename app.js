const state = {
  configured: false,
  connected: false,
  loading: false,
  scanned: false,
  picks: [],
  watchlist: [],
  saved: [],
  lastPayload: {},
  lastError: ''
};

const els = {
  connectionChip: document.getElementById('connectionChip'),
  scanNow: document.getElementById('scanNow'),
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
  clearSaved: document.getElementById('clearSaved')
};

const settingsKey = 'bankerLabProSettingsV6';
const savedKey = 'bankerLabProSavedScansV6';

function saveSettings() {
  const settings = {
    windowHours: els.windowHours.value,
    riskProfile: els.riskProfile.value,
    leaguePreference: els.leaguePreference.value,
    sportsScope: els.sportsScope.value
  };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    if (settings.windowHours) els.windowHours.value = settings.windowHours;
    if (settings.riskProfile) els.riskProfile.value = settings.riskProfile;
    if (settings.leaguePreference) els.leaguePreference.value = settings.leaguePreference;
    if (settings.sportsScope) els.sportsScope.value = settings.sportsScope;
    state.saved = JSON.parse(localStorage.getItem(savedKey) || '[]');
  } catch (_) {
    state.saved = [];
  }
}

function scoreFloor() {
  if (els.riskProfile.value === 'strict') return 84;
  if (els.riskProfile.value === 'wide') return 68;
  return 74;
}

function oddsZone() {
  if (els.riskProfile.value === 'strict') return { min: 1.10, max: 1.76 };
  if (els.riskProfile.value === 'wide') return { min: 1.06, max: 2.50 };
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

function setConnection(payload = {}) {
  const configured = Boolean(payload.configured);
  const status = payload.status || 'unknown';
  state.configured = configured;
  state.connected = configured && status === 'ready';
  document.body.classList.toggle('is-connected', state.connected);
  document.body.classList.toggle('is-error', status === 'needs-attention' || status === 'error');

  let chipText = 'API key not detected';
  let scannerText = 'Key missing';
  if (state.connected) {
    chipText = 'Live scanner connected';
    scannerText = 'Connected';
  } else if (configured && status === 'needs-attention') {
    chipText = 'Provider attention required';
    scannerText = 'Needs attention';
  } else if (configured) {
    chipText = 'Live route ready';
    scannerText = 'Ready';
  }

  els.connectionChip.querySelector('strong').textContent = chipText;
  els.scannerStatus.textContent = scannerText;
}

function setLoading(value) {
  state.loading = value;
  document.body.classList.toggle('is-loading', value);
  els.scanNow.disabled = value;
  els.refreshTop.disabled = value;
  els.scanNow.textContent = value ? 'Scanning…' : 'Run scan';
}

function emptyStateContent() {
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
  if (state.lastError) {
    return {
      title: 'Scanner needs attention',
      copy: state.lastError,
      meta: ['Review diagnostics', 'Check API credits']
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
  els.emptyState.classList.toggle('hidden', !show);
  if (!show) return;
  const content = emptyStateContent();
  els.emptyTitle.textContent = content.title;
  els.emptyCopy.textContent = content.copy;
  els.emptyMeta.innerHTML = '';
  content.meta.forEach(text => {
    const item = document.createElement('span');
    item.textContent = text;
    els.emptyMeta.appendChild(item);
  });
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
  const lowerFirst = els.leaguePreference.value === 'lower-first';
  const topLean = els.leaguePreference.value === 'top-stability';
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
    if (legs.length >= 2 && nextOdds > targetMax + .65) continue;
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
    if (index === 0) els.setAOdds.textContent = formatOdds(set.odds);
  });
}

function render() {
  const qualified = rankPicks(state.picks).filter(p => p.confidence >= scoreFloor());
  const watchlist = rankPicks(state.watchlist).filter(p => !qualified.some(q => q.id === p.id)).slice(0, 9);

  els.qualifiedCards.innerHTML = '';
  qualified.forEach(pick => renderPick(els.qualifiedCards, pick));

  els.watchlistCards.innerHTML = '';
  const showWatchlist = watchlist.length > 0;
  els.watchlistHead.classList.toggle('hidden', !showWatchlist);
  els.watchlistCards.classList.toggle('hidden', !showWatchlist);
  watchlist.forEach(pick => renderPick(els.watchlistCards, pick));

  const top = qualified[0];
  const checked = Number(state.lastPayload.scannedEvents || 0);
  const score = top ? Math.round(top.confidence) : null;
  els.heroScore.textContent = score ? `${score}` : '--';
  document.body.style.setProperty('--score-angle', `${score || 0}%`);
  document.body.classList.toggle('has-picks', Boolean(qualified.length));
  els.qualifiedCount.textContent = qualified.length;
  els.checkedCount.textContent = checked;
  els.lastUpdated.textContent = formatUpdated(state.lastPayload.generatedAt);

  els.minimumScore.textContent = `${scoreFloor()}%`;
  const zone = oddsZone();
  els.oddsZone.textContent = `${zone.min.toFixed(2)}–${zone.max.toFixed(2)}`;
  els.marketList.textContent = state.lastPayload.markets || 'h2h';
  if (els.regionsUsed) els.regionsUsed.textContent = state.lastPayload.regionsUsed || state.lastPayload.region || 'au';
  if (els.apiCredits) {
    const usage = state.lastPayload.apiUsage || {};
    els.apiCredits.textContent = usage.remaining ? `${usage.remaining} left` : 'Not reported';
  }
  els.sportsScanned.textContent = Number(state.lastPayload.sportsScanned || 0);
  els.sportsWithGames.textContent = Number(state.lastPayload.sportsWithFixtures || 0);
  els.scannerMessage.textContent = state.lastPayload.message || 'The app will never force a banker when the selected window does not produce a strong enough profile.';

  renderEmpty(qualified.length === 0);
  renderAccas();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  let payload = {};
  try { payload = JSON.parse(text || '{}'); } catch (_) { payload = { message: text || 'Unexpected scanner response' }; }
  if (!res.ok) {
    const error = new Error(payload.message || `Scanner route returned ${res.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function checkStatus() {
  try {
    const payload = await fetchJson('/api/status');
    state.lastPayload = { ...state.lastPayload, ...payload };
    state.lastError = '';
    setConnection(payload);
  } catch (error) {
    state.lastError = 'The live scanner route is not responding yet. Check that netlify/functions/scan.js deployed, then redeploy from GitHub.';
    setConnection({ configured: false, status: 'error' });
  } finally {
    render();
  }
}

async function runScan() {
  setLoading(true);
  saveSettings();
  state.lastError = '';
  render();
  try {
    const params = new URLSearchParams({
      windowHours: els.windowHours.value,
      riskProfile: els.riskProfile.value,
      leaguePreference: els.leaguePreference.value,
      sportsScope: els.sportsScope.value
    });
    const payload = await fetchJson(`/api/scan?${params.toString()}`);
    state.scanned = true;
    state.lastPayload = payload;
    state.picks = Array.isArray(payload.picks) ? payload.picks.map(normalisePick) : [];
    state.watchlist = Array.isArray(payload.watchlist) ? payload.watchlist.map(normalisePick) : [];
    setConnection(payload);
    if (state.picks.length) {
      state.saved.unshift({ at: payload.generatedAt, picks: state.picks.slice(0, 8) });
      state.saved = state.saved.slice(0, 8);
      localStorage.setItem(savedKey, JSON.stringify(state.saved));
    }
  } catch (error) {
    const payload = error.payload || {};
    state.scanned = true;
    state.lastPayload = payload;
    state.lastError = payload.message || error.message || 'Scanner unavailable. Check Netlify logs and API settings.';
    state.picks = [];
    state.watchlist = [];
    setConnection({ configured: Boolean(payload.configured), status: 'needs-attention' });
  } finally {
    setLoading(false);
    render();
  }
}

[els.windowHours, els.riskProfile, els.leaguePreference, els.sportsScope].forEach(control => {
  control.addEventListener('change', () => {
    saveSettings();
    render();
  });
});

els.scanNow.addEventListener('click', runScan);
els.refreshTop.addEventListener('click', runScan);
els.clearSaved.addEventListener('click', () => {
  state.saved = [];
  localStorage.removeItem(savedKey);
});

document.querySelectorAll('.bottom-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.bottom-nav a').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

loadSettings();
setConnection({ configured: false });
render();
checkStatus();
