// ---------- Server state ----------
// Admin-controlled, server-wide state (pause + modifiers) -- a real shared value on the server now,
// not per-browser localStorage. Every client polls it so pausing (or setting a modifier) actually
// affects everyone, not just the browser that clicked the button.
let serverStateCache = { paused: false, modifier: null };

async function refreshServerState() {
  if (!getAuthToken || !getAuthToken()) return;
  try {
    serverStateCache = (await apiAdminState()).state;
  } catch {
    // Best-effort -- keep the last known state if the poll fails.
  }
  renderServerBanners();
}

function isGamePaused() {
  return serverStateCache.paused;
}

function activeModifier() {
  return serverStateCache.modifier;
}

function isPeaceActive() {
  return activeModifier() === 'peace';
}

function isRiotActive() {
  return activeModifier() === 'riot';
}

const SERVER_STATE_POLL_MS = 5000;
setInterval(refreshServerState, SERVER_STATE_POLL_MS);

// ---------- Banners + button freeze ----------
const gameShell = document.getElementById('screen-game');
const pauseBanner = document.getElementById('pauseBanner');
const modifierBanner = document.getElementById('modifierBanner');

const MODIFIER_BANNERS = {
  peace: { text: '☮️ PEACE & PROSPERITY -- PVP Disabled', cls: 'modifier-banner-peace' },
  riot: { text: '🔥 RIOTLANDIA -- Guns Are Free, No Jail Time for Killing', cls: 'modifier-banner-riot' },
};

function renderServerBanners() {
  if (!gameShell) return;
  gameShell.classList.toggle('game-paused', serverStateCache.paused);
  pauseBanner.classList.toggle('hidden', !serverStateCache.paused);

  const modifier = serverStateCache.modifier ? MODIFIER_BANNERS[serverStateCache.modifier] : null;
  modifierBanner.classList.toggle('hidden', !modifier);
  modifierBanner.className = `server-banner ${modifier ? modifier.cls : ''}${modifier ? '' : ' hidden'}`;
  modifierBanner.textContent = modifier ? modifier.text : '';
}
