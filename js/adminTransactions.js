// ---------- Admin: Transaction Log dashboard ----------
// Summary/aggregates come from a dedicated server endpoint (computed in SQL) rather than being
// derived from the paginated raw list here -- keeps this cheap regardless of how large the log
// gets. No charting library in this codebase, so the "graphs" are plain CSS horizontal bars.
const btnAdminTransactionLog = document.getElementById('btnAdminTransactionLog');
const transactionLogModal = document.getElementById('transactionLogModal');
const btnTxLogClose = document.getElementById('btnTxLogClose');
const btnTxLogCloseX = document.getElementById('btnTxLogCloseX');
const txlogTiles = document.getElementById('txlogTiles');
const txlogGainsChart = document.getElementById('txlogGainsChart');
const txlogSinksChart = document.getElementById('txlogSinksChart');
const txlogTopEarners = document.getElementById('txlogTopEarners');
const txlogTopLosers = document.getElementById('txlogTopLosers');
const txlogTable = document.getElementById('txlogTable');
const txlogUserFilter = document.getElementById('txlogUserFilter');
const btnTxLogFilter = document.getElementById('btnTxLogFilter');
const btnTxLogClearFilter = document.getElementById('btnTxLogClearFilter');
const btnTxLogLoadMore = document.getElementById('btnTxLogLoadMore');

let txlogCurrentFilter = null; // username, or null for everyone
let txlogRows = []; // accumulated across "Load More" pages

// Action labels are either a gameLogic function name ("doBuyFood") or an explicit "route/label"
// string (e.g. "players/rob:victim") for the two-character routes -- humanize both into something
// readable without a lookup table that'd need updating every time a new action is added.
function humanizeTxAction(action) {
  if (!action) return 'Unknown';
  if (action.startsWith('do')) {
    return action
      .slice(2)
      .replace(/([A-Z])/g, ' $1')
      .trim();
  }
  return action
    .split(/[/:]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' → ');
}

function formatTxMoney(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function renderTxTiles(totals) {
  const netCls = totals.netChange >= 0 ? 'gain' : 'loss';
  txlogTiles.innerHTML = `
    <div class="txlog-tile">
      <span class="txlog-tile-label">Transactions Logged</span>
      <span class="txlog-tile-value">${totals.count.toLocaleString()}</span>
    </div>
    <div class="txlog-tile">
      <span class="txlog-tile-label">Total Volume Moved</span>
      <span class="txlog-tile-value">${formatTxMoney(totals.volume)}</span>
    </div>
    <div class="txlog-tile">
      <span class="txlog-tile-label">Net Money Supply Change</span>
      <span class="txlog-tile-value ${netCls}">${formatTxMoney(totals.netChange)}</span>
    </div>
  `;
}

// Generic horizontal bar chart: each row gets a label, a bar sized relative to the largest value
// in the set, and the formatted value itself.
function renderTxBarChart(container, rows, { getLabel, getValue, formatValue, barClass }) {
  if (!rows.length) {
    container.innerHTML = '<p class="txlog-empty">No data yet.</p>';
    return;
  }
  const maxAbs = Math.max(...rows.map((r) => Math.abs(getValue(r))), 1);
  container.innerHTML = rows.map((r) => {
    const value = getValue(r);
    const pct = Math.max(4, Math.round((Math.abs(value) / maxAbs) * 100));
    return `
      <div class="txlog-bar-row">
        <span class="txlog-bar-label">${escapeHtml(getLabel(r))}</span>
        <div class="txlog-bar-track">
          <div class="txlog-bar-fill ${barClass}" style="width: ${pct}%"></div>
        </div>
        <span class="txlog-bar-value">${formatValue(value, r)}</span>
      </div>
    `;
  }).join('');
}

function renderTxSummary(summary) {
  renderTxTiles(summary.totals);

  renderTxBarChart(txlogGainsChart, summary.byActionGains, {
    getLabel: (r) => humanizeTxAction(r.action),
    getValue: (r) => r.total,
    formatValue: (v, r) => `${formatTxMoney(v)} (${r.count}x)`,
    barClass: 'txlog-bar-gain',
  });

  renderTxBarChart(txlogSinksChart, summary.byActionSinks, {
    getLabel: (r) => humanizeTxAction(r.action),
    getValue: (r) => r.total,
    formatValue: (v, r) => `${formatTxMoney(v)} (${r.count}x)`,
    barClass: 'txlog-bar-sink',
  });

  renderTxBarChart(txlogTopEarners, summary.topEarners, {
    getLabel: (r) => r.userName,
    getValue: (r) => r.net,
    formatValue: (v) => formatTxMoney(v),
    barClass: 'txlog-bar-gain',
  });

  renderTxBarChart(txlogTopLosers, summary.topLosers, {
    getLabel: (r) => r.userName,
    getValue: (r) => r.net,
    formatValue: (v) => formatTxMoney(v),
    barClass: 'txlog-bar-sink',
  });
}

function renderTxTable() {
  if (!txlogRows.length) {
    txlogTable.innerHTML = '<p class="txlog-empty">No transactions yet.</p>';
    return;
  }
  txlogTable.innerHTML = txlogRows.map((t) => `
    <div class="txlog-row">
      <span class="txlog-row-time">${new Date(t.createdAt).toLocaleString()}</span>
      <span class="txlog-row-name">${escapeHtml(t.userName)}</span>
      <span class="txlog-row-action">${humanizeTxAction(t.action)}</span>
      <span class="txlog-row-delta ${t.delta >= 0 ? 'gain' : 'loss'}">${formatTxMoney(t.delta)}</span>
      <span class="txlog-row-balance">${formatTxMoney(t.balanceAfter)}</span>
    </div>
  `).join('');
}

async function refreshTxSummary() {
  try {
    const result = await apiAdminTransactionsSummary();
    renderTxSummary(result.summary);
  } catch (err) {
    txlogTiles.innerHTML = `<p class="txlog-empty">${err.reason || 'Could not load summary.'}</p>`;
  }
}

async function loadTxPage(reset) {
  if (reset) {
    txlogRows = [];
    txlogTable.innerHTML = '<p class="txlog-empty">Loading...</p>';
  }
  try {
    const beforeId = reset ? null : (txlogRows.length ? txlogRows[txlogRows.length - 1].id : null);
    const result = await apiAdminTransactions({ username: txlogCurrentFilter, beforeId });
    txlogRows = reset ? result.transactions : [...txlogRows, ...result.transactions];
    renderTxTable();
    btnTxLogLoadMore.classList.toggle('hidden', result.transactions.length === 0 || !!txlogCurrentFilter);
  } catch (err) {
    txlogTable.innerHTML = `<p class="txlog-empty">${err.reason || 'Could not load transactions.'}</p>`;
  }
}

btnAdminTransactionLog.addEventListener('click', () => {
  transactionLogModal.classList.remove('hidden');
  txlogUserFilter.value = '';
  txlogCurrentFilter = null;
  refreshTxSummary();
  loadTxPage(true);
});

btnTxLogClose.addEventListener('click', () => transactionLogModal.classList.add('hidden'));
btnTxLogCloseX.addEventListener('click', () => transactionLogModal.classList.add('hidden'));

btnTxLogFilter.addEventListener('click', () => {
  txlogCurrentFilter = txlogUserFilter.value.trim() || null;
  loadTxPage(true);
});

btnTxLogClearFilter.addEventListener('click', () => {
  txlogUserFilter.value = '';
  txlogCurrentFilter = null;
  loadTxPage(true);
});

btnTxLogLoadMore.addEventListener('click', () => loadTxPage(false));
