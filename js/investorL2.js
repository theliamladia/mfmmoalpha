// ---------- InvestorsCenter Level II Research (paid subscription + read-only Matrix feed) ----------
// Billing is client-authoritative and debounce-synced like the bank (see doBankBillingCycle in
// bank.js) -- character.investorL2 carries subscribedAt/lastBillTs/cooldownUntil, and
// processInvestorL2Billing() catches up on however many daily drafts were missed, same "while loop
// over elapsed intervals" shape as the bank. The feed CONTENT itself is server-authoritative and
// shared (see /investors/l2/feed in mfmmoserver/server.js) since every subscriber should see the
// same reports about the same shared stock prices.
const investorL2Ad = document.getElementById('investorL2Ad');
const btnInvestorL2Subscribe = document.getElementById('btnInvestorL2Subscribe');
const investorL2CooldownNote = document.getElementById('investorL2CooldownNote');
const investorL2Banner = document.getElementById('investorL2Banner');
const investorL2BannerText = document.getElementById('investorL2BannerText');
const btnInvestorL2Cancel = document.getElementById('btnInvestorL2Cancel');
const investorL2FeedWrap = document.getElementById('investorL2FeedWrap');
const investorL2FeedMessages = document.getElementById('investorL2FeedMessages');

const INVESTOR_L2_INITIAL_COST = 250000;
const INVESTOR_L2_DAILY_COST = 50000;
const INVESTOR_L2_BILLING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INVESTOR_L2_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const INVESTOR_L2_FEED_POLL_MS = 30 * 1000;

// Accounts created before this shipped won't have this field yet.
function ensureInvestorL2State() {
  if (!character.investorL2) {
    character.investorL2 = { active: false, subscribedAt: 0, lastBillTs: 0, cooldownUntil: 0 };
  }
  return character.investorL2;
}

function formatHMS(ms) {
  const clamped = Math.max(0, ms);
  const hours = Math.floor(clamped / (60 * 60 * 1000));
  const minutes = Math.floor((clamped % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((clamped % (60 * 1000)) / 1000);
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function formatDaysHours(ms) {
  const clamped = Math.max(0, ms);
  const days = Math.floor(clamped / (24 * 60 * 60 * 1000));
  const hours = Math.floor((clamped % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${days}d ${hours}h`;
}

function doInvestorL2Subscribe() {
  const l2 = ensureInvestorL2State();
  const now = Date.now();
  if (l2.active) return { ok: false, reason: 'Already subscribed to Level II Research.' };
  if (now < l2.cooldownUntil) return { ok: false, reason: `On cooldown -- you can resubscribe in ${formatDaysHours(l2.cooldownUntil - now)}.` };
  if (character.cash < INVESTOR_L2_INITIAL_COST) return { ok: false, reason: 'Not enough Floydbucks.' };

  character.cash = round2(character.cash - INVESTOR_L2_INITIAL_COST);
  l2.active = true;
  l2.subscribedAt = now;
  l2.lastBillTs = now;
  l2.cooldownUntil = 0;
  return { ok: true, message: `Subscribed to Level II Research for $${INVESTOR_L2_INITIAL_COST.toLocaleString()}. First daily draft in 24h.`, cls: 'loss' };
}

// Cancelling always starts the same 14-day cooldown as a failed payment -- the user is told this
// up front in the confirm prompt, not just after the fact.
function doInvestorL2Cancel() {
  const l2 = ensureInvestorL2State();
  if (!l2.active) return { ok: false, reason: 'Not currently subscribed.' };
  l2.active = false;
  l2.cooldownUntil = Date.now() + INVESTOR_L2_COOLDOWN_MS;
  return { ok: true, message: 'Level II Research subscription cancelled. You can resubscribe in 14 days.', cls: 'loss' };
}

// Advances one billing period and applies its draft. No DOM access -- safe to run headless.
function doInvestorL2BillingCycle() {
  const l2 = character.investorL2;
  l2.lastBillTs += INVESTOR_L2_BILLING_INTERVAL_MS;

  if (character.cash >= INVESTOR_L2_DAILY_COST) {
    character.cash = round2(character.cash - INVESTOR_L2_DAILY_COST);
    return { cancelled: false, message: `Level II Research: $${INVESTOR_L2_DAILY_COST.toLocaleString()} auto-drafted.`, cls: 'loss' };
  }

  l2.active = false;
  l2.cooldownUntil = Date.now() + INVESTOR_L2_COOLDOWN_MS;
  return { cancelled: true, message: `Level II Research subscription cancelled -- insufficient Floydbucks for the daily $${INVESTOR_L2_DAILY_COST.toLocaleString()} draft. You can resubscribe in 14 days.`, cls: 'loss' };
}

function processInvestorL2Billing() {
  const l2 = ensureInvestorL2State();
  if (!l2.active) return;
  let changed = false;
  while (l2.active && Date.now() - l2.lastBillTs >= INVESTOR_L2_BILLING_INTERVAL_MS) {
    const result = doInvestorL2BillingCycle();
    changed = true;
    if (typeof stockLog !== 'undefined' && stockLog) logTo(stockLog, result.message, result.cls);
    if (result.cancelled) break;
  }
  if (changed) save();
}

function renderInvestorL2() {
  if (!investorL2Ad) return;
  const l2 = ensureInvestorL2State();
  const now = Date.now();
  const inCooldown = !l2.active && now < l2.cooldownUntil;

  investorL2Ad.classList.toggle('hidden', l2.active || inCooldown);
  investorL2CooldownNote.classList.toggle('hidden', !inCooldown);
  investorL2Banner.classList.toggle('hidden', !l2.active);
  investorL2FeedWrap.classList.toggle('hidden', !l2.active);

  if (l2.active) {
    const remaining = INVESTOR_L2_BILLING_INTERVAL_MS - (now - l2.lastBillTs);
    investorL2BannerText.textContent = `🟢 LEVEL II RESEARCH ACTIVE — next $${INVESTOR_L2_DAILY_COST.toLocaleString()} draft in ${formatHMS(remaining)}`;
  } else if (inCooldown) {
    investorL2CooldownNote.textContent = `🔒 Subscription on cooldown — you can resubscribe in ${formatDaysHours(l2.cooldownUntil - now)}.`;
  }
}

// Cheap text-only update -- called every 250ms from market.js's tickCooldownUI alongside the
// bank/jail/farms countdowns, same reasoning as tickBankCountdown (a live per-second countdown
// reads better than waiting for the next renderAll()).
function tickInvestorL2CountdownUI() {
  if (!character || !investorL2Ad) return;
  renderInvestorL2();
}

btnInvestorL2Subscribe.addEventListener('click', () => {
  const l2 = ensureInvestorL2State();
  const now = Date.now();
  if (now < l2.cooldownUntil) {
    alert(`On cooldown -- you can resubscribe in ${formatDaysHours(l2.cooldownUntil - now)}.`);
    return;
  }
  if (!confirm(`Subscribe to Level II Research for $${INVESTOR_L2_INITIAL_COST.toLocaleString()}? You'll then be billed $${INVESTOR_L2_DAILY_COST.toLocaleString()} every day automatically. ARE YOU SURE?`)) return;

  const result = doInvestorL2Subscribe();
  if (!result.ok) { alert(result.reason); return; }
  logTo(stockLog, result.message, result.cls);
  save();
  renderAll();
  refreshInvestorL2Feed();
});

btnInvestorL2Cancel.addEventListener('click', () => {
  if (!confirm('Cancel your Level II Research subscription? You will have a 14-day cooldown before you can resubscribe. ARE YOU SURE?')) return;
  const result = doInvestorL2Cancel();
  if (!result.ok) { alert(result.reason); return; }
  logTo(stockLog, result.message, result.cls);
  save();
  renderAll();
});

// ---------- Matrix-themed read-only feed ----------
let investorL2FeedCache = [];
let lastRenderedInvestorL2Id = null;

function renderInvestorL2Feed() {
  if (!investorL2FeedMessages) return;
  const lastId = investorL2FeedCache.length ? investorL2FeedCache[investorL2FeedCache.length - 1].id : null;
  if (lastId === lastRenderedInvestorL2Id) return;
  lastRenderedInvestorL2Id = lastId;

  investorL2FeedMessages.innerHTML = investorL2FeedCache.map((post) => {
    const dirClass = post.direction === 'up' ? 'investor-l2-up' : 'investor-l2-down';
    const time = new Date(post.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="investor-l2-feed-row">
        <span class="investor-l2-feed-time">[${time}]</span>
        <span class="investor-l2-feed-msg ${dirClass}">${escapeHtml(post.message)}</span>
      </div>
    `;
  }).join('');
  investorL2FeedMessages.scrollTop = investorL2FeedMessages.scrollHeight;
}

async function refreshInvestorL2Feed() {
  if (!getAuthToken()) return;
  const l2 = ensureInvestorL2State();
  if (!l2.active) return;
  try {
    const result = await apiInvestorL2Feed();
    investorL2FeedCache = result.posts;
  } catch {
    // Best-effort -- keep showing the last known feed if the poll fails.
  }
  renderInvestorL2Feed();
}

let investorL2PollInterval = null;

// Scoped to the Investors Center sub-tab the same way stock/InvestorsChat polling is (see
// setStockMarketTabVisible in stockMarket.js) -- called alongside it from milos.js.
function setInvestorL2TabVisible(visible) {
  if (visible) {
    refreshInvestorL2Feed();
    if (!investorL2PollInterval) {
      investorL2PollInterval = setInterval(refreshInvestorL2Feed, INVESTOR_L2_FEED_POLL_MS);
    }
  } else if (investorL2PollInterval) {
    clearInterval(investorL2PollInterval);
    investorL2PollInterval = null;
  }
}
