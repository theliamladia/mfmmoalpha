// ---------- Sliming ----------
// Gun-required PvP action (see js/playerActions.js for the Slime button/API call). This file
// covers: the dice-duel reveal modal (when both shooter and target have a gun equipped), the
// "SLIMED OUT" full-page lockout gate for whoever loses, and the notification poll that lets a
// currently-idle victim learn about it (or a blocked attempt) without taking any action themselves.

// ---------- Duel roll modal ----------
const slimeDuelModal = document.getElementById('slimeDuelModal');
const slimeDuelShooterRoll = document.getElementById('slimeDuelShooterRoll');
const slimeDuelTargetRoll = document.getElementById('slimeDuelTargetRoll');
const slimeDuelResultText = document.getElementById('slimeDuelResultText');
const btnSlimeDuelOk = document.getElementById('btnSlimeDuelOk');

let pendingSlimeResult = null;

function applySlimeResult(result) {
  character = result.character;
  save();
  renderAll();
  logTo(milosLog, result.message, result.cls);
}

// The server has already fully resolved the duel by the time this is called -- the delay here is
// pure suspense (same idiom as the coinflip spin animation), not a real wait for anything.
function showSlimeDuelModal(result) {
  pendingSlimeResult = result;
  slimeDuelShooterRoll.textContent = '?';
  slimeDuelTargetRoll.textContent = '?';
  slimeDuelResultText.textContent = 'Rolling...';
  slimeDuelResultText.className = '';
  btnSlimeDuelOk.classList.add('hidden');
  slimeDuelModal.classList.remove('hidden');

  setTimeout(() => {
    slimeDuelShooterRoll.textContent = result.duel.shooterRoll;
    slimeDuelTargetRoll.textContent = result.duel.targetRoll;
    slimeDuelResultText.textContent = result.message;
    slimeDuelResultText.className = result.cls;
    btnSlimeDuelOk.classList.remove('hidden');
  }, 1200);
}

btnSlimeDuelOk.addEventListener('click', () => {
  slimeDuelModal.classList.add('hidden');
  if (pendingSlimeResult) {
    applySlimeResult(pendingSlimeResult);
    pendingSlimeResult = null;
  }
});

// ---------- SLIMED OUT full-page gate ----------
const slimedOverlay = document.getElementById('slimedOverlay');
const slimedByNameEl = document.getElementById('slimedByName');
const slimedCountdownEl = document.getElementById('slimedCountdown');
const slimedRecordList = document.getElementById('slimedRecordList');

// Purely derived from the timestamp -- no server flag ever needs to flip back to false, the
// lockout just naturally expires once Date.now() (clock-skew corrected) passes `until`.
function isCurrentlySlimed() {
  return !!(character && character.slime && character.slime.active && (Date.now() + clockOffsetMs) < character.slime.until);
}

function renderSlimedRecord() {
  const record = (character.slimeRecord || []).slice().reverse();
  slimedRecordList.innerHTML = record.length
    ? record.map((r) => `
      <div class="slimed-record-row">
        <span>${escapeHtml(r.byName)}</span>
        <span>${new Date(r.at).toLocaleString()}</span>
      </div>
    `).join('')
    : '<p class="slimed-record-empty">No record yet.</p>';
}

function renderSlimedGate() {
  if (!slimedOverlay) return;
  const active = isCurrentlySlimed();
  slimedOverlay.classList.toggle('hidden', !active);
  if (!active) return;
  slimedByNameEl.textContent = character.slime.byName || 'someone';
  renderSlimedRecord();
}

// Wired into the shared 250ms tick loop (tickCooldownUI in market.js) -- only touches the
// countdown text node, same reasoning as tickCrimeUI/tickFarmsUI (no full re-render needed).
function tickSlimedUI() {
  if (!slimedOverlay || slimedOverlay.classList.contains('hidden')) return;
  const remaining = character.slime.until - (Date.now() + clockOffsetMs);
  if (remaining <= 0) {
    renderAll();
    return;
  }
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  slimedCountdownEl.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ---------- Notifications: slimed (authoritative, no modal needed -- the gate itself is the
// notification) / blocked (armor saved someone, alert modal like robbery's) ----------
const slimeAlertModal = document.getElementById('slimeAlertModal');
const slimeAlertText = document.getElementById('slimeAlertText');
const btnSlimeAlertOk = document.getElementById('btnSlimeAlertOk');

// Own constant rather than reusing notifications.js's NOTIF_POLL_MS -- this file's <script> tag
// loads before notifications.js, and the setInterval call below runs at top level (immediately on
// load), so borrowing a not-yet-declared const would throw.
const SLIME_NOTIF_POLL_MS = 10000;

let slimeAlertQueue = [];

function showNextSlimeAlert() {
  if (!slimeAlertQueue.length) {
    slimeAlertModal.classList.add('hidden');
    return;
  }
  const n = slimeAlertQueue[0];
  slimeAlertText.textContent = `${n.shooterName} tried to slime you, but your body armor blocked it!`;
  slimeAlertModal.classList.remove('hidden');
}

btnSlimeAlertOk.addEventListener('click', async () => {
  slimeAlertQueue.shift();
  if (slimeAlertQueue.length) {
    showNextSlimeAlert();
  } else {
    slimeAlertModal.classList.add('hidden');
    try { await apiMarkSlimeNotificationsSeen(); } catch { /* best-effort */ }
  }
});

async function refreshSlimeAlerts() {
  if (!getAuthToken()) return;
  if (slimeAlertQueue.length) return; // already showing/queued -- avoid re-fetching mid-alert
  try {
    const result = await apiSlimeNotifications();
    if (!result.notifications.length) return;

    const slimedNotifs = result.notifications.filter((n) => n.outcome === 'slimed');
    const blockedNotifs = result.notifications.filter((n) => n.outcome === 'blocked');

    if (slimedNotifs.length) {
      const latest = slimedNotifs[slimedNotifs.length - 1];
      character.slime = { active: true, until: latest.until, byName: latest.shooterName };
      save();
      renderAll();
    }

    if (blockedNotifs.length) {
      slimeAlertQueue = blockedNotifs;
      showNextSlimeAlert();
    } else {
      await apiMarkSlimeNotificationsSeen();
    }
  } catch {
    // Best-effort, same as the other polled views.
  }
}

setInterval(refreshSlimeAlerts, SLIME_NOTIF_POLL_MS);
refreshSlimeAlerts();
