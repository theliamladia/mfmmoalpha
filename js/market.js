// ---------- market sub-tabs ----------
const marketTabBtns = document.querySelectorAll('.market-tab-btn');
const shopEls = {
  gym: document.getElementById('shop-gym'),
  body: document.getElementById('shop-body'),
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
  const remaining = durationMs - (Date.now() - last);
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
  if (character.gym.bodyExercises && !shopEls.body.classList.contains('hidden')) renderBodyExerciseGrid();
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

// ---------- Body (Looks training: 5 body parts x 4 exercises each) ----------
const bodyPartTabs = document.getElementById('bodyPartTabs');
const bodyExerciseGrid = document.getElementById('bodyExerciseGrid');
const bodyLog = document.getElementById('bodyLog');
let activeBodyPart = BODY_PARTS[0];

function bodyPartAvgClient(exercises) {
  return (exercises.ex1 + exercises.ex2 + exercises.ex3 + exercises.ex4) / 4;
}

function renderBodyPartTabs() {
  bodyPartTabs.innerHTML = BODY_PARTS.map((part) => {
    const avg = bodyPartAvgClient(character.gym.bodyExercises[part]);
    const active = part === activeBodyPart;
    return `<button data-body-part="${part}" class="${active ? 'active-hustle' : ''}">${BODY_PART_LABELS[part]} (${avg.toFixed(0)})</button>`;
  }).join('');
  bodyPartTabs.querySelectorAll('[data-body-part]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeBodyPart = btn.dataset.bodyPart;
      renderBody();
    });
  });
}

function renderBodyExerciseGrid() {
  const part = activeBodyPart;
  const exercises = character.gym.bodyExercises[part];
  bodyExerciseGrid.innerHTML = BODY_EXERCISE_KEYS.map((key, i) => {
    const cooldownKey = `bodyExercise_${part}_${key}`;
    const remaining = getRemainingCooldown(cooldownKey, BODY_EXERCISE_COOLDOWN_MS);
    return `
      <div class="hustle-card job-card">
        <h3>${BODY_EXERCISE_LABELS[part][i]}</h3>
        <p>${exercises[key].toFixed(2)}</p>
        <button data-body-exercise="${key}" data-cooldown="${cooldownKey}" ${remaining > 0 ? 'disabled' : ''}>
          ${remaining > 0 ? `Train (${Math.ceil(remaining / 1000)}s)` : 'Train'}
        </button>
      </div>
    `;
  }).join('');
  bodyExerciseGrid.querySelectorAll('[data-body-exercise]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (getRemainingCooldown(btn.dataset.cooldown, BODY_EXERCISE_COOLDOWN_MS) > 0) return;
      runBodyExerciseViaServer(activeBodyPart, btn.dataset.bodyExercise);
    });
  });
}

function renderBody() {
  if (!character.gym.bodyExercises) return;
  renderBodyPartTabs();
  renderBodyExerciseGrid();
}

// Body exercises are server-authoritative, same shape as the gym/hustles -- Looks itself is
// recomputed server-side from the exercise scores + Maxx items, never sent up directly.
async function runBodyExerciseViaServer(bodyPart, exerciseKey) {
  try {
    const result = await apiBodyExercise(bodyPart, exerciseKey);
    character = result.character;
    logTo(bodyLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    logTo(bodyLog, err.reason || 'Could not reach the server.', 'loss');
  }
}

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
    const t = allTitleDefs().find((x) => x.id === equippedId);
    if (t) return t;
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
    // Look up the def from THIS character's own customTitles, not the viewer's allTitleDefs(),
    // since a custom title's full definition only ever lives inside its creator's save.
    if (owned) title = allTitleDefsFor(otherChar).find((t) => t.id === equippedId) || null;
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

const btnBetaSpin = document.getElementById('btnBetaSpin');
const betaSpinMessage = document.getElementById('betaSpinMessage');
const btnViewCrate = document.getElementById('btnViewCrate');

const btnGoodSeasonSpin = document.getElementById('btnGoodSeasonSpin');
const goodSeasonSpinMessage = document.getElementById('goodSeasonSpinMessage');
const btnViewGoodSeasonCrate = document.getElementById('btnViewGoodSeasonCrate');

const btnAnimaSpin = document.getElementById('btnAnimaSpin');
const animaSpinMessage = document.getElementById('animaSpinMessage');
const btnViewAnimaCrate = document.getElementById('btnViewAnimaCrate');

const btnCounterfinishSpin = document.getElementById('btnCounterfinishSpin');
const counterfinishSpinMessage = document.getElementById('counterfinishSpinMessage');
const btnViewCounterfinishCrate = document.getElementById('btnViewCounterfinishCrate');

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
let crateResultTitleId = null;

function showCrateResult(title, alreadyOwned) {
  crateResultTitleId = title.id;
  crateResultBadge.innerHTML = titleBadgeMarkup(title);
  const base = alreadyOwned
    ? 'Already owned — another copy was added to your Inventory to trade.'
    : 'Added to your Inventory.';
  // Hidden-name titles show a blank badge above, so spell out the real item name here too
  // (matches the label already used in the Inventory tab and Trade dropdown).
  crateResultNote.textContent = title.displayName ? `${itemLabel(title)}. ${base}` : base;
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

function doStartCrateSpin(crate) {
  if (character.cash < crate.cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= crate.cost;
  const won = weightedTitleFrom(crate.titles);
  return { ok: true, won };
}

function doGrantCrateWin(titleId) {
  const alreadyOwned = inventoryQty(titleId) > 0;
  addToInventory(titleId, 1);
  return { alreadyOwned };
}

function spinCrate(crate, buttons, messageEl) {
  if (character.cash < crate.cost) {
    alert('Not enough Floydbucks.');
    return;
  }
  if (!confirm(`Spin the ${crate.name} for $${crate.cost.toLocaleString()}? ARE YOU SURE?`)) return;

  const start = doStartCrateSpin(crate);
  if (!start.ok) { alert(start.reason); return; }
  const won = start.won;
  save();
  renderAll();

  buttons.forEach((b) => { b.disabled = true; });
  messageEl.textContent = 'Opening crate...';

  runCrateAnimation(crate, won, () => {
    const { alreadyOwned } = doGrantCrateWin(won.id);
    const msg = alreadyOwned
      ? `Spin landed on ${itemLabel(won)} — already owned! Another copy was added to your Inventory to trade.`
      : `Spin landed on ${itemLabel(won)}! Added to your Inventory.`;
    messageEl.textContent = msg;
    logTo(titleLog, msg, 'gain');
    save();
    buildTitleGrid();
    renderAll();
    buttons.forEach((b) => { b.disabled = false; });
    showCrateResult(won, alreadyOwned);
  });
}

btnBetaSpin.addEventListener('click', () => spinCrate(CRATE_OPEN_BETA, [btnBetaSpin, btnViewCrate], betaSpinMessage));
btnGoodSeasonSpin.addEventListener('click', () => spinCrate(CRATE_GOOD_SEASON1, [btnGoodSeasonSpin, btnViewGoodSeasonCrate], goodSeasonSpinMessage));
btnAnimaSpin.addEventListener('click', () => spinCrate(CRATE_ANIMA, [btnAnimaSpin, btnViewAnimaCrate], animaSpinMessage));
btnCounterfinishSpin.addEventListener('click', () => spinCrate(CRATE_COUNTERFINISH, [btnCounterfinishSpin, btnViewCounterfinishCrate], counterfinishSpinMessage));

