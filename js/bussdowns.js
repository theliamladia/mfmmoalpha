// ---------- Bussdowns (PC scam rig) ----------
// Server-authoritative continuous automation: start a fraud task and it completes over and over
// until stopped or the rig overheats -- same lazy "advance on read" idiom Farms/Crypto use, so this
// file is a display-only mirror of gameLogic.js's constants/derivations plus the local countdown
// tick, same shape as js/farms.js's stageReadyAt countdown and js/crypto.js's rate mirror.

// Must match BUSSDOWN_MAX_TEMP/BUSSDOWN_IDLE_TEMP/BUSSDOWN_COOL_RATE_PER_MS in
// mfmmoserver/gameLogic.js -- display-only, the server is authoritative on the real temp.
const BUSSDOWN_MAX_TEMP = 100;
const BUSSDOWN_IDLE_TEMP = 20;
const BUSSDOWN_COOL_RATE_PER_MS = (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP) / (10 * 60 * 1000);

const bussdownsPartsLine = document.getElementById('bussdownsPartsLine');
const bussdownsGaugeInner = document.getElementById('bussdownsGaugeInner');
const bussdownsTempLine = document.getElementById('bussdownsTempLine');
const bussdownsStatusLine = document.getElementById('bussdownsStatusLine');
const bussdownsTasksGrid = document.getElementById('bussdownsTasksGrid');
const bussdownsShopGrid = document.getElementById('bussdownsShopGrid');
const bussdownsLog = document.getElementById('bussdownsLog');

let bussdownsStateCache = null;
let bussdownsPollInterval = null;
const BUSSDOWNS_POLL_MS = 15000;

function formatBussdownsDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Green -> amber -> red as temp approaches the 100C overheat ceiling, same "convey state visually"
// reasoning as the cooldown-sweep fill bars.
function bussdownsGaugeColor(temp) {
  const pct = Math.max(0, Math.min(1, (temp - BUSSDOWN_IDLE_TEMP) / (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP)));
  if (pct < 0.5) {
    // green -> amber
    const t = pct / 0.5;
    return `rgb(${Math.round(111 + t * (242 - 111))}, ${Math.round(207 + t * (201 - 207))}, ${Math.round(151 + t * (76 - 151))})`;
  }
  // amber -> red
  const t = (pct - 0.5) / 0.5;
  return `rgb(${Math.round(242 + t * (224 - 242))}, ${Math.round(201 + t * (92 - 201))}, ${Math.round(76 + t * (92 - 76))})`;
}

// Estimated CURRENT temp, extrapolated locally between polls -- purely cosmetic smoothing between
// refreshes, same reasoning as farmStageLabel's local countdown. The server's own lazy tick is what
// actually decides temp/cash on the next request.
function bussdownsEstimatedTemp() {
  if (!bussdownsStateCache) return BUSSDOWN_IDLE_TEMP;
  const b = bussdownsStateCache.bussdowns;
  if (!b.taskId) {
    const elapsed = Math.max(0, Date.now() + clockOffsetMs - b.lastTickAt);
    return Math.max(BUSSDOWN_IDLE_TEMP, b.temp - elapsed * BUSSDOWN_COOL_RATE_PER_MS);
  }
  const task = bussdownsStateCache.tasks.find((t) => t.id === b.taskId);
  if (!task) return b.temp;
  const elapsedInCycle = Math.max(0, (Date.now() + clockOffsetMs) - b.startedAt);
  const frac = Math.min(1, elapsedInCycle / task.durationMs);
  return Math.min(BUSSDOWN_MAX_TEMP, b.temp + frac * task.tempPerTask);
}

function renderBussdowns() {
  if (!bussdownsStateCache) return;
  const { bussdowns: b, parts, tasks } = bussdownsStateCache;

  bussdownsPartsLine.textContent = `CPU: ${parts.cpu.name} — GPU: ${parts.gpu.name} — Cooling: ${parts.cooler.name}`;

  const temp = bussdownsEstimatedTemp();
  const pct = Math.max(0, Math.min(100, ((temp - BUSSDOWN_IDLE_TEMP) / (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP)) * 100));
  bussdownsGaugeInner.style.width = `${pct}%`;
  bussdownsGaugeInner.style.background = bussdownsGaugeColor(temp);
  bussdownsTempLine.textContent = `${temp.toFixed(1)}C / ${BUSSDOWN_MAX_TEMP}C`;

  if (b.taskId) {
    const task = tasks.find((t) => t.id === b.taskId);
    const nextCompletionAt = b.startedAt + (task ? task.durationMs : 0);
    const remaining = Math.max(0, nextCompletionAt - (Date.now() + clockOffsetMs));
    bussdownsStatusLine.textContent = task
      ? `Running ${task.name} — next payout in ${formatBussdownsDuration(remaining)} (+$${task.payout.toLocaleString()}, +${task.tempPerTask.toFixed(1)}C)`
      : 'Running.';
  } else if (temp > BUSSDOWN_IDLE_TEMP) {
    const secondsLeft = (temp - BUSSDOWN_IDLE_TEMP) / BUSSDOWN_COOL_RATE_PER_MS / 1000;
    bussdownsStatusLine.textContent = `Cooling — ${temp.toFixed(1)}C, ready in ~${Math.ceil(secondsLeft)}s`;
  } else {
    bussdownsStatusLine.textContent = 'Idle — ready to start a task.';
  }

  bussdownsTasksGrid.innerHTML = tasks.map((task) => {
    const running = b.taskId === task.id;
    const locked = !task.unlocked;
    const disabled = locked || (b.taskId && !running) || (!running && temp >= BUSSDOWN_MAX_TEMP);
    const lockNote = locked ? `<p class="equip-picker-empty">Unlocks after ${task.unlockCompletions} lifetime completions (you have ${b.completions}).</p>` : '';
    return `
      <div class="hustle-card">
        <h3>${task.name}</h3>
        <p>Payout: $${task.payout.toLocaleString()} &mdash; Duration: ${formatBussdownsDuration(task.durationMs)} &mdash; Heat: +${task.tempPerTask.toFixed(1)}C &mdash; Bust: ${(task.bustChance * 100).toFixed(1)}%</p>
        ${lockNote}
        <button data-bussdowns-task="${task.id}" ${disabled ? 'disabled' : ''}>${running ? 'STOP' : (locked ? 'Locked' : 'Start')}</button>
      </div>
    `;
  }).join('');

  bussdownsTasksGrid.querySelectorAll('button[data-bussdowns-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.bussdownsTask;
      if (b.taskId === taskId) {
        runBussdownsStop();
      } else {
        runBussdownsStart(taskId);
      }
    });
  });

  const partLabels = { cpu: 'CPU (task speed)', gpu: 'GPU (task speed)', cooler: 'Cooling (heat per task)' };
  bussdownsShopGrid.innerHTML = ['cpu', 'gpu', 'cooler'].map((part) => {
    const info = parts[part];
    const maxed = !info.next;
    const affordable = !maxed && character.cash >= info.next.cost;
    return `
      <div class="hustle-card">
        <h3>${partLabels[part]}</h3>
        <p>Installed: ${info.name}</p>
        <p>${maxed ? 'Maxed out.' : `Next: ${info.next.name} &mdash; $${info.next.cost.toLocaleString()}`}</p>
        <button data-bussdowns-upgrade="${part}" ${maxed || !affordable ? 'disabled' : ''}>${maxed ? 'Maxed' : 'Upgrade'}</button>
      </div>
    `;
  }).join('');

  bussdownsShopGrid.querySelectorAll('button[data-bussdowns-upgrade]').forEach((btn) => {
    btn.addEventListener('click', () => runBussdownsUpgrade(btn.dataset.bussdownsUpgrade));
  });
}

// Patches the live bits (gauge/timer text) every tick without a full re-render, same reasoning as
// tickFarmsUI -- a full re-render here would also nuke any in-progress button hover/focus state.
function tickBussdownsUI() {
  if (!bussdownsStateCache) return;
  const { bussdowns: b, tasks } = bussdownsStateCache;
  const temp = bussdownsEstimatedTemp();
  const pct = Math.max(0, Math.min(100, ((temp - BUSSDOWN_IDLE_TEMP) / (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP)) * 100));
  if (bussdownsGaugeInner) {
    bussdownsGaugeInner.style.width = `${pct}%`;
    bussdownsGaugeInner.style.background = bussdownsGaugeColor(temp);
  }
  if (bussdownsTempLine) bussdownsTempLine.textContent = `${temp.toFixed(1)}C / ${BUSSDOWN_MAX_TEMP}C`;
  if (bussdownsStatusLine) {
    if (b.taskId) {
      const task = tasks.find((t) => t.id === b.taskId);
      const nextCompletionAt = b.startedAt + (task ? task.durationMs : 0);
      const remaining = Math.max(0, nextCompletionAt - (Date.now() + clockOffsetMs));
      bussdownsStatusLine.textContent = task
        ? `Running ${task.name} — next payout in ${formatBussdownsDuration(remaining)} (+$${task.payout.toLocaleString()}, +${task.tempPerTask.toFixed(1)}C)`
        : 'Running.';
    } else if (temp > BUSSDOWN_IDLE_TEMP) {
      const secondsLeft = (temp - BUSSDOWN_IDLE_TEMP) / BUSSDOWN_COOL_RATE_PER_MS / 1000;
      bussdownsStatusLine.textContent = `Cooling — ${temp.toFixed(1)}C, ready in ~${Math.ceil(secondsLeft)}s`;
    } else {
      bussdownsStatusLine.textContent = 'Idle — ready to start a task.';
    }
  }
}

async function refreshBussdowns() {
  if (!getAuthToken()) return;
  try {
    const result = await apiBussdownsState();
    bussdownsStateCache = result;
    character = result.character;
    save();
    if (result.tickMessage) logTo(bussdownsLog, result.tickMessage, result.jailed || result.overheated ? 'loss' : 'gain');
    renderAll();
    renderBussdowns();
    if (result.jailed) { goToJail(true); return; }
  } catch {
    // Best-effort -- keep showing the last known state if the fetch fails.
  }
}

function setBussdownsTabVisible(visible) {
  if (visible) {
    refreshBussdowns();
    if (!bussdownsPollInterval) bussdownsPollInterval = setInterval(refreshBussdowns, BUSSDOWNS_POLL_MS);
  } else if (bussdownsPollInterval) {
    clearInterval(bussdownsPollInterval);
    bussdownsPollInterval = null;
  }
}

function runBussdownsStart(taskId) {
  attemptMilosAction(async () => {
    try {
      const result = await apiBussdownsStart(taskId);
      character = result.character;
      logTo(bussdownsLog, result.message, result.cls);
      save();
      if (result.jailed) { goToJail(true); return; }
      renderAll();
      await refreshBussdowns();
    } catch (err) {
      if (err.reason) logTo(bussdownsLog, err.reason, 'loss');
    }
  }, bussdownsLog);
}

function runBussdownsStop() {
  attemptMilosAction(async () => {
    try {
      const result = await apiBussdownsStop();
      character = result.character;
      logTo(bussdownsLog, result.message, result.cls);
      save();
      if (result.jailed) { goToJail(true); return; }
      renderAll();
      await refreshBussdowns();
    } catch (err) {
      if (err.reason) logTo(bussdownsLog, err.reason, 'loss');
    }
  }, bussdownsLog);
}

function runBussdownsUpgrade(part) {
  attemptMilosAction(async () => {
    try {
      const result = await apiBussdownsUpgrade(part);
      character = result.character;
      logTo(bussdownsLog, result.message, result.cls);
      save();
      if (result.jailed) { goToJail(true); return; }
      renderAll();
      await refreshBussdowns();
    } catch (err) {
      if (err.reason) logTo(bussdownsLog, err.reason, 'loss');
    }
  }, bussdownsLog);
}
