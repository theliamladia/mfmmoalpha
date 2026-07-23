// ---------- market sub-tabs ----------
const marketTabBtns = document.querySelectorAll('.market-tab-btn');
const shopEls = {
  gym: document.getElementById('shop-gym'),
  pizza: document.getElementById('shop-pizza'),
  maxx: document.getElementById('shop-maxx'),
  titles: document.getElementById('shop-titles'),
};

marketTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    marketTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(shopEls).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.shop));
  });
});

// ---------- casino sub-tabs ----------
const casinoTabBtns = document.querySelectorAll('.casino-tab-btn');
const casinoShopEls = {
  cashier: document.getElementById('shop-cashier'),
  blackjack: document.getElementById('shop-blackjack'),
  slots: document.getElementById('shop-slots'),
  tables: document.getElementById('shop-tables'),
};

casinoTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    casinoTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(casinoShopEls).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.shop));
    if (typeof setCasinoTablesTabVisible === 'function') setCasinoTablesTabVisible(btn.dataset.shop === 'tables');
  });
});

// ---------- streets (instant + cooldown) ----------
const hustleButtons = document.querySelectorAll('.hustle-btn');
const hustleToast = document.getElementById('hustleToast');

function getRemainingCooldown(action, durationMs = COOLDOWN_MS) {
  const last = character.cooldowns[action] || 0;
  const remaining = durationMs - (Date.now() + clockOffsetMs - last);
  return remaining > 0 ? remaining : 0;
}

// Work, Slut, and Crime are server-authoritative -- the client just sends the request and
// renders whatever character/messages come back, same shape as the old local doHustle().
const HUSTLE_API = { work: apiWork, slut: apiSlut, crime: apiCrime };

async function runHustleViaServer(type, btn) {
  btn.disabled = true;
  try {
    const result = await HUSTLE_API[type]();
    character = result.character;
    const entries = result.messages || [{ message: result.message, cls: result.cls }];
    entries.forEach((e) => logMessage(e.message, e.cls));
    // The toast always shows the freshest line, replacing whatever was there before -- it's not a
    // history (that's what #activityLog below it is for), just "what just happened, loudly".
    const latest = entries[entries.length - 1];
    hustleToast.textContent = latest.message;
    hustleToast.className = `hustle-toast ${latest.cls || ''}`;
    save();
    if (result.jailed) {
      goToJail(true);
      return;
    }
    renderAll();
  } catch (err) {
    logMessage(err.reason || 'Could not reach the server.', 'loss');
  }
}

hustleButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.hustle;
    if (getRemainingCooldown(type) > 0) return;
    runHustleViaServer(type, btn);
  });
});

const HUSTLE_EMOJI = { work: '💼', slut: '💋', crime: '🔪' };

function tickCooldownUI() {
  if (!character) return;
  renderServerBanners();
  if (isGamePaused()) return;
  hustleButtons.forEach((btn) => {
    const type = btn.dataset.hustle;
    const remaining = getRemainingCooldown(type);
    btn.disabled = remaining > 0;
    const label = `${HUSTLE_EMOJI[type] || ''} ${type.charAt(0).toUpperCase() + type.slice(1)}`.trim();
    btn.textContent = remaining > 0 ? `${label} (${Math.ceil(remaining / 1000)}s)` : label;
  });
  tickMilosCooldownUI();
  tickBankCountdown();
  tickJailActivityUI();
  if (!shopEls.gym.classList.contains('hidden')) renderGym();
}

function tickBankCountdown() {
  const el = document.getElementById('bankDraftCountdown');
  const textEl = document.getElementById('bankDraftCountdownText');
  if (!el || !character || !character.bank.hasCreditCard) {
    if (el) el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const remaining = Math.max(0, BANK_BILLING_INTERVAL_MS - (Date.now() - character.bank.lastBillTs));
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
  textEl.textContent = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

setInterval(tickCooldownUI, 250);

// ---------- Jim's Gym ----------
const gymFuelEl = document.getElementById('gymFuel');
const gymMuscleEl = document.getElementById('gymMuscle');
const roidJailBanner = document.getElementById('roidJailBanner');
const roidClicksLeftEl = document.getElementById('roidClicksLeft');
const btnWorkout = document.getElementById('btnWorkout');
const steroidTierButtons = document.getElementById('steroidTierButtons');
const steroidTierDesc = document.getElementById('steroidTierDesc');
const btnRoidEscape = document.getElementById('btnRoidEscape');
const gymLog = document.getElementById('gymLog');

function currentSteroidTier() {
  return character.gym.steroidTier ? STEROID_TIERS_BY_ID[character.gym.steroidTier] : null;
}

function renderGym() {
  gymFuelEl.textContent = round1(character.fatGained);
  gymMuscleEl.textContent = round1(character.muscleGained);
  const inRoidJail = character.gym.roidJailClicksRemaining > 0;
  roidJailBanner.classList.toggle('hidden', !inRoidJail);
  roidClicksLeftEl.textContent = character.gym.roidJailClicksRemaining;

  const tier = currentSteroidTier();
  const cost = GYM_COST * (tier ? tier.mult : 1);
  const hasFuel = character.fatGained >= GYM_BURN_LBS;
  btnWorkout.disabled = !hasFuel || character.cash < cost;
  btnWorkout.textContent = hasFuel ? `Workout ($${cost})` : 'Eat at Pete\'sza first';

  steroidTierDesc.textContent = tier
    ? `${tier.name}: ${tier.mult}x cost/gains. ${Math.round(tier.jailChance * 100)}% chance of ${tier.jailClicks} clicks in Roid Jail.`
    : 'No cycle active -- pick one for bigger gains at the cost of Roid Jail risk.';

  steroidTierButtons.innerHTML = ['none', ...STEROID_TIERS.map((t) => t.id)].map((id) => {
    const t = id === 'none' ? null : STEROID_TIERS_BY_ID[id];
    const active = character.gym.steroidTier === (t ? t.id : null);
    return `<button data-steroid-tier="${id}" class="${active ? 'active-hustle' : ''}">${t ? t.name : 'None'}</button>`;
  }).join('');

  steroidTierButtons.querySelectorAll('[data-steroid-tier]').forEach((btn) => {
    btn.addEventListener('click', () => runSteroidTierViaServer(btn.dataset.steroidTier === 'none' ? null : btn.dataset.steroidTier));
  });

  const stretchRemaining = getRemainingCooldown('stretchHeight', STRETCH_HEIGHT_COOLDOWN_MS);
  const hasMuscle = character.muscleGained >= STRETCH_HEIGHT_MUSCLE_COST;
  btnStretchHeight.disabled = stretchRemaining > 0 || !hasMuscle;
  btnStretchHeight.textContent = stretchRemaining > 0
    ? `Stretch (${Math.ceil(stretchRemaining / 1000)}s)`
    : hasMuscle ? 'Stretch' : `Need ${STRETCH_HEIGHT_MUSCLE_COST} lbs Muscle`;
}

// Gym actions (Workout, steroid tier, Roid Escape) are server-authoritative -- same shape as the
// hustles: send the request, swap in whatever character comes back.
async function runWorkoutViaServer() {
  try {
    const result = await apiWorkout();
    character = result.character;
    logTo(gymLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    logTo(gymLog, err.reason || 'Could not reach the server.', 'loss');
  }
}

btnWorkout.addEventListener('click', runWorkoutViaServer);

async function runSteroidTierViaServer(tierId) {
  try {
    const result = await apiSetSteroidTier(tierId);
    character = result.character;
    save();
    renderAll();
  } catch (err) {
    logTo(gymLog, err.reason || 'Could not reach the server.', 'loss');
  }
}

async function runRoidEscapeViaServer() {
  try {
    const result = await apiRoidEscape();
    character = result.character;
    logTo(gymLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    alert(err.reason || 'Could not reach the server.');
  }
}

btnRoidEscape.addEventListener('click', runRoidEscapeViaServer);

const btnStretchHeight = document.getElementById('btnStretchHeight');

async function runStretchHeightViaServer() {
  try {
    const result = await apiStretchHeight();
    character = result.character;
    logTo(gymLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    logTo(gymLog, err.reason || 'Could not reach the server.', 'loss');
  }
}

btnStretchHeight.addEventListener('click', runStretchHeightViaServer);

// ---------- Pete'sza ----------
const foodGrid = document.getElementById('foodGrid');
const pizzaLog = document.getElementById('pizzaLog');

function buildFoodGrid() {
  foodGrid.innerHTML = '';
  const discounted = jobPerkActive('milos11', false);
  FOOD_ITEMS.forEach((item) => {
    const lbs = item.calories / CALORIES_PER_LB;
    const cost = round2(item.cost * (discounted ? 0.8 : 1));
    const card = document.createElement('div');
    card.className = 'hustle-card';
    card.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.calories} cal &asymp; +${round1(lbs)} lbs Fat (fuel for the gym).<br>-${round1(lbs * SPEED_LOSS_PER_LB)} Speed.</p>
      <button data-food="${item.id}">Buy ($${cost.toFixed(2)})${discounted ? ' – Employee Discount' : ''}</button>
    `;
    foodGrid.appendChild(card);
  });

  foodGrid.querySelectorAll('button[data-food]').forEach((btn) => {
    btn.addEventListener('click', () => buyFood(btn.dataset.food));
  });
}

// Pete'sza is server-authoritative -- same request/response shape as the hustles and gym.
async function buyFood(itemId) {
  try {
    const result = await apiBuyFood(itemId);
    character = result.character;
    (result.messages || [{ message: result.message, cls: result.cls }]).forEach((e) => logTo(pizzaLog, e.message, e.cls));
    save();
    renderAll();
  } catch (err) {
    alert(err.reason || 'Could not reach the server.');
  }
}

// ---------- Luke's Maxxerstore ----------
const maxxGrid = document.getElementById('maxxGrid');
const maxxLog = document.getElementById('maxxLog');

// Each Maxx item is a one-time procedure -- owned once purchased, same "Owned" pattern as the
// Title Store (js/market.js buildTitleGrid), so re-buying a cheap item can never out-value a
// pricier one.
function buildMaxxGrid() {
  maxxGrid.innerHTML = '';
  const purchased = character.maxxPurchased || [];
  MAXX_ITEMS.forEach((item) => {
    const owned = purchased.includes(item.id);
    const card = document.createElement('div');
    card.className = 'hustle-card';
    card.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.desc}</p>
      <button data-maxx="${item.id}" ${owned ? 'disabled' : ''}>${owned ? 'Owned' : `Buy ($${item.cost})`}</button>
    `;
    maxxGrid.appendChild(card);
  });

  maxxGrid.querySelectorAll('button[data-maxx]').forEach((btn) => {
    btn.addEventListener('click', () => buyMaxx(btn.dataset.maxx));
  });
}

// Luke's Maxxerstore is server-authoritative -- same request/response shape as Pete'sza.
async function buyMaxx(itemId) {
  try {
    const result = await apiBuyMaxx(itemId);
    character = result.character;
    logTo(maxxLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    alert(err.reason || 'Could not reach the server.');
  }
}

// ---------- Title Store ----------
const titleGrid = document.getElementById('titleGrid');
const titleLog = document.getElementById('titleLog');
const btnTitleChevron = document.getElementById('btnTitleChevron');
const titleDropdown = document.getElementById('titleDropdown');

// `char` defaults to the current player but any character object works -- needed so a custom
// title created by (and living inside) one player's save can still be looked up correctly when a
// different client renders THAT player's badge (see displayBadgeMarkupFor below).
function allTitleDefsFor(char) {
  return [
    PEAK_TITLE, CAESAR_TI_TITLE, ADMIN_TITLE, FAT_FUCK_TITLE, LOOSE_TITLE,
    LOOKSMAXXER_TITLE, NETWORTH_TITLE, HIGHEST_LEVEL_TITLE, HEIGHTMAXXED_TITLE,
    ...TITLES, ...BETA_SPIN_TITLES, ...GOOD_SEASON1_TITLES, ...ANIMA_CRATE_TITLES, ...COUNTERFINISH_CRATE_TITLES,
    ...((char.titles && char.titles.customTitles) || []),
  ];
}

function allTitleDefs() {
  return allTitleDefsFor(character);
}

// Titles tracked as inventory stacks: tradeable, "owned" only while at least one copy remains.
const CRATE_TITLE_IDS = new Set([
  ...BETA_SPIN_TITLES, ...GOOD_SEASON1_TITLES, ...ANIMA_CRATE_TITLES, ...COUNTERFINISH_CRATE_TITLES,
].map((t) => t.id));
CRATE_TITLE_IDS.add(CAESAR_TI_TITLE.id);
CRATE_TITLE_IDS.add(ADMIN_TITLE.id);

// Crate titles (and custom titles, same inventory-stack pattern) are "owned" only while at least
// one copy sits in inventory (tradeable, can drop to 0). Purchased/earned titles (Cosmetixxx buys,
// PEAK CIVILIAN) stay in the permanent titles.owned list. Checking both covers either case without
// needing to know in advance which kind a given id is.
function isTitleOwned(titleId) {
  return character.titles.owned.includes(titleId) || inventoryQty(titleId) > 0;
}

// Which crate a title (or the base title a prestige stack was prestiged from) came from, for
// grouping the Switch Title dropdown. Anything not in one of these sets (purchased Cosmetixxx
// titles, PEAK CIVILIAN, leaderboard/achievement titles, custom titles) falls into "Other Titles".
const TITLE_CRATE_GROUPS = [
  { label: '📦 OPEN BETA CRATE', ids: new Set(BETA_SPIN_TITLES.map((t) => t.id)) },
  { label: '🏆 GOOD® Season 1', ids: new Set(GOOD_SEASON1_TITLES.map((t) => t.id)) },
  { label: '🎮 ANIMA CRATE', ids: new Set(ANIMA_CRATE_TITLES.map((t) => t.id)) },
  { label: '🎨 COUNTERFINISH CRATE', ids: new Set(COUNTERFINISH_CRATE_TITLES.map((t) => t.id)) },
];
const OTHER_TITLES_LABEL = '🎖️ Other Titles';

function titleCrateGroupLabel(title) {
  const baseId = title.prestigeBaseId || title.id;
  const group = TITLE_CRATE_GROUPS.find((g) => g.ids.has(baseId));
  return group ? group.label : OTHER_TITLES_LABEL;
}

// Every title def the player currently owns, from both storage shapes: the permanent
// titles.owned array (Cosmetixxx buys, PEAK CIVILIAN, leaderboard/achievement grants) and
// inventory stacks (crate wins and their prestige tiers, tradeable, "owned" only while qty > 0).
// getItemDef resolves prestige ids (betaSpin2026_p1, etc.) that never appear in the static
// catalogs, so this is the only reliable way to enumerate everything ownable for the dropdown.
function ownedTitleDefs() {
  const fromOwned = character.titles.owned.map((id) => getItemDef(id)).filter((t) => t && t.type === 'title');
  const fromInventory = character.inventory
    .filter((stack) => stack.qty > 0)
    .map((stack) => getItemDef(stack.id))
    .filter((t) => t && t.type === 'title');
  const seen = new Set();
  return [...fromOwned, ...fromInventory].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function titleBadgeMarkup(title) {
  if (title.custom) {
    const bg = title.isGif
      ? `background-image:url('${title.background}');background-size:cover;background-position:center;`
      : `background:${title.background};`;
    const border = title.borderColor ? `border:2px solid ${title.borderColor};` : '';
    const textColor = title.textColor ? `color:${title.textColor};` : '';
    return `<span class="title-badge" style="${bg}${border}"><span class="title-text" style="${textColor}">${escapeHtml(title.name)}</span></span>`;
  }
  return `<span class="title-badge ${title.cssClass}"><span class="title-text">${title.name}</span></span>`;
}

function titleHoverMarkup(title) {
  return `
    <span class="title-hover-wrap">
      ${titleBadgeMarkup(title)}
      <div class="title-info-card">
        <p class="title-info-rank">${title.name}</p>
        <p class="title-info-how">${title.how}</p>
      </div>
    </span>
  `;
}

// Auto-grant PEAK CIVILIAN once all stats hit the cap, like an earned (not bought) title.
function checkPeakTitleGrant() {
  if (computeRank() === 'PEAK CIVILIAN' && !character.titles.owned.includes(PEAK_TITLE.id)) {
    character.titles.owned.push(PEAK_TITLE.id);
    if (!character.titles.equipped) character.titles.equipped = PEAK_TITLE.id;
    save();
  }
}

function getDisplayTitle() {
  checkPeakTitleGrant();
  const equippedId = character.titles.equipped;
  if (equippedId && isTitleOwned(equippedId)) {
    // getItemDef (not allTitleDefs().find) since it also resolves prestige stacks
    // (e.g. betaSpin2026_p1 -> "Beta 2026 I"), which only ever exist as inventory stacks, never
    // in the static title catalogs.
    const t = getItemDef(equippedId);
    if (t && t.type === 'title') return t;
  }
  return null;
}

// Read-only variant of getDisplayTitle()/computeRank() for other players' characters (e.g. the
// online roster) -- takes the character as a parameter instead of touching the global `character`,
// and skips checkPeakTitleGrant() since we shouldn't be mutating someone else's save.
function displayBadgeMarkupFor(otherChar) {
  const equippedId = otherChar.titles && otherChar.titles.equipped;
  let title = null;
  if (equippedId) {
    const owned = (otherChar.titles.owned || []).includes(equippedId)
      || (otherChar.inventory || []).some((stack) => stack.id === equippedId && stack.qty > 0);
    // getItemDef(id, otherChar) -- not the viewer's own allTitleDefs() -- so both a custom title's
    // full definition (which only ever lives inside its creator's save) and a prestige stack
    // (e.g. betaSpin2026_p1) resolve correctly no matter who's viewing.
    if (owned) title = getItemDef(equippedId, otherChar);
  }
  if (title) return titleHoverMarkup(title);

  const s = otherChar.stats;
  const allMax = [s.health, s.attack, s.speed, s.defense, s.looks].every((v) => v >= STAT_CAP);
  return `<span class="badge rank-badge">${allMax ? 'PEAK CIVILIAN' : 'CIVILIAN'}</span>`;
}

function buildTitleGrid() {
  titleGrid.innerHTML = '';
  TITLES.forEach((title) => {
    const owned = character.titles.owned.includes(title.id);
    const card = document.createElement('div');
    card.className = 'hustle-card';
    card.innerHTML = `
      <div class="title-preview">${titleHoverMarkup(title)}</div>
      <p>${owned ? 'Owned' : `$${title.cost.toLocaleString()}`}</p>
      <button data-title="${title.id}" ${owned ? 'disabled' : ''}>${owned ? 'Owned' : `Buy ($${title.cost.toLocaleString()})`}</button>
    `;
    titleGrid.appendChild(card);
  });

  titleGrid.querySelectorAll('button[data-title]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = TITLES.find((t) => t.id === btn.dataset.title);
      buyTitle(title);
    });
  });
}

function doBuyTitle(title) {
  if (character.titles.owned.includes(title.id)) return { ok: false };
  if (character.cash < title.cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= title.cost;
  character.titles.owned.push(title.id);
  if (!character.titles.equipped) character.titles.equipped = title.id;
  return { ok: true, message: `Purchased the ${title.name} title.`, cls: 'gain' };
}

function buyTitle(title) {
  const result = doBuyTitle(title);
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  logTo(titleLog, result.message, result.cls);
  save();
  buildTitleGrid();
  renderAll();
}

const CRATE_OPEN_BETA = { name: 'OPEN BETA CRATE', icon: '\u{1F4E6}', cost: BETA_SPIN_COST, titles: BETA_SPIN_TITLES };
const CRATE_GOOD_SEASON1 = { name: 'GOOD® Season 1', icon: '\u{1F3C6}', cost: GOOD_SEASON1_COST, titles: GOOD_SEASON1_TITLES };
const CRATE_ANIMA = { name: 'ANIMA CRATE', icon: '\u{1F3AE}', cost: ANIMA_CRATE_COST, titles: ANIMA_CRATE_TITLES };
const CRATE_COUNTERFINISH = { name: 'COUNTERFINISH CRATE', icon: '\u{1F3A8}', cost: COUNTERFINISH_CRATE_COST, titles: COUNTERFINISH_CRATE_TITLES };

// OPEN BETA and GOOD® Season 1 are archived -- view-only odds, no spin button/message element.
const betaSpinMessage = document.getElementById('betaSpinMessage');
const btnViewCrate = document.getElementById('btnViewCrate');
const btnViewGoodSeasonCrate = document.getElementById('btnViewGoodSeasonCrate');

const btnAnimaSpin = document.getElementById('btnAnimaSpin');
const animaSpinMessage = document.getElementById('animaSpinMessage');
const btnViewAnimaCrate = document.getElementById('btnViewAnimaCrate');
const animaSpinQtyInput = document.getElementById('animaSpinQty');

const btnCounterfinishSpin = document.getElementById('btnCounterfinishSpin');
const counterfinishSpinMessage = document.getElementById('counterfinishSpinMessage');
const btnViewCounterfinishCrate = document.getElementById('btnViewCounterfinishCrate');
const counterfinishSpinQtyInput = document.getElementById('counterfinishSpinQty');

const CRATE_SPIN_MAX_QTY = 10;
// Up to this many rolls still play the reel animation once per roll, in sequence. Past it, the
// button switches to "Quick Open" and results resolve instantly (see spinCrate) -- animating a big
// batch would just be a long wait with no benefit.
const CRATE_ANIMATE_MAX_QTY = 5;

// Keyed by crate object identity so getCrateQty/updateSpinButtonLabel work off whichever crate is
// passed in, without hardcoding a growing if/else chain as more crates get spin buttons.
const CRATE_QTY_INPUT_BY_CRATE = new Map();

function registerCrateQtyInput(crate, input, button) {
  CRATE_QTY_INPUT_BY_CRATE.set(crate, input);
  const baseLabel = button.textContent;
  const updateLabel = () => {
    const qty = getCrateQty(crate);
    if (qty <= 1) { button.textContent = baseLabel; return; }
    const totalCost = crate.cost * qty;
    button.textContent = qty > CRATE_ANIMATE_MAX_QTY
      ? `Quick Open ${qty}x ($${totalCost.toLocaleString()})`
      : `Spin ${qty}x ($${totalCost.toLocaleString()})`;
  };
  input.addEventListener('input', updateLabel);
  updateLabel();
}

function getCrateQty(crate) {
  const input = CRATE_QTY_INPUT_BY_CRATE.get(crate);
  if (!input) return 1;
  const clamped = Math.max(1, Math.min(CRATE_SPIN_MAX_QTY, Math.round(Number(input.value) || 1)));
  input.value = clamped;
  return clamped;
}

const crateOddsModal = document.getElementById('crateOddsModal');
const crateOddsTitle = document.getElementById('crateOddsTitle');
const crateOddsList = document.getElementById('crateOddsList');
const btnCrateOddsClose = document.getElementById('btnCrateOddsClose');

function weightedTitleFrom(titles) {
  const totalWeight = titles.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const t of titles) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return titles[0];
}

// Whole percents for common items, but rare pulls round to 0% at 0-decimal precision -- give them
// enough decimals to actually show up (e.g. a 0.05% weight would otherwise just read "0%").
function formatCratePct(pct) {
  const decimals = pct >= 1 ? 1 : pct >= 0.1 ? 2 : 3;
  const str = pct.toFixed(decimals).replace(/\.?0+$/, '');
  return `${str}%`;
}

function showCrateOdds(crate) {
  const totalWeight = crate.titles.reduce((sum, t) => sum + t.weight, 0);
  crateOddsTitle.innerHTML = `${crate.icon} ${crate.name} Odds`;
  const sorted = [...crate.titles].sort((a, b) => b.weight - a.weight);
  crateOddsList.innerHTML = sorted.map((t) => `
    <div class="crate-odds-row">
      ${titleBadgeMarkup(t)}
      <span class="crate-odds-pct">${formatCratePct((t.weight / totalWeight) * 100)}</span>
    </div>
  `).join('');
  crateOddsModal.classList.remove('hidden');
}

btnViewCrate.addEventListener('click', () => showCrateOdds(CRATE_OPEN_BETA));
btnViewGoodSeasonCrate.addEventListener('click', () => showCrateOdds(CRATE_GOOD_SEASON1));
btnViewAnimaCrate.addEventListener('click', () => showCrateOdds(CRATE_ANIMA));
btnViewCounterfinishCrate.addEventListener('click', () => showCrateOdds(CRATE_COUNTERFINISH));

btnCrateOddsClose.addEventListener('click', () => {
  crateOddsModal.classList.add('hidden');
});

const crateResultModal = document.getElementById('crateResultModal');
const crateResultBadge = document.getElementById('crateResultBadge');
const crateResultNote = document.getElementById('crateResultNote');
const btnCrateResultEquip = document.getElementById('btnCrateResultEquip');
const btnCrateResultContinue = document.getElementById('btnCrateResultContinue');
const btnCrateResultRollAgain = document.getElementById('btnCrateResultRollAgain');
let crateResultTitleId = null;
let lastSpunCrateContext = null;

const crateResultMultiList = document.getElementById('crateResultMultiList');

// results/alreadyOwnedFlags are parallel arrays -- length 1 for a normal single spin (keeps the
// existing animated badge reveal), length >1 for a multi-open (skips the reel animation, since
// playing it N times in a row would just be N x 4.5s of waiting -- see spinCrate).
function showCrateResult(results, alreadyOwnedFlags) {
  const isMulti = results.length > 1;
  crateResultTitleId = isMulti ? null : results[0].id;

  crateResultBadge.classList.toggle('hidden', isMulti);
  crateResultNote.classList.toggle('hidden', isMulti);
  crateResultMultiList.classList.toggle('hidden', !isMulti);
  btnCrateResultEquip.classList.toggle('hidden', isMulti);

  if (isMulti) {
    crateResultMultiList.innerHTML = results.map((title, i) => {
      const already = alreadyOwnedFlags[i];
      const note = title.displayName ? itemLabel(title) : (already ? 'Already owned' : 'New!');
      return `
        <div class="crate-result-multi-row">
          ${titleBadgeMarkup(title)}
          <span class="crate-result-multi-note">${note}${title.displayName && already ? ' (already owned)' : ''}</span>
        </div>
      `;
    }).join('');
  } else {
    const title = results[0];
    const alreadyOwned = alreadyOwnedFlags[0];
    crateResultBadge.innerHTML = titleBadgeMarkup(title);
    const base = alreadyOwned
      ? 'Already owned — another copy was added to your Inventory to trade.'
      : 'Added to your Inventory.';
    // Hidden-name titles show a blank badge above, so spell out the real item name here too
    // (matches the label already used in the Inventory tab and Trade dropdown).
    crateResultNote.textContent = title.displayName ? `${itemLabel(title)}. ${base}` : base;
  }

  const qty = lastSpunCrateContext ? lastSpunCrateContext.qty : 1;
  const totalCost = lastSpunCrateContext ? lastSpunCrateContext.crate.cost * qty : 0;
  const canRollAgain = lastSpunCrateContext && character.cash >= totalCost;
  btnCrateResultRollAgain.disabled = !canRollAgain;
  btnCrateResultRollAgain.textContent = lastSpunCrateContext
    ? (qty > CRATE_ANIMATE_MAX_QTY
      ? `Quick Open ${qty}x Again ($${totalCost.toLocaleString()})`
      : qty > 1
        ? `Open ${qty}x Again ($${totalCost.toLocaleString()})`
        : `Roll Again ($${totalCost.toLocaleString()})`)
    : 'Roll Again';
  crateResultModal.classList.remove('hidden');
}

btnCrateResultEquip.addEventListener('click', () => {
  if (crateResultTitleId) doEquipTitle(crateResultTitleId);
  crateResultModal.classList.add('hidden');
  save();
  renderAll();
});

btnCrateResultContinue.addEventListener('click', () => {
  crateResultModal.classList.add('hidden');
});

btnCrateResultRollAgain.addEventListener('click', () => {
  crateResultModal.classList.add('hidden');
  if (!lastSpunCrateContext) return;
  const { crate, buttons, messageEl, qty } = lastSpunCrateContext;
  spinCrate(crate, buttons, messageEl, { skipConfirm: true, qty });
});

// ---------- crate opening animation ----------
const crateReelWrap = document.getElementById('crateReelWrap');
const crateReelTrack = document.getElementById('crateReelTrack');
const CRATE_REEL_ITEM_COUNT = 60;
const CRATE_REEL_TARGET_INDEX = 50;
const CRATE_REEL_STEP = 142; // item width (130) + gap (12)
const CRATE_REEL_DURATION_MS = 4500;

function runCrateAnimation(crate, winningTitle, onDone) {
  const items = [];
  for (let i = 0; i < CRATE_REEL_ITEM_COUNT; i++) {
    items.push(i === CRATE_REEL_TARGET_INDEX ? winningTitle : weightedTitleFrom(crate.titles));
  }

  crateReelTrack.innerHTML = items
    .map((t, i) => `<div class="crate-reel-item" data-index="${i}">${titleBadgeMarkup(t)}</div>`)
    .join('');
  crateReelTrack.style.transition = 'none';
  crateReelTrack.style.transform = 'translateX(0)';
  crateReelWrap.classList.remove('hidden');

  requestAnimationFrame(() => {
    const viewportWidth = crateReelTrack.parentElement.clientWidth;
    const randomOffset = (Math.random() - 0.5) * (CRATE_REEL_STEP * 0.6);
    const targetX = -(CRATE_REEL_TARGET_INDEX * CRATE_REEL_STEP + CRATE_REEL_STEP / 2 - viewportWidth / 2) + randomOffset;

    requestAnimationFrame(() => {
      crateReelTrack.style.transition = `transform ${CRATE_REEL_DURATION_MS}ms cubic-bezier(0.1, 0.7, 0.15, 1)`;
      crateReelTrack.style.transform = `translateX(${targetX}px)`;
    });
  });

  setTimeout(() => {
    const landedEl = crateReelTrack.querySelector(`[data-index="${CRATE_REEL_TARGET_INDEX}"]`);
    if (landedEl) landedEl.classList.add('landed');
    onDone();
  }, CRATE_REEL_DURATION_MS + 200);
}

function doStartCrateSpin(crate, qty) {
  const totalCost = crate.cost * qty;
  if (character.cash < totalCost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= totalCost;
  const results = [];
  for (let i = 0; i < qty; i++) results.push(weightedTitleFrom(crate.titles));
  return { ok: true, results };
}

// Grants sequentially (not in parallel) so if the same title comes up twice in one multi-open,
// the second copy correctly reports alreadyOwned -- true after the first grant already added it.
function doGrantCrateWins(titleIds) {
  return titleIds.map((id) => {
    const alreadyOwned = inventoryQty(id) > 0;
    addToInventory(id, 1);
    return alreadyOwned;
  });
}

function spinCrate(crate, buttons, messageEl, opts = {}) {
  const { skipConfirm = false, qty: qtyOverride } = opts;
  const qty = qtyOverride || getCrateQty(crate);
  const totalCost = crate.cost * qty;

  if (character.cash < totalCost) {
    alert('Not enough Floydbucks.');
    return;
  }
  if (!skipConfirm) {
    const verb = qty > CRATE_ANIMATE_MAX_QTY ? 'Quick Open' : 'Spin';
    const confirmMsg = qty > 1
      ? `${verb} the ${crate.name} ${qty}x for $${totalCost.toLocaleString()} total? ARE YOU SURE?`
      : `Spin the ${crate.name} for $${crate.cost.toLocaleString()}? ARE YOU SURE?`;
    if (!confirm(confirmMsg)) return;
  }

  lastSpunCrateContext = { crate, buttons, messageEl, qty };
  const start = doStartCrateSpin(crate, qty);
  if (!start.ok) { alert(start.reason); return; }
  save();
  renderAll();

  buttons.forEach((b) => { b.disabled = true; });
  messageEl.textContent = 'Opening crate...';

  const finishMultiOpen = () => {
    const alreadyOwnedFlags = doGrantCrateWins(start.results.map((t) => t.id));
    const msg = `Opened ${crate.name} ${qty}x! See results below.`;
    messageEl.textContent = msg;
    logTo(titleLog, msg, 'gain');
    save();
    buildTitleGrid();
    renderAll();
    buttons.forEach((b) => { b.disabled = false; });
    showCrateResult(start.results, alreadyOwnedFlags);
  };

  if (qty === 1) {
    const won = start.results[0];
    runCrateAnimation(crate, won, () => {
      const [alreadyOwned] = doGrantCrateWins([won.id]);
      const msg = alreadyOwned
        ? `Spin landed on ${itemLabel(won)} — already owned! Another copy was added to your Inventory to trade.`
        : `Spin landed on ${itemLabel(won)}! Added to your Inventory.`;
      messageEl.textContent = msg;
      logTo(titleLog, msg, 'gain');
      save();
      buildTitleGrid();
      renderAll();
      buttons.forEach((b) => { b.disabled = false; });
      showCrateResult([won], [alreadyOwned]);
    });
    return;
  }

  if (qty <= CRATE_ANIMATE_MAX_QTY) {
    // Small batches still get the reel animation, played once per roll in sequence, before the
    // results list reveals -- unlike a single spin, granting/messaging only happens once at the end.
    let i = 0;
    const playNext = () => {
      if (i >= start.results.length) { finishMultiOpen(); return; }
      messageEl.textContent = `Opening crate ${i + 1}/${qty}...`;
      runCrateAnimation(crate, start.results[i], () => {
        i += 1;
        playNext();
      });
    };
    playNext();
    return;
  }

  // Quick Open (qty > CRATE_ANIMATE_MAX_QTY) skips the slot-reel animation entirely -- playing it
  // qty times back to back would just be a long wait for no benefit, so results resolve instantly.
  finishMultiOpen();
}

registerCrateQtyInput(CRATE_ANIMA, animaSpinQtyInput, btnAnimaSpin);
registerCrateQtyInput(CRATE_COUNTERFINISH, counterfinishSpinQtyInput, btnCounterfinishSpin);

btnAnimaSpin.addEventListener('click', () => spinCrate(CRATE_ANIMA, [btnAnimaSpin, btnViewAnimaCrate], animaSpinMessage));
btnCounterfinishSpin.addEventListener('click', () => spinCrate(CRATE_COUNTERFINISH, [btnCounterfinishSpin, btnViewCounterfinishCrate], counterfinishSpinMessage));

