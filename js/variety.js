// ---------- Enjoying, Variety & Secumax ----------
// Enjoying/Rob button lives in js/playerActions.js. This file covers: the "ENJOYED" full-page
// lockout gate (same idiom as js/slime.js's SLIMED OUT gate), the sidebar Variety/Secumax status
// display, and the Secumax subscribe/cancel modal.

// ---------- ENJOYED full-page gate ----------
const enjoyedOverlay = document.getElementById('enjoyedOverlay');
const enjoyedByNameEl = document.getElementById('enjoyedByName');
const enjoyedCountdownEl = document.getElementById('enjoyedCountdown');

function isCurrentlyEnjoyed() {
  return !!(character && character.enjoyed && character.enjoyed.active && (Date.now() + clockOffsetMs) < character.enjoyed.until);
}

function renderEnjoyedGate() {
  if (!enjoyedOverlay) return;
  const active = isCurrentlyEnjoyed();
  enjoyedOverlay.classList.toggle('hidden', !active);
  if (!active) return;
  enjoyedByNameEl.textContent = character.enjoyed.byName || 'someone';
}

// Wired into the shared 250ms tick loop (tickCooldownUI in market.js), same reasoning as
// tickSlimedUI -- only touches the countdown text node, no full re-render needed.
function tickEnjoyedUI() {
  if (!enjoyedOverlay || enjoyedOverlay.classList.contains('hidden')) return;
  const remaining = character.enjoyed.until - (Date.now() + clockOffsetMs);
  if (remaining <= 0) {
    renderAll();
    return;
  }
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  enjoyedCountdownEl.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ---------- Sidebar Variety status ----------
const statVarietyEl = document.getElementById('statVariety');
const varietyTierLabelEl = document.getElementById('varietyTierLabel');

// Mirrors gameLogic.js's VARIETY_TIERS exactly -- kept in sync by hand, same trust level as every
// other client-side mirror of a server-authoritative table (e.g. ALLIANCE_TIERS labels).
const VARIETY_TIER_LABELS = [
  { min: 100, label: '💀 Lone Survivor' },
  { min: 75, label: '🔥 Varietymaxxed' },
  { min: 50, label: '⚠️ Varietous' },
  { min: 20, label: '🌈 Various' },
];

function varietyTierLabelFor(variety) {
  const tier = VARIETY_TIER_LABELS.find((t) => variety >= t.min);
  return tier ? tier.label : '';
}

function renderVarietyStatus() {
  if (!statVarietyEl) return;
  const variety = character.variety || 0;
  statVarietyEl.textContent = `${Math.round(variety)}%`;
  varietyTierLabelEl.textContent = varietyTierLabelFor(variety);
}

// ---------- Sidebar Secumax status + subscribe/cancel modal ----------
const secumaxStatLine = document.getElementById('secumaxStatLine');
const secumaxStatusLabelEl = document.getElementById('secumaxStatusLabel');
const secumaxModal = document.getElementById('secumaxModal');
const secumaxModalBody = document.getElementById('secumaxModalBody');
const btnSecumaxClose = document.getElementById('btnSecumaxClose');

const SECUMAX_TIER_INFO = [
  { id: 'basic', name: 'Secumax Basic', cost: 10000, desc: 'Stops 5 Robberies + 5 Enjoyment attempts per day.' },
  { id: 'plus', name: 'Secumax Plus', cost: 50000, desc: 'Stops unlimited Robberies + Enjoyment, and 1 Sliming per day.' },
  { id: 'max', name: 'SecuMaximum', cost: 90000, desc: 'Stops everything unlimited, and countersLimes whoever tries to slime you.' },
];

// Seeded from character.secumax (part of the normal character object, always fresh from
// renderAll) so the sidebar label needs no separate fetch; the modal re-fetches via
// apiSecumaxState() when opened to also get the authoritative daily-block-usage counts, which
// aren't part of the character object's own sync payload.
let secumaxCache = { tier: null };

function renderSecumaxStatus() {
  if (!statVarietyEl) return; // guards against running before character exists
  secumaxCache.tier = (character.secumax && character.secumax.tier) || null;
  const info = SECUMAX_TIER_INFO.find((t) => t.id === secumaxCache.tier);
  secumaxStatusLabelEl.textContent = info ? info.name : 'None';
}

function renderSecumaxModal() {
  if (!secumaxModalBody) return;
  secumaxModalBody.innerHTML = SECUMAX_TIER_INFO.map((t) => `
    <div class="hustle-card">
      <h3>${t.name} ${t.id === secumaxCache.tier ? '<span class="active-hustle">Active</span>' : ''}</h3>
      <p>${t.desc}</p>
      <p class="job-payout-line">$${t.cost.toLocaleString()}/day, autodrafted.</p>
      <button data-secumax-tier="${t.id}" ${t.id === secumaxCache.tier ? 'disabled' : ''}>${t.id === secumaxCache.tier ? 'Subscribed' : 'Subscribe'}</button>
    </div>
  `).join('') + (secumaxCache.tier ? '<button id="btnSecumaxCancel" class="secondary-btn">Cancel Subscription</button>' : '');

  secumaxModalBody.querySelectorAll('[data-secumax-tier]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiSecumaxSubscribe(btn.dataset.secumaxTier);
        character = result.character;
        secumaxCache = result.secumax;
        save();
        renderAll();
        renderSecumaxModal();
      } catch (err) {
        alert(err.reason || 'Could not reach the server.');
      }
    });
  });
  const cancelBtn = document.getElementById('btnSecumaxCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      try {
        const result = await apiSecumaxCancel();
        character = result.character;
        secumaxCache = result.secumax;
        save();
        renderAll();
        renderSecumaxModal();
      } catch (err) {
        alert(err.reason || 'Could not reach the server.');
      }
    });
  }
}

if (secumaxStatLine) {
  secumaxStatLine.addEventListener('click', async () => {
    try {
      const result = await apiSecumaxState();
      secumaxCache = result.secumax;
      renderSecumaxStatus();
      renderSecumaxModal();
      secumaxModal.classList.remove('hidden');
    } catch (err) {
      alert(err.reason || 'Could not reach the server.');
    }
  });
}

if (btnSecumaxClose) {
  btnSecumaxClose.addEventListener('click', () => secumaxModal.classList.add('hidden'));
}
