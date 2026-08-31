// ---------- Bussdowns (PC scam rig) ----------
// A scam is now a played CONVERSATION in a fake chat client, not an auto-repeating timer -- there
// is no offline/idle earning left in this feature at all. This file drives: the mark-picker list,
// the chatbox (typing indicator, bubbles, reply-option buttons, terminal outcome banner), and the
// same rig gauge/parts-shop display the old build had. The server owns every script node and every
// number that moves cash/heat/jail -- this file is display + input only, same trust boundary as
// every other Bad Hustle screen.

// Must match BUSSDOWN_MAX_TEMP/BUSSDOWN_IDLE_TEMP/BUSSDOWN_COOL_RATE_PER_MS in
// mfmmoserver/gameLogic.js -- display-only, the server is authoritative on the real temp.
const BUSSDOWN_MAX_TEMP = 100;
const BUSSDOWN_IDLE_TEMP = 20;
const BUSSDOWN_COOL_RATE_PER_MS = (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP) / (10 * 60 * 1000);

// Cosmetic-only mark identities keyed by task id -- purely a display flourish, the server never
// sends a name/handle/avatar, it only knows the script. Absurdist and matched to each script's
// established mark (see mfmmoserver/gameLogic.js BUSSDOWNS_TASKS).
const BUSSDOWNS_MARK_META = {
  giftCard: { name: 'Chip', handle: '@chip_freezer_guy', initial: 'C' },
  amazonDna: { name: 'Doug', handle: '@doug_and_gerald', initial: 'D' },
  elderScam: { name: 'Gam-Gam Verlaine', handle: '@verlaine1952', initial: 'V' },
  techSupport: { name: 'Barry', handle: '@barry_toastmaster', initial: 'B' },
  cryptoRomance: { name: 'Todd', handle: '@brb_sailor_todd', initial: 'T' },
};

const bussdownsPartsLine = document.getElementById('bussdownsPartsLine');
const bussdownsGaugeInner = document.getElementById('bussdownsGaugeInner');
const bussdownsTempLine = document.getElementById('bussdownsTempLine');
const bussdownsStatusLine = document.getElementById('bussdownsStatusLine');
const bussdownsMarksView = document.getElementById('bussdownsMarksView');
const bussdownsMarksGrid = document.getElementById('bussdownsMarksGrid');
const bussdownsChatView = document.getElementById('bussdownsChatView');
const bussdownsChatAvatar = document.getElementById('bussdownsChatAvatar');
const bussdownsChatName = document.getElementById('bussdownsChatName');
const bussdownsChatHandle = document.getElementById('bussdownsChatHandle');
const bussdownsChatBody = document.getElementById('bussdownsChatBody');
const bussdownsChatOptions = document.getElementById('bussdownsChatOptions');
const btnBussdownsAbandon = document.getElementById('btnBussdownsAbandon');
const bussdownsShopGrid = document.getElementById('bussdownsShopGrid');
const bussdownsLog = document.getElementById('bussdownsLog');

let bussdownsStateCache = null;
let bussdownsPollInterval = null;
const BUSSDOWNS_POLL_MS = 15000;

// How many of the current convo's log entries are already rendered as bubbles in the DOM -- lets
// a fresh action (start/choice) animate only the NEW entries in sequence, while a rehydrate
// (page load, tab switch, refresh) can render everything instantly instead of replaying the whole
// conversation's typing indicators again.
let bussdownsRenderedCount = 0;
let bussdownsRenderedTaskId = null;
let bussdownsOptionsEnableTimer = null;
let bussdownsAnimationToken = 0;

function formatBussdownsMoney(n) {
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Green -> amber -> red as temp approaches the 100C overheat ceiling, same "convey state visually"
// reasoning as the cooldown-sweep fill bars.
function bussdownsGaugeColor(temp) {
  const pct = Math.max(0, Math.min(1, (temp - BUSSDOWN_IDLE_TEMP) / (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP)));
  if (pct < 0.5) {
    const t = pct / 0.5;
    return `rgb(${Math.round(111 + t * (242 - 111))}, ${Math.round(207 + t * (201 - 207))}, ${Math.round(151 + t * (76 - 151))})`;
  }
  const t = (pct - 0.5) / 0.5;
  return `rgb(${Math.round(242 + t * (224 - 242))}, ${Math.round(201 + t * (92 - 201))}, ${Math.round(76 + t * (92 - 76))})`;
}

// Estimated CURRENT temp, extrapolated locally between polls -- purely cosmetic smoothing between
// refreshes, same reasoning as farmStageLabel's local countdown. There is no "running a task"
// branch any more: the rig only ever cools in real time (or jumps when a conversation lands a
// heat-bearing effect/terminal, which always comes with a fresh server snapshot). The server's own
// lazy tick is what actually decides temp on the next request.
function bussdownsEstimatedTemp() {
  if (!bussdownsStateCache) return BUSSDOWN_IDLE_TEMP;
  const b = bussdownsStateCache.bussdowns;
  const elapsed = Math.max(0, Date.now() + clockOffsetMs - b.lastTickAt);
  return Math.max(BUSSDOWN_IDLE_TEMP, b.temp - elapsed * BUSSDOWN_COOL_RATE_PER_MS);
}

function bussdownsRenderGauge() {
  if (!bussdownsStateCache) return;
  const { bussdowns: b, parts } = bussdownsStateCache;
  bussdownsPartsLine.textContent = `CPU: ${parts.cpu.name} — GPU: ${parts.gpu.name} — Cooling: ${parts.cooler.name}`;
  const temp = bussdownsEstimatedTemp();
  const pct = Math.max(0, Math.min(100, ((temp - BUSSDOWN_IDLE_TEMP) / (BUSSDOWN_MAX_TEMP - BUSSDOWN_IDLE_TEMP)) * 100));
  bussdownsGaugeInner.style.width = `${pct}%`;
  bussdownsGaugeInner.style.background = bussdownsGaugeColor(temp);
  bussdownsTempLine.textContent = `${temp.toFixed(1)}C / ${BUSSDOWN_MAX_TEMP}C`;
  if (bussdownsStateCache.convo || b.convo) {
    bussdownsStatusLine.textContent = `Live conversation — ${temp.toFixed(1)}C`;
  } else if (temp >= BUSSDOWN_MAX_TEMP) {
    const secondsLeft = (temp - BUSSDOWN_IDLE_TEMP) / BUSSDOWN_COOL_RATE_PER_MS / 1000;
    bussdownsStatusLine.textContent = `OVERHEATED — cooling, ready in ~${Math.ceil(secondsLeft)}s`;
  } else if (temp > BUSSDOWN_IDLE_TEMP) {
    const secondsLeft = (temp - BUSSDOWN_IDLE_TEMP) / BUSSDOWN_COOL_RATE_PER_MS / 1000;
    bussdownsStatusLine.textContent = `Cooling — ${temp.toFixed(1)}C, idle in ~${Math.ceil(secondsLeft)}s`;
  } else {
    bussdownsStatusLine.textContent = 'Idle — pick a mark to start a conversation.';
  }
}

function bussdownsRenderMarks() {
  if (!bussdownsStateCache) return;
  const { bussdowns: b, tasks } = bussdownsStateCache;
  const temp = bussdownsEstimatedTemp();
  bussdownsMarksGrid.innerHTML = tasks.map((task) => {
    const locked = !task.unlocked;
    const overheated = temp >= BUSSDOWN_MAX_TEMP;
    const disabled = locked || overheated;
    const lockNote = locked ? `<p class="equip-picker-empty">Unlocks after ${task.unlockCompletions} lifetime completions (you have ${b.completions}).</p>` : '';
    const overheatNote = !locked && overheated ? '<p class="equip-picker-empty">Rig overheated — let it cool first.</p>' : '';
    return `
      <div class="hustle-card bussdowns-mark-card">
        <h3>${task.name}</h3>
        <p>Payout: ${formatBussdownsMoney(task.payout)} &mdash; Heat: +${task.tempPerTask.toFixed(1)}C &mdash; Bust: ${(task.bustChance * 100).toFixed(1)}%</p>
        ${lockNote}${overheatNote}
        <button data-bussdowns-mark="${task.id}" ${disabled ? 'disabled' : ''}>${locked ? 'Locked' : 'Start Chat'}</button>
      </div>
    `;
  }).join('');
  bussdownsMarksGrid.querySelectorAll('button[data-bussdowns-mark]').forEach((btn) => {
    btn.addEventListener('click', () => runBussdownsStart(btn.dataset.bussdownsMark));
  });
}

function bussdownsFormatClock(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function bussdownsAppendBubble(entry) {
  const row = document.createElement('div');
  row.className = `bussdowns-bubble-row from-${entry.from}`;
  const bubble = document.createElement('div');
  bubble.className = 'bussdowns-bubble';
  const textSpan = document.createElement('span');
  // textContent, not innerHTML -- these are script strings, but every other log surface in the
  // game treats player-adjacent text this way and there's no reason for this one to be different.
  textSpan.textContent = entry.text;
  bubble.appendChild(textSpan);
  const ts = document.createElement('span');
  ts.className = 'bussdowns-bubble-ts';
  ts.textContent = bussdownsFormatClock(new Date());
  bubble.appendChild(ts);
  row.appendChild(bubble);
  bussdownsChatBody.appendChild(row);
  bussdownsChatBody.scrollTop = bussdownsChatBody.scrollHeight;
}

function bussdownsShowTyping(from) {
  const row = document.createElement('div');
  row.className = `bussdowns-bubble-row from-${from} bussdowns-typing-row`;
  const dots = document.createElement('div');
  dots.className = 'bussdowns-typing';
  dots.innerHTML = '<span></span><span></span><span></span>';
  row.appendChild(dots);
  bussdownsChatBody.appendChild(row);
  bussdownsChatBody.scrollTop = bussdownsChatBody.scrollHeight;
  return row;
}

function bussdownsSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// Animates every log entry from `startIndex` onward: your own just-picked reply lands immediately
// (you already know what you clicked), every other entry runs its typing indicator for the node's
// (rig-scaled) typingMs first. Guarded by a token so a fast abandon/switch mid-animation can't keep
// appending bubbles into a chat view that's no longer showing that conversation.
async function bussdownsAnimateEntries(log, startIndex, myToken) {
  for (let i = startIndex; i < log.length; i += 1) {
    if (myToken !== bussdownsAnimationToken) return;
    const entry = log[i];
    const skipTyping = i === startIndex && entry.from === 'you';
    if (!skipTyping) {
      const typingRow = bussdownsShowTyping(entry.from);
      await bussdownsSleep(entry.typingMs);
      if (myToken !== bussdownsAnimationToken) { typingRow.remove(); return; }
      typingRow.remove();
    }
    bussdownsAppendBubble(entry);
  }
}

function bussdownsRenderOptionsEnabled(enabled) {
  bussdownsChatOptions.querySelectorAll('button').forEach((btn) => { btn.disabled = !enabled; });
}

function bussdownsRenderOptions(convo) {
  bussdownsChatOptions.innerHTML = '';
  if (!convo.current || !convo.current.options) return;
  convo.current.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.text;
    btn.dataset.bussdownsOption = opt.id;
    btn.addEventListener('click', () => runBussdownsChoice(opt.id));
    bussdownsChatOptions.appendChild(btn);
  });
  // Mirrors the server's anti-spam gate: buttons render immediately but stay disabled until this
  // node's typing indicator would actually have finished, so a fresh conversation's own animation
  // (which already waits out that typingMs while revealing the bubble) enables them right away,
  // while a rehydrate (which renders instantly, skipping the animation) enables them after
  // whatever's left of that wait.
  const remaining = (convo.nodeEnteredAt + convo.current.typingMs) - (Date.now() + clockOffsetMs);
  if (bussdownsOptionsEnableTimer) clearTimeout(bussdownsOptionsEnableTimer);
  if (remaining > 0) {
    bussdownsRenderOptionsEnabled(false);
    bussdownsOptionsEnableTimer = setTimeout(() => bussdownsRenderOptionsEnabled(true), remaining);
  } else {
    bussdownsRenderOptionsEnabled(true);
  }
}

function bussdownsShowOutcomeBanner(terminal, message) {
  bussdownsChatOptions.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = `bussdowns-outcome-banner ${terminal}`;
  banner.textContent = terminal === 'paid' ? `PAID — ${message}` : terminal === 'bailed' ? `BAILED — ${message}` : `BURNED — ${message}`;
  bussdownsChatBody.appendChild(banner);
  bussdownsChatBody.scrollTop = bussdownsChatBody.scrollHeight;
}

// Full instant rehydrate (page load, tab switch, poll refresh that finds a convo already live) --
// no typing-indicator replay, the player already saw all of it happen.
function bussdownsRehydrateChat(convo) {
  bussdownsChatBody.innerHTML = '';
  convo.log.forEach((entry) => bussdownsAppendBubble(entry));
  bussdownsRenderOptions(convo);
  bussdownsRenderedCount = convo.log.length;
  bussdownsRenderedTaskId = convo.taskId;
}

function bussdownsSetChatHeader(taskId) {
  const meta = BUSSDOWNS_MARK_META[taskId] || { name: 'Unknown', handle: '@unknown', initial: '?' };
  bussdownsChatAvatar.textContent = meta.initial;
  bussdownsChatName.textContent = meta.name;
  bussdownsChatHandle.textContent = meta.handle;
}

function bussdownsRenderView() {
  if (!bussdownsStateCache) return;
  // `.bussdowns.convo` (raw server state) only carries the log/pointer, not the resolved current
  // node -- the SHAPED view with `current` (what the chat actually needs to render) is the
  // top-level `.convo` the server sends alongside it. Always render off that one.
  const convo = bussdownsStateCache.convo;
  if (convo) {
    bussdownsMarksView.hidden = true;
    bussdownsChatView.hidden = false;
    bussdownsSetChatHeader(convo.taskId);
    if (bussdownsRenderedTaskId !== convo.taskId) {
      // Different (or first) conversation than what's on screen -- full instant rehydrate.
      bussdownsRehydrateChat(convo);
    }
  } else {
    bussdownsMarksView.hidden = false;
    bussdownsChatView.hidden = true;
    bussdownsRenderedTaskId = null;
    bussdownsRenderedCount = 0;
    bussdownsRenderMarks();
  }
}

function bussdownsRenderShop() {
  if (!bussdownsStateCache) return;
  const { parts } = bussdownsStateCache;
  const partLabels = { cpu: 'CPU (chat pace)', gpu: 'GPU (chat pace)', cooler: 'Cooling (heat per payout)' };
  bussdownsShopGrid.innerHTML = ['cpu', 'gpu', 'cooler'].map((part) => {
    const info = parts[part];
    const maxed = !info.next;
    const affordable = !maxed && character.cash >= info.next.cost;
    return `
      <div class="hustle-card">
        <h3>${partLabels[part]}</h3>
        <p>Installed: ${info.name}</p>
        <p>${maxed ? 'Maxed out.' : `Next: ${info.next.name} &mdash; ${formatBussdownsMoney(info.next.cost)}`}</p>
        <button data-bussdowns-upgrade="${part}" ${maxed || !affordable ? 'disabled' : ''}>${maxed ? 'Maxed' : 'Upgrade'}</button>
      </div>
    `;
  }).join('');
  bussdownsShopGrid.querySelectorAll('button[data-bussdowns-upgrade]').forEach((btn) => {
    btn.addEventListener('click', () => runBussdownsUpgrade(btn.dataset.bussdownsUpgrade));
  });
}

function renderBussdowns() {
  bussdownsRenderGauge();
  bussdownsRenderView();
  bussdownsRenderShop();
}

// Patches the live bits (gauge/timer text) every tick without a full re-render, same reasoning as
// tickFarmsUI -- a full re-render here would also nuke any in-progress button hover/focus state or
// an in-flight typing animation.
function tickBussdownsUI() {
  if (!bussdownsStateCache) return;
  bussdownsRenderGauge();
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
      save();
      if (result.jailed) { goToJail(true); return; }
      // Merge just the convo in -- bussdowns/parts/tasks/completions come from the next state
      // refresh below, this only needs enough to switch views and animate. `convo` (top-level) is
      // the shaped view with `current` that every render function reads; `.bussdowns.convo` (raw)
      // is only ever used as a truthy/falsy presence check.
      bussdownsStateCache = bussdownsStateCache
        ? { ...bussdownsStateCache, convo: result.convo, bussdowns: { ...bussdownsStateCache.bussdowns, convo: result.convo } }
        : { convo: result.convo, bussdowns: { convo: result.convo }, parts: { cpu: { name: '' }, gpu: { name: '' }, cooler: { name: '' } }, tasks: [] };
      renderAll();
      bussdownsMarksView.hidden = true;
      bussdownsChatView.hidden = false;
      bussdownsSetChatHeader(result.convo.taskId);
      bussdownsChatBody.innerHTML = '';
      bussdownsChatOptions.innerHTML = '';
      bussdownsRenderedCount = 0;
      bussdownsRenderedTaskId = result.convo.taskId;
      const myToken = (bussdownsAnimationToken += 1);
      await bussdownsAnimateEntries(result.convo.log, 0, myToken);
      if (myToken === bussdownsAnimationToken) {
        bussdownsRenderedCount = result.convo.log.length;
        bussdownsRenderOptions(result.convo);
      }
      await refreshBussdowns();
    } catch (err) {
      if (err.reason) logTo(bussdownsLog, err.reason, 'loss');
    }
  }, bussdownsLog);
}

function runBussdownsChoice(optionId) {
  attemptMilosAction(async () => {
    bussdownsRenderOptionsEnabled(false);
    try {
      const result = await apiBussdownsChoice(optionId);
      character = result.character;
      save();
      if (result.jailed) {
        logTo(bussdownsLog, result.message, result.cls);
        goToJail(true);
        return;
      }
      if (result.terminal) {
        // Terminal: the server clears the convo and hands back its final transcript (`result.log`,
        // including our just-picked reply and any trailing mark/you nodes on the way to the
        // ending) -- animate those in, then show the outcome banner in place of the option buttons.
        bussdownsStateCache = { ...bussdownsStateCache, character, convo: null, bussdowns: result.bussdowns, parts: result.parts, tasks: result.tasks };
        const myToken = (bussdownsAnimationToken += 1);
        await bussdownsAnimateEntries(result.log || [], bussdownsRenderedCount, myToken);
        if (myToken !== bussdownsAnimationToken) return;
        bussdownsShowOutcomeBanner(result.terminal, result.message);
        logTo(bussdownsLog, result.message, result.cls);
        renderAll();
        bussdownsRenderGauge();
        await bussdownsSleep(2200);
        if (myToken !== bussdownsAnimationToken) return;
        renderBussdowns();
        return;
      }
      bussdownsStateCache = { ...bussdownsStateCache, character, convo: result.convo, bussdowns: { ...bussdownsStateCache.bussdowns, convo: result.convo } };
      renderAll();
      const myToken = (bussdownsAnimationToken += 1);
      await bussdownsAnimateEntries(result.convo.log, bussdownsRenderedCount, myToken);
      if (myToken === bussdownsAnimationToken) {
        bussdownsRenderedCount = result.convo.log.length;
        bussdownsRenderOptions(result.convo);
      }
      await refreshBussdowns();
    } catch (err) {
      if (err.reason) logTo(bussdownsLog, err.reason, 'loss');
      bussdownsRenderOptionsEnabled(true);
    }
  }, bussdownsLog);
}

function runBussdownsAbandon() {
  attemptMilosAction(async () => {
    try {
      const result = await apiBussdownsAbandon();
      character = result.character;
      logTo(bussdownsLog, result.message, result.cls);
      save();
      if (result.jailed) { goToJail(true); return; }
      bussdownsAnimationToken += 1;
      if (bussdownsOptionsEnableTimer) clearTimeout(bussdownsOptionsEnableTimer);
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

if (btnBussdownsAbandon) btnBussdownsAbandon.addEventListener('click', runBussdownsAbandon);
