// ---------- Server state ----------
// Admin-controlled, server-wide state (pause + modifiers), kept in its own localStorage "table"
// separate from the character save -- exactly like mtn.js/penitentiary.js -- so this becomes a
// real shared server value (and a `storage` broadcast to every other tab/client) once multiplayer
// exists. loadServerState()/saveServerState() are the only two functions that would need to change.
const SERVER_STATE_KEY = 'specialUnitsGui.serverState.v1';
const SERVER_STATE_DEFAULTS = { paused: false, pausedAt: null, modifier: null };

function loadServerState() {
  const raw = localStorage.getItem(SERVER_STATE_KEY);
  return raw ? { ...SERVER_STATE_DEFAULTS, ...JSON.parse(raw) } : { ...SERVER_STATE_DEFAULTS };
}

function saveServerState(state) {
  localStorage.setItem(SERVER_STATE_KEY, JSON.stringify(state));
}

function isGamePaused() {
  return loadServerState().paused;
}

function activeModifier() {
  return loadServerState().modifier;
}

function isPeaceActive() {
  return activeModifier() === 'peace';
}

function isRiotActive() {
  return activeModifier() === 'riot';
}

// Pausing freezes the game clock: every timestamp the game compares against Date.now() (cooldowns,
// bank billing, Morals Center ticks) gets shifted forward by however long the pause lasted, so
// resuming continues exactly where it left off instead of dumping a burst of missed progress.
function doSetGamePause(paused) {
  const state = loadServerState();
  if (paused) {
    state.paused = true;
    state.pausedAt = Date.now();
    saveServerState(state);
    return;
  }

  if (state.paused && state.pausedAt && character) {
    const pausedMs = Date.now() - state.pausedAt;
    character.bank.lastBillTs += pausedMs;
    character.moralsCenter.lastTickTs += pausedMs;
    Object.keys(character.cooldowns).forEach((key) => { character.cooldowns[key] += pausedMs; });
    save();
  }
  state.paused = false;
  state.pausedAt = null;
  saveServerState(state);
}

function doSetModifier(modifier) {
  const state = loadServerState();
  state.modifier = modifier;
  saveServerState(state);
}

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
  const state = loadServerState();
  gameShell.classList.toggle('game-paused', state.paused);
  pauseBanner.classList.toggle('hidden', !state.paused);

  const modifier = state.modifier ? MODIFIER_BANNERS[state.modifier] : null;
  modifierBanner.classList.toggle('hidden', !modifier);
  modifierBanner.className = `server-banner ${modifier ? modifier.cls : ''}${modifier ? '' : ' hidden'}`;
  modifierBanner.textContent = modifier ? modifier.text : '';
}

// ---------- Inventory Checker ----------
function doCheckInventory(username) {
  const query = (username || '').trim();
  if (!query) return { ok: false, reason: 'Enter a username.' };
  if (query.toLowerCase() !== characterFullName().toLowerCase()) {
    return { ok: false, reason: `No player named "${query}" found on this device. (Only your own save exists until multiplayer is live.)` };
  }
  return { ok: true, name: characterFullName(), inventory: character.inventory, equipment: character.equipment };
}
