// ---------- New Milos Penitentiary ----------
// A public arrest registry, backed by a shared table on the server (penitentiary_records) --
// not per-character storage, since every player's jail state has to be visible to everyone else.
const PENITENTIARY_HISTORY_LIMIT = 30;
const BAIL_RATE_PER_YEAR = 150; // matches Hire Lawyer's rate

let penitentiaryRecordsCache = [];
let lastSyncedJail = null;

// Called on every render (same as before). Debounced against the last jail state we actually sent
// so a jail-state change (server-side bust, or the client-side serve-time release) gets reflected
// in the shared registry without spamming the server on every single render.
function syncPenitentiaryRecord() {
  if (!getAuthToken || !getAuthToken()) return;
  const snapshot = `${character.jail.inJail}:${character.jail.yearsRemaining}`;
  if (snapshot === lastSyncedJail) return;
  lastSyncedJail = snapshot;
  apiPenitentiarySync().catch(() => {
    lastSyncedJail = null; // let the next render retry if this failed
  });
}

async function refreshPenitentiaryRecords() {
  try {
    const result = await apiPenitentiaryRecords();
    penitentiaryRecordsCache = result.records;
  } catch {
    // Best-effort -- keep showing the last known records if the fetch fails.
  }
  buildPenitentiaryJailedGrid();
  buildPenitentiaryHistoryList();
}

// ---------- UI ----------
const penitentiaryJailedGrid = document.getElementById('penitentiaryJailedGrid');
const penitentiaryHistoryList = document.getElementById('penitentiaryHistoryList');
const penitentiaryLog = document.getElementById('penitentiaryLog');

function buildPenitentiaryJailedGrid() {
  if (!penitentiaryJailedGrid) return;
  const jailed = penitentiaryRecordsCache.filter((r) => r.releasedAt === null && r.yearsRemaining > 0);
  const myName = characterFullName();

  penitentiaryJailedGrid.innerHTML = jailed.length
    ? jailed.map((record) => {
      const bailCost = Math.round(record.yearsRemaining * BAIL_RATE_PER_YEAR);
      const isMe = record.playerName === myName;
      return `
        <div class="hustle-card">
          <h3>🔒 ${record.playerName}${isMe ? ' (you)' : ''}</h3>
          <p>Crime: ${record.crime}<br>Sentence remaining: ${record.yearsRemaining} year(s)<br>Commissary received: $${record.commissaryReceived.toFixed(2)}</p>
          <button data-bail="${record.id}">Bail Out ($${bailCost.toLocaleString()})</button>
          <input type="number" data-commissary-amount="${record.id}" min="1" placeholder="Amount">
          <button data-commissary="${record.id}" class="secondary-btn">Send for Books</button>
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">Nobody\'s locked up right now.</p>';

  penitentiaryJailedGrid.querySelectorAll('[data-bail]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiPenitentiaryBail(Number(btn.dataset.bail));
        character = result.character;
        penitentiaryRecordsCache = result.records;
        logTo(penitentiaryLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  penitentiaryJailedGrid.querySelectorAll('[data-commissary]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const recordId = Number(btn.dataset.commissary);
      const input = penitentiaryJailedGrid.querySelector(`[data-commissary-amount="${recordId}"]`);
      const amount = Math.max(0, +input.value || 0);
      try {
        const result = await apiPenitentiaryCommissary(recordId, amount);
        character = result.character;
        penitentiaryRecordsCache = result.records;
        logTo(penitentiaryLog, result.message, result.cls);
        input.value = '';
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

function buildPenitentiaryHistoryList() {
  if (!penitentiaryHistoryList) return;
  const recent = [...penitentiaryRecordsCache].sort((a, b) => b.arrestedAt - a.arrestedAt).slice(0, PENITENTIARY_HISTORY_LIMIT);

  penitentiaryHistoryList.innerHTML = recent.length
    ? recent.map((record) => {
      const status = record.releasedAt !== null ? 'Released' : `${record.yearsRemaining} yr(s) remaining`;
      return `
        <div class="arrest-record-row">
          <span>${record.playerName} &mdash; ${record.crime}</span>
          <span>${status}</span>
          <span>${new Date(record.arrestedAt).toLocaleString()}</span>
        </div>
      `;
    }).join('')
    : '<p class="arrest-record-empty">No arrests on record yet.</p>';
}

function buildPenitentiaryUI() {
  if (!penitentiaryJailedGrid) return;
  buildPenitentiaryJailedGrid();
  buildPenitentiaryHistoryList();
}
