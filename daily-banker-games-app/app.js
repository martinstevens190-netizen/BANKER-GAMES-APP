const state = {
  picks: [],
  source: 'idle',
  configured: false,
  loading: false,
  scanned: false,
  lastUpdated: null,
  lastMessage: ''
};

const els = {
  pickCards: document.getElementById('pickCards'),
  accaCards: document.getElementById('accaCards'),
  emptyState: document.getElementById('emptyState'),
  emptyIcon: document.getElementById('emptyIcon'),
  emptyTitle: document.getElementById('emptyTitle'),
  emptyCopy: document.getElementById('emptyCopy'),
  emptyMeta: document.getElementById('emptyMeta'),
  pickTemplate: document.getElementById('pickTemplate'),
  accaTemplate: document.getElementById('accaTemplate'),
  scanNow: document.getElementById('scanNow'),
  refreshTop: document.getElementById('refreshTop'),
  windowHours: document.getElementById('windowHours'),
  safetyMode: document.getElementById('safetyMode'),
  leagueBias: document.getElementById('leagueBias'),
  modePill: document.getElementById('modePill'),
  heroScore: document.getElementById('heroScore'),
  qualifiedCount: document.getElementById('qualifiedCount'),
  avgConfidence: document.getElementById('avgConfidence'),
  targetOdds: document.getElementById('targetOdds'),
  minConfidence: document.getElementById('minConfidence'),
  lastUpdated: document.getElementById('lastUpdated'),
  dataStatus: document.getElementById('dataStatus'),
  scannedEvents: document.getElementById('scannedEvents')
};

const settingsKey = 'bankerLabSettings';

function saveSettings() {
  const settings = {
    windowHours: els.windowHours.value,
    safetyMode: els.safetyMode.value,
    leagueBias: els.leagueBias.value
  };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    if (settings.windowHours) els.windowHours.value = settings.windowHours;
    if (settings.safetyMode) els.safetyMode.value = settings.safetyMode;
    if (settings.leagueBias) els.leagueBias.value = settings.leagueBias;
  } catch (_) {}
}

function formatOdds(value) {
  const number = Number(value || 0);
  return number ? number.toFixed(2) : '--';
}

function confidenceFloor() {
  const mode = els.safetyMode.value;
  if (mode === 'strict') return 88;
  if (mode === 'balanced') return 84;
  return 80;
}

function formatUpdated(value) {
  if (!value) return 'Not scanned yet';
  return `Updated ${new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Melbourne'
  }).format(new Date(value))}`;
}

function lowerTierScore(pick) {
  return /lower|npl|first division|second division|third division|league one|league two|regional|state|serie c|serie d|segunda|primera b|championship|national league|liga 2|u21|u23/i.test(`${pick.league} ${pick.tag}`) ? 6 : 0;
}

function sortedPicks() {
  const floor = confidenceFloor();
  const filtered = state.picks.filter(p => Number(p.confidence) >= floor);
  return filtered.sort((a, b) => {
    const lowerA = lowerTierScore(a);
    const lowerB = lowerTierScore(b);
    if (els.leagueBias.value === 'lower-first') return (b.confidence + lowerB) - (a.confidence + lowerA);
    if (els.leagueBias.value === 'top-safe') return b.confidence - a.confidence - (lowerB - lowerA) / 2;
    return b.confidence - a.confidence;
  });
}

function buildAccas(picks) {
  const shortlist = picks.filter(p => p.confidence >= confidenceFloor()).slice(0, 9);
  const setA = [];
  let oddsA = 1;
  for (const pick of shortlist) {
    if (setA.length >= 5 || oddsA >= 4.35) break;
    setA.push(pick);
    oddsA *= pick.odds;
  }

  const setB = [];
  let oddsB = 1;
  const usedGames = new Set(setA.slice(0, 2).map(p => p.match));
  for (const pick of shortlist) {
    if (setB.length >= 5 || oddsB >= 4.25) break;
    if (usedGames.has(pick.match) && shortlist.length > 4) continue;
    setB.push(pick);
    oddsB *= pick.odds;
  }

  if (setB.length < 2 && shortlist.length >= 2) {
    const extras = shortlist.filter(p => !setB.includes(p)).slice(0, 2 - setB.length);
    setB.push(...extras);
    oddsB = setB.reduce((acc, p) => acc * Number(p.odds || 1), 1);
  }

  return [
    {
      title: 'Set A · safest build',
      odds: setA.length ? oddsA : 0,
      picks: setA,
      note: 'Highest scoring legs first. The build stops early when the target zone is reached.'
    },
    {
      title: 'Set B · alternate profile',
      odds: setB.length ? oddsB : 0,
      picks: setB,
      note: 'Different games are preferred where the shortlist allows it.'
    }
  ];
}

function normaliseApiPick(item) {
  return {
    match: item.match || 'Upcoming match',
    league: item.league || 'Global football',
    market: item.market || 'Market lean',
    odds: Number(item.odds || 0),
    confidence: Number(item.confidence || 0),
    kickoff: item.kickoff || 'Upcoming Melbourne time',
    model: item.model || 'Model ranked',
    tag: item.tag || 'QUALIFIED',
    reason: item.reason || 'Ranked from market safety, implied probability, kickoff window and league profile.'
  };
}

function emptyStateCopy() {
  if (!state.configured) {
    return {
      icon: '🔌',
      title: 'Live data key not detected',
      copy: 'The app is running, but Netlify has not passed an odds API key to the scanner yet. Check that ODDS_API_KEY is saved under this exact site, then trigger a fresh production deploy.',
      meta: ['Site variables', 'ODDS_API_KEY']
    };
  }
  if (state.source === 'error') {
    return {
      icon: '⚠️',
      title: 'Scanner connected, but the API returned an error',
      copy: state.lastMessage || 'Open /api/scan in your browser to view the exact scanner response, then check your API key, plan, region and market access.',
      meta: ['Connected', 'Check API response']
    };
  }
  if (state.scanned) {
    return {
      icon: '✓',
      title: 'No qualified bankers in this scan window',
      copy: 'Your live feed is connected, but no picks passed the current safety filters. Try Balanced 3–5 odds or widen the window to 18–24 hours.',
      meta: ['Live connected', `${els.scannedEvents.textContent || 0} games checked`]
    };
  }
  return {
    icon: '▶',
    title: 'Ready for live scan',
    copy: 'Your data connection is ready. Tap Run live scan to check upcoming games and build the daily 3–5 odds sets.',
    meta: ['Live connected', 'Manual scan']
  };
}

function renderEmptyState(show) {
  els.emptyState.classList.toggle('hidden', !show);
  if (!show) return;
  const copy = emptyStateCopy();
  els.emptyIcon.textContent = copy.icon;
  els.emptyTitle.textContent = copy.title;
  els.emptyCopy.textContent = copy.copy;
  els.emptyMeta.innerHTML = '';
  copy.meta.forEach(item => {
    const span = document.createElement('span');
    span.textContent = item;
    els.emptyMeta.appendChild(span);
  });
}

function renderPicks() {
  const picks = sortedPicks();
  els.pickCards.innerHTML = '';
  picks.forEach((pick) => {
    const node = els.pickTemplate.content.cloneNode(true);
    node.querySelector('.tag').textContent = pick.tag;
    node.querySelector('.confidence').textContent = `${pick.confidence}%`;
    node.querySelector('.match').textContent = pick.match;
    node.querySelector('.league').textContent = pick.league;
    node.querySelector('.market').textContent = pick.market;
    node.querySelector('.odds').textContent = formatOdds(pick.odds);
    node.querySelector('.kickoff').textContent = pick.kickoff;
    node.querySelector('.model').textContent = pick.model;
    node.querySelector('.reason').textContent = pick.reason;
    els.pickCards.appendChild(node);
  });

  const avg = picks.length ? Math.round(picks.reduce((sum, p) => sum + Number(p.confidence || 0), 0) / picks.length) : 0;
  els.heroScore.textContent = picks[0]?.confidence || '--';
  els.qualifiedCount.textContent = picks.length;
  els.avgConfidence.textContent = picks.length ? `${avg}%` : '--';
  els.minConfidence.textContent = `${confidenceFloor()}%`;
  els.lastUpdated.textContent = formatUpdated(state.lastUpdated);
  renderEmptyState(picks.length === 0);

  renderAccas(picks);
}

function renderAccas(picks) {
  const accas = buildAccas(picks);
  els.accaCards.innerHTML = '';
  accas.forEach((acca, index) => {
    const node = els.accaTemplate.content.cloneNode(true);
    node.querySelector('h4').textContent = acca.title;
    node.querySelector('.acca-odds').textContent = formatOdds(acca.odds);
    const ul = node.querySelector('ul');
    if (acca.picks.length) {
      acca.picks.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.market} · ${p.match} @ ${formatOdds(p.odds)}`;
        ul.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = state.configured ? 'Run a scan or loosen filters to build this set.' : 'Connect live data to build this set.';
      ul.appendChild(li);
    }
    node.querySelector('p').textContent = acca.note;
    els.accaCards.appendChild(node);
    if (index === 0) els.targetOdds.textContent = formatOdds(acca.odds);
  });
}

function setStatus(payload = {}) {
  const configured = Boolean(payload.configured || payload.source === 'api');
  state.configured = configured;
  const label = configured ? 'Live data connected' : 'Data key not detected';
  els.modePill.textContent = label;
  els.dataStatus.textContent = configured ? 'Connected' : 'Not detected';
  document.body.classList.toggle('is-connected', configured);
}

function setLoading(value) {
  state.loading = value;
  els.scanNow.disabled = value;
  els.refreshTop.disabled = value;
  els.scanNow.textContent = value ? 'Scanning…' : 'Run live scan';
  document.body.classList.toggle('is-loading', value);
}

async function checkStatus() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) setStatus(payload);
  } catch (_) {
    els.modePill.textContent = 'Scanner status unavailable';
    els.dataStatus.textContent = 'Unavailable';
  } finally {
    renderPicks();
  }
}

async function runScan() {
  setLoading(true);
  saveSettings();
  try {
    const params = new URLSearchParams({
      windowHours: els.windowHours.value,
      safetyMode: els.safetyMode.value,
      leagueBias: els.leagueBias.value
    });
    const res = await fetch(`/api/scan?${params}`, { cache: 'no-store' });
    const payload = await res.json().catch(() => ({}));
    setStatus(payload);

    state.scanned = true;
    state.lastMessage = payload.message || '';
    state.lastUpdated = payload.generatedAt || new Date().toISOString();
    els.scannedEvents.textContent = Number(payload.scannedEvents || 0);

    if (!res.ok) {
      state.source = 'error';
      state.picks = [];
      throw new Error(payload?.message || 'Scanner unavailable');
    }

    state.picks = Array.isArray(payload.picks) ? payload.picks.map(normaliseApiPick) : [];
    state.source = payload.source || (state.configured ? 'api' : 'configuration');
  } catch (error) {
    state.picks = [];
    state.source = 'error';
    state.lastMessage = error.message || 'Scanner unavailable';
    els.modePill.textContent = state.configured ? 'API check required' : 'Scanner unavailable';
  } finally {
    setLoading(false);
    renderPicks();
  }
}

[els.windowHours, els.safetyMode, els.leagueBias].forEach(el => {
  el.addEventListener('change', () => {
    saveSettings();
    renderPicks();
  });
});
els.scanNow.addEventListener('click', runScan);
els.refreshTop.addEventListener('click', runScan);

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
setStatus({ configured: false });
renderPicks();
checkStatus().then(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autoscan') === '1') runScan();
});
