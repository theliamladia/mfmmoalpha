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
};

casinoTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    casinoTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(casinoShopEls).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.shop));
  });
});

// ---------- streets (instant + cooldown) ----------
const hustleButtons = document.querySelectorAll('.hustle-btn');

function getRemainingCooldown(action, durationMs = COOLDOWN_MS) {
  const last = character.cooldowns[action] || 0;
  const remaining = durationMs - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

function doHustle(type) {
  const entries = [];
  if (type === 'work') {
    const gain = randInt(2, 10);
    character.cash += gain;
    allianceBuff();
    entries.push({ message: `Worked a shift: +${gain} Floydbucks.`, cls: 'gain' });
  } else if (type === 'slut') {
    const gain = randInt(5, 60);
    character.cash += gain;
    allianceDebuffMinor();
    entries.push({ message: `Turned a trick: +${gain} Floydbucks.`, cls: 'gain' });
    if (Math.random() < 0.3) {
      character.cash = Math.max(0, character.cash - gain);
      entries.push({ message: `You got robbed! -${gain} Floydbucks.`, cls: 'loss' });
    }
  } else if (type === 'crime') {
    if (Math.random() < 0.3) {
      const years = 1 + crimeStreakYears();
      bumpCrimeStreak();
      allianceForceBad();
      character.jail.inJail = true;
      character.jail.crime = 'Crime';
      character.jail.yearsRemaining = years;
      character.jail.serving = false;
      const streakNote = years > 1 ? ` Repeat offender: +${years - 1} year(s) added to your usual sentence.` : '';
      entries.push({ message: `Busted committing a crime! Sentenced to ${years} year(s).${streakNote}`, cls: 'loss' });
      return { entries, jailed: true };
    }
    const gain = randInt(100, 1000);
    character.cash += gain;
    allianceDebuff();
    entries.push({ message: `Pulled off a crime: +${gain} Floydbucks.`, cls: 'gain' });
  }
  character.cooldowns[type] = Date.now();
  return { entries, jailed: false };
}

function runHustle(type) {
  const result = doHustle(type);
  result.entries.forEach((e) => logMessage(e.message, e.cls));
  save();
  if (result.jailed) {
    goToJail(true);
    return;
  }
  renderAll();
}

hustleButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.hustle;
    if (getRemainingCooldown(type) > 0) return;
    runHustle(type);
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
  gymFuelEl.textContent = round1(character.weightGained);
  const inRoidJail = character.gym.roidJailClicksRemaining > 0;
  roidJailBanner.classList.toggle('hidden', !inRoidJail);
  roidClicksLeftEl.textContent = character.gym.roidJailClicksRemaining;

  const tier = currentSteroidTier();
  const cost = GYM_COST * (tier ? tier.mult : 1);
  const hasFuel = character.weightGained >= GYM_BURN_LBS;
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
    btn.addEventListener('click', () => {
      doSetSteroidTier(btn.dataset.steroidTier === 'none' ? null : btn.dataset.steroidTier);
      save();
      renderAll();
    });
  });
}

function doWorkout() {
  const tier = currentSteroidTier();
  const cost = GYM_COST * (tier ? tier.mult : 1);
  if (character.weightGained < GYM_BURN_LBS) return { ok: false };
  if (character.cash < cost) return { ok: false };

  character.cash -= cost;
  character.weightGained = Math.max(0, character.weightGained - GYM_BURN_LBS);

  if (character.gym.roidJailClicksRemaining > 0) {
    character.gym.roidJailClicksRemaining -= 1;
    return { ok: true, message: 'Roid jail workout: paid, burned fuel, got nothing. Ouch.', cls: 'loss' };
  }
  if (tier && Math.random() < tier.jailChance) {
    character.gym.roidJailClicksRemaining = tier.jailClicks;
    return { ok: true, message: `${tier.name} backfired! Thrown into Roid Jail for ${tier.jailClicks} clicks.`, cls: 'loss' };
  }
  const mult = tier ? tier.mult : 1;
  const looksGain = GYM_LOOKS_GAIN * mult;
  const speedGain = GYM_SPEED_GAIN * mult;
  character.stats.looks = clampStat(character.stats.looks + looksGain);
  character.stats.speed = clampStat(character.stats.speed + speedGain);
  return { ok: true, message: `Workout complete: +${round1(looksGain)} Looks, +${round1(speedGain)} Speed.`, cls: 'gain' };
}

btnWorkout.addEventListener('click', () => {
  const result = doWorkout();
  if (!result.ok) return;
  logTo(gymLog, result.message, result.cls);
  save();
  renderAll();
});

function doSetSteroidTier(tierId) {
  character.gym.steroidTier = tierId;
}

function doRoidEscape() {
  if (character.cash < ROID_ESCAPE_COST) return { ok: false, reason: 'Not enough Floydbucks to bribe your way out of Roid Jail.' };
  character.cash -= ROID_ESCAPE_COST;
  character.gym.roidJailClicksRemaining = 0;
  return { ok: true, message: `Paid $${ROID_ESCAPE_COST} to escape Roid Jail early.`, cls: 'gain' };
}

btnRoidEscape.addEventListener('click', () => {
  const result = doRoidEscape();
  if (!result.ok) { alert(result.reason); return; }
  logTo(gymLog, result.message, result.cls);
  save();
  renderAll();
});

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
      <p>${item.calories} cal &asymp; +${round1(lbs)} lbs.<br>+${round1(lbs * DEFENSE_PER_LB)} Defense, -${round1(lbs * SPEED_LOSS_PER_LB)} Speed.</p>
      <button data-food="${item.id}">Buy ($${cost.toFixed(2)})${discounted ? ' – Employee Discount' : ''}</button>
    `;
    foodGrid.appendChild(card);
  });

  foodGrid.querySelectorAll('button[data-food]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = FOOD_ITEMS.find((f) => f.id === btn.dataset.food);
      buyFood(item);
    });
  });
}

function doBuyFood(item) {
  const cost = round2(item.cost * (jobPerkActive('milos11', false) ? 0.8 : 1));
  if (character.cash < cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= cost;
  const lbs = item.calories / CALORIES_PER_LB;
  character.weightGained += lbs;
  character.stats.defense = clampStat(character.stats.defense + lbs * DEFENSE_PER_LB);
  character.stats.speed = clampStat(character.stats.speed - lbs * SPEED_LOSS_PER_LB);
  return { ok: true, message: `Ate a ${item.name}: +${round1(lbs)} lbs, +${round1(lbs * DEFENSE_PER_LB)} Defense, -${round1(lbs * SPEED_LOSS_PER_LB)} Speed.`, cls: 'loss' };
}

function buyFood(item) {
  const result = doBuyFood(item);
  if (!result.ok) { alert(result.reason); return; }
  logTo(pizzaLog, result.message, result.cls);
  save();
  renderAll();
}

// ---------- Luke's Maxxerstore ----------
const maxxGrid = document.getElementById('maxxGrid');
const maxxLog = document.getElementById('maxxLog');

function buildMaxxGrid() {
  maxxGrid.innerHTML = '';
  MAXX_ITEMS.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'hustle-card';
    card.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.desc}</p>
      <button data-maxx="${item.id}">Buy ($${item.cost})</button>
    `;
    maxxGrid.appendChild(card);
  });

  maxxGrid.querySelectorAll('button[data-maxx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = MAXX_ITEMS.find((m) => m.id === btn.dataset.maxx);
      buyMaxx(item);
    });
  });
}

function doBuyMaxx(item) {
  if (character.cash < item.cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= item.cost;
  if (item.looks) character.stats.looks = clampStat(character.stats.looks + item.looks);
  if (item.speed) character.stats.speed = clampStat(character.stats.speed + item.speed);
  if (item.height) character.height += item.height;
  return { ok: true, message: `Purchased ${item.name}: ${item.desc}.`, cls: 'gain' };
}

function buyMaxx(item) {
  const result = doBuyMaxx(item);
  if (!result.ok) { alert(result.reason); return; }
  logTo(maxxLog, result.message, result.cls);
  save();
  renderAll();
}

// ---------- Title Store ----------
const titleGrid = document.getElementById('titleGrid');
const titleLog = document.getElementById('titleLog');
const btnTitleChevron = document.getElementById('btnTitleChevron');
const titleDropdown = document.getElementById('titleDropdown');

function allTitleDefs() {
  return [PEAK_TITLE, CAESAR_TI_TITLE, ADMIN_TITLE, ...TITLES, ...BETA_SPIN_TITLES, ...GOOD_SEASON1_TITLES];
}

// Titles tracked as inventory stacks: tradeable, "owned" only while at least one copy remains.
const CRATE_TITLE_IDS = new Set([...BETA_SPIN_TITLES, ...GOOD_SEASON1_TITLES].map((t) => t.id));
CRATE_TITLE_IDS.add(CAESAR_TI_TITLE.id);
CRATE_TITLE_IDS.add(ADMIN_TITLE.id);

// Crate titles are "owned" only while at least one copy sits in inventory (tradeable, can drop to 0).
// Purchased/earned titles (Cosmetixxx buys, PEAK CIVILIAN) stay in the permanent titles.owned list.
function isTitleOwned(titleId) {
  if (CRATE_TITLE_IDS.has(titleId)) return inventoryQty(titleId) > 0;
  return character.titles.owned.includes(titleId);
}

function titleBadgeMarkup(title) {
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

const btnBetaSpin = document.getElementById('btnBetaSpin');
const betaSpinMessage = document.getElementById('betaSpinMessage');
const btnViewCrate = document.getElementById('btnViewCrate');

const btnGoodSeasonSpin = document.getElementById('btnGoodSeasonSpin');
const goodSeasonSpinMessage = document.getElementById('goodSeasonSpinMessage');
const btnViewGoodSeasonCrate = document.getElementById('btnViewGoodSeasonCrate');

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

function showCrateOdds(crate) {
  const totalWeight = crate.titles.reduce((sum, t) => sum + t.weight, 0);
  crateOddsTitle.innerHTML = `${crate.icon} ${crate.name} Odds`;
  crateOddsList.innerHTML = crate.titles.map((t) => `
    <div class="crate-odds-row">
      ${titleBadgeMarkup(t)}
      <span class="crate-odds-pct">${Math.round((t.weight / totalWeight) * 100)}%</span>
    </div>
  `).join('');
  crateOddsModal.classList.remove('hidden');
}

btnViewCrate.addEventListener('click', () => showCrateOdds(CRATE_OPEN_BETA));
btnViewGoodSeasonCrate.addEventListener('click', () => showCrateOdds(CRATE_GOOD_SEASON1));

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
  crateResultNote.textContent = alreadyOwned
    ? 'Already owned — another copy was added to your Inventory to trade.'
    : 'Added to your Inventory.';
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
      ? `Spin landed on ${won.name} — already owned! Another copy was added to your Inventory to trade.`
      : `Spin landed on ${won.name}! Added to your Inventory.`;
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

