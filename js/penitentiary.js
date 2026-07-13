// ---------- New Milos Penitentiary ----------
// A public arrest registry, same porting pattern as mtn.js: its own localStorage "table" (shape
// matches a DB row: id/playerName/crime/years/arrestedAt/releasedAt/commissaryReceived), kept
// separate from the character save so loadPenitentiaryRecords()/savePenitentiaryRecords() are the
// only two functions that need to become real API calls once multiplayer exists.
const PENITENTIARY_STORAGE_KEY = 'specialUnitsGui.penitentiary.v1';
const PENITENTIARY_HISTORY_LIMIT = 30;
const BAIL_RATE_PER_YEAR = 150; // matches Hire Lawyer's rate

function loadPenitentiaryRecords() {
  const raw = localStorage.getItem(PENITENTIARY_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function savePenitentiaryRecords(records) {
  localStorage.setItem(PENITENTIARY_STORAGE_KEY, JSON.stringify(records));
}

function nextPenitentiaryId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

// Reactively mirrors character.jail into the shared registry -- no jail/bust call-site needs to
// know this registry exists. Safe to call on every render; it only writes when something changed.
function syncPenitentiaryRecord() {
  const records = loadPenitentiaryRecords();
  const myName = characterFullName();
  const activeIdx = records.findIndex((r) => r.playerName === myName && r.releasedAt === null);

  if (character.jail.inJail) {
    if (activeIdx === -1) {
      records.push({
        id: nextPenitentiaryId(),
        playerName: myName,
        crime: character.jail.crime || 'Crime',
        yearsTotal: character.jail.yearsRemaining,
        yearsRemaining: character.jail.yearsRemaining,
        arrestedAt: Date.now(),
        releasedAt: null,
        commissaryReceived: 0,
      });
      savePenitentiaryRecords(records);
    } else if (records[activeIdx].yearsRemaining !== character.jail.yearsRemaining) {
      records[activeIdx].yearsRemaining = character.jail.yearsRemaining;
      savePenitentiaryRecords(records);
    }
  } else if (activeIdx !== -1) {
    records[activeIdx].releasedAt = Date.now();
    records[activeIdx].yearsRemaining = 0;
    savePenitentiaryRecords(records);
  }
}

function doPayBail(recordId) {
  const records = loadPenitentiaryRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx === -1) return { ok: false, reason: 'That inmate is no longer listed.' };
  const record = records[idx];
  if (record.releasedAt !== null || record.yearsRemaining <= 0) return { ok: false, reason: 'Already released.' };

  const cost = Math.round(record.yearsRemaining * BAIL_RATE_PER_YEAR);
  if (character.cash < cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash = round2(character.cash - cost);
  record.releasedAt = Date.now();
  record.yearsRemaining = 0;
  savePenitentiaryRecords(records);

  // In multiplayer this would release the inmate's own account. Right now this browser only has
  // one save, so bailing yourself out also clears your own jail state the same way Hire Lawyer does.
  if (record.playerName === characterFullName() && character.jail.inJail) {
    releaseFromJail();
  }
  return { ok: true, message: `Posted bail for ${record.playerName} ($${cost.toLocaleString()}).`, cls: 'gain' };
}

function doSendCommissary(recordId, amount) {
  if (!(amount > 0)) return { ok: false, reason: 'Enter a valid amount.' };
  const records = loadPenitentiaryRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx === -1) return { ok: false, reason: 'That inmate is no longer listed.' };
  if (character.cash < amount) return { ok: false, reason: 'Not enough Floydbucks.' };

  const record = records[idx];
  character.cash = round2(character.cash - amount);
  record.commissaryReceived = round2(record.commissaryReceived + amount);
  savePenitentiaryRecords(records);

  // Same single-save caveat as above -- sending to yourself nets back to zero instead of vanishing.
  if (record.playerName === characterFullName()) {
    character.cash = round2(character.cash + amount);
  }
  return { ok: true, message: `Sent $${amount.toFixed(2)} to ${record.playerName}'s commissary.`, cls: 'gain' };
}

// ---------- UI ----------
const penitentiaryJailedGrid = document.getElementById('penitentiaryJailedGrid');
const penitentiaryHistoryList = document.getElementById('penitentiaryHistoryList');
const penitentiaryLog = document.getElementById('penitentiaryLog');

function buildPenitentiaryJailedGrid() {
  if (!penitentiaryJailedGrid) return;
  const records = loadPenitentiaryRecords();
  const jailed = records.filter((r) => r.releasedAt === null && r.yearsRemaining > 0);
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
    btn.addEventListener('click', () => {
      const result = doPayBail(Number(btn.dataset.bail));
      if (!result.ok) { alert(result.reason); return; }
      logTo(penitentiaryLog, result.message, result.cls);
      save();
      renderAll();
    });
  });

  penitentiaryJailedGrid.querySelectorAll('[data-commissary]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const recordId = Number(btn.dataset.commissary);
      const input = penitentiaryJailedGrid.querySelector(`[data-commissary-amount="${recordId}"]`);
      const amount = Math.max(0, +input.value || 0);
      const result = doSendCommissary(recordId, amount);
      if (!result.ok) { alert(result.reason); return; }
      logTo(penitentiaryLog, result.message, result.cls);
      input.value = '';
      save();
      renderAll();
    });
  });
}

function buildPenitentiaryHistoryList() {
  if (!penitentiaryHistoryList) return;
  const records = loadPenitentiaryRecords();
  const recent = [...records].sort((a, b) => b.arrestedAt - a.arrestedAt).slice(0, PENITENTIARY_HISTORY_LIMIT);

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
