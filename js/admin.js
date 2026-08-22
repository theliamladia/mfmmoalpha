// ---------- admin ----------
const btnAdmin = document.getElementById('btnAdmin');

const adminMenuModal = document.getElementById('adminMenuModal');
const btnAdminClose = document.getElementById('btnAdminClose');
const btnAdminCloseX = document.getElementById('btnAdminCloseX');
const adminCashInput = document.getElementById('adminCashInput');
const adminChipsInput = document.getElementById('adminChipsInput');
const adminWeightInput = document.getElementById('adminWeightInput');
const adminStatInput = document.getElementById('adminStatInput');
const btnAdminAddCash = document.getElementById('btnAdminAddCash');
const btnAdminAddChips = document.getElementById('btnAdminAddChips');
const btnAdminAddWeight = document.getElementById('btnAdminAddWeight');
const btnAdminAddStats = document.getElementById('btnAdminAddStats');
const adminAllianceButtons = document.querySelectorAll('.admin-alliance-buttons button');
const btnAdminMaxStats = document.getElementById('btnAdminMaxStats');
const btnAdminReleaseJail = document.getElementById('btnAdminReleaseJail');
const btnAdminGiveAdminTitle = document.getElementById('btnAdminGiveAdminTitle');

// UI-only convenience -- the real gate is server-side (server.js requireAdminPassword checks the
// signed JWT's username claim on every admin request, so this can't be bypassed for anything that
// actually matters, even though this client-side check itself can).
const ADMIN_USERNAME = 'mrleems';

btnAdmin.addEventListener('click', () => {
  if ((getMyUsername() || '').toLowerCase() !== ADMIN_USERNAME) {
    alert('Not authorized.');
    return;
  }
  adminMenuModal.classList.remove('hidden');
  refreshAdminPauseButton();
  refreshAdminModifierButtons();
  refreshAdminMaintenanceButton();
});

btnAdminClose.addEventListener('click', () => {
  adminMenuModal.classList.add('hidden');
});

btnAdminCloseX.addEventListener('click', () => {
  adminMenuModal.classList.add('hidden');
});

btnAdminAddCash.addEventListener('click', () => {
  character.cash += Math.floor(+adminCashInput.value) || 0;
  save();
  renderAll();
});

btnAdminAddChips.addEventListener('click', () => {
  character.chips += Math.floor(+adminChipsInput.value) || 0;
  save();
  renderAll();
});

btnAdminAddWeight.addEventListener('click', () => {
  character.fatGained = Math.max(0, character.fatGained + (+adminWeightInput.value || 0));
  save();
  renderAll();
});

btnAdminAddStats.addEventListener('click', () => {
  const amount = +adminStatInput.value || 0;
  const s = character.stats;
  s.health = clampStat(s.health + amount);
  s.attack = clampStat(s.attack + amount);
  s.speed = clampStat(s.speed + amount);
  s.defense = clampStat(s.defense + amount);
  s.looks = clampStat(s.looks + amount);
  save();
  renderAll();
});

adminAllianceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    character.alliance = clampStat(+btn.dataset.alliance);
    save();
    renderAll();
  });
});

btnAdminMaxStats.addEventListener('click', () => {
  const s = character.stats;
  s.health = STAT_CAP;
  s.attack = STAT_CAP;
  s.speed = STAT_CAP;
  s.defense = STAT_CAP;
  s.looks = STAT_CAP;
  save();
  renderAll();
});

btnAdminReleaseJail.addEventListener('click', () => {
  if (!character.jail.inJail) return;
  releaseFromJail();
});

function doGiveAdminTitle() {
  addToInventory(ADMIN_TITLE.id, 1);
}

btnAdminGiveAdminTitle.addEventListener('click', () => {
  doGiveAdminTitle();
  save();
  renderAll();
  alert('ADMIN title added to your Inventory (Cosmetics). Multiplayer gifting to another player will work the same way once trading is live.');
});

// ---------- Server Controls: pause ----------
const btnAdminTogglePause = document.getElementById('btnAdminTogglePause');

function refreshAdminPauseButton() {
  if (!btnAdminTogglePause) return;
  btnAdminTogglePause.textContent = isGamePaused() ? 'Resume Game' : 'Pause Game';
  btnAdminTogglePause.classList.toggle('active-modifier', isGamePaused());
}

btnAdminTogglePause.addEventListener('click', async () => {
  try {
    const result = await apiAdminSetPause(!isGamePaused());
    serverStateCache = result.state;
    refreshAdminPauseButton();
    renderServerBanners();
    renderAll();
  } catch (err) {
    alert(err.reason || 'Could not reach the server.');
  }
});

// ---------- Server Controls: maintenance mode ----------
const btnAdminToggleMaintenance = document.getElementById('btnAdminToggleMaintenance');

function refreshAdminMaintenanceButton() {
  if (!btnAdminToggleMaintenance) return;
  btnAdminToggleMaintenance.textContent = isMaintenanceOn() ? 'End Maintenance' : 'Start Maintenance';
  btnAdminToggleMaintenance.classList.toggle('active-modifier', isMaintenanceOn());
}

btnAdminToggleMaintenance.addEventListener('click', async () => {
  try {
    const result = await apiAdminSetMaintenance(!isMaintenanceOn());
    serverStateCache = result.state;
    refreshAdminMaintenanceButton();
    renderMaintenanceGate();
    renderAll();
  } catch (err) {
    alert(err.reason || 'Could not reach the server.');
  }
});

// ---------- Server Controls: reset all stats ----------
const btnAdminResetAllStats = document.getElementById('btnAdminResetAllStats');

if (btnAdminResetAllStats) {
  btnAdminResetAllStats.addEventListener('click', async () => {
    if (!confirm('Wipe EVERY player back to fresh stats (money, chips, jobs, everything)? Titles and cosmetics are kept. This cannot be undone.')) return;
    try {
      const result = await apiAdminResetAllStats();
      alert(result.message);
    } catch (err) {
      alert(err.reason || 'Could not reach the server.');
    }
  });
}

// ---------- Server Controls: Update 4 season wipe ----------
const btnAdminSeasonWipe = document.getElementById('btnAdminSeasonWipe');

if (btnAdminSeasonWipe) {
  btnAdminSeasonWipe.addEventListener('click', async () => {
    if (!confirm("Update 4 Season Wipe: EVERY player's inventory clears except crate-won titles and Graded Titles, all owned/achievement/purchased titles are dropped, Farms/Crypto/Altcoins/jobs reset -- but cash converts down 100,000:1,000 instead of zeroing. This cannot be undone. Continue?")) return;
    try {
      const result = await apiAdminSeasonWipe();
      alert(result.message);
    } catch (err) {
      alert(err.reason || 'Could not reach the server.');
    }
  });
}

// ---------- Modifiers ----------
const adminModifierButtons = document.querySelectorAll('[data-modifier]');

function refreshAdminModifierButtons() {
  const current = activeModifier() || '';
  adminModifierButtons.forEach((btn) => {
    btn.classList.toggle('active-modifier', btn.dataset.modifier === current);
  });
}

adminModifierButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      const result = await apiAdminSetModifier(btn.dataset.modifier || null);
      serverStateCache = result.state;
      refreshAdminModifierButtons();
      renderServerBanners();
      renderAll();
    } catch (err) {
      alert(err.reason || 'Could not reach the server.');
    }
  });
});

// ---------- Inventory Checker ----------
const adminInvCheckInput = document.getElementById('adminInvCheckInput');
const btnAdminInvCheck = document.getElementById('btnAdminInvCheck');
const adminInvCheckResult = document.getElementById('adminInvCheckResult');

function renderInvCheckResult(result) {
  if (!result.ok) {
    adminInvCheckResult.innerHTML = `<p class="arrest-record-empty">${result.reason}</p>`;
    return;
  }
  const items = result.inventory.map((stack) => {
    const item = getItemDef(stack.id);
    return `<div class="arrest-record-row"><span>${item ? itemLabel(item) : stack.id}</span><span>x${stack.qty}</span></div>`;
  }).join('') || '<p class="arrest-record-empty">No items.</p>';

  const equipped = Object.entries(result.equipment)
    .filter(([, itemId]) => itemId)
    .map(([slot, itemId]) => {
      const item = getItemDef(itemId);
      return `<div class="arrest-record-row"><span>${slot}</span><span>${item ? itemLabel(item) : itemId}</span></div>`;
    }).join('') || '<p class="arrest-record-empty">Nothing equipped.</p>';

  adminInvCheckResult.innerHTML = `
    <p><b>${result.name}</b> &mdash; Inventory</p>
    ${items}
    <p><b>Equipped</b></p>
    ${equipped}
  `;
}

btnAdminInvCheck.addEventListener('click', async () => {
  try {
    const result = await apiAdminInventory(adminInvCheckInput.value);
    renderInvCheckResult(result);
  } catch (err) {
    renderInvCheckResult(err);
  }
});

// ---------- Grant Item ----------
const adminGrantUsernameInput = document.getElementById('adminGrantUsernameInput');
const adminGrantItemIdInput = document.getElementById('adminGrantItemIdInput');
const adminGrantQtyInput = document.getElementById('adminGrantQtyInput');
const btnAdminGrantItem = document.getElementById('btnAdminGrantItem');
const adminGrantItemResult = document.getElementById('adminGrantItemResult');

btnAdminGrantItem.addEventListener('click', async () => {
  try {
    const result = await apiAdminGrantItem(adminGrantUsernameInput.value, adminGrantItemIdInput.value, adminGrantQtyInput.value);
    adminGrantItemResult.innerHTML = `<p class="gain">${result.message}</p>`;
  } catch (err) {
    adminGrantItemResult.innerHTML = `<p class="loss">${err.reason || 'Could not reach the server.'}</p>`;
  }
});

// ---------- Grant Cash ----------
const adminGrantCashUsernameInput = document.getElementById('adminGrantCashUsernameInput');
const adminGrantCashAmountInput = document.getElementById('adminGrantCashAmountInput');
const btnAdminGrantCash = document.getElementById('btnAdminGrantCash');
const adminGrantCashResult = document.getElementById('adminGrantCashResult');

btnAdminGrantCash.addEventListener('click', async () => {
  try {
    const result = await apiAdminGrantCash(adminGrantCashUsernameInput.value, adminGrantCashAmountInput.value);
    adminGrantCashResult.innerHTML = `<p class="gain">${result.message}</p>`;
  } catch (err) {
    adminGrantCashResult.innerHTML = `<p class="loss">${err.reason || 'Could not reach the server.'}</p>`;
  }
});

// ---------- NMG: fast-forward all pending grading ----------
const btnAdminNmgFastForward = document.getElementById('btnAdminNmgFastForward');
const adminNmgFastForwardResult = document.getElementById('adminNmgFastForwardResult');

btnAdminNmgFastForward.addEventListener('click', async () => {
  try {
    const result = await apiAdminNmgFastForwardAll();
    adminNmgFastForwardResult.innerHTML = `<p class="gain">${result.message}</p>`;
  } catch (err) {
    adminNmgFastForwardResult.innerHTML = `<p class="loss">${err.reason || 'Could not reach the server.'}</p>`;
  }
});

// ---------- CosmetixxMarket: force regenerate ----------
// Regen is normally lazy (next state request after 24h) and never retroactive -- a pricing/catalog
// change that lands mid-rotation doesn't apply until the batch naturally expires. This forces it
// immediately instead of waiting out the rest of the window.
const btnAdminCosmetixxMarketRegen = document.getElementById('btnAdminCosmetixxMarketRegen');
const adminCosmetixxMarketRegenResult = document.getElementById('adminCosmetixxMarketRegenResult');

btnAdminCosmetixxMarketRegen.addEventListener('click', async () => {
  try {
    const result = await apiAdminCosmetixxMarketRegen();
    adminCosmetixxMarketRegenResult.innerHTML = `<p class="gain">${result.message}</p>`;
    if (typeof refreshCosmetixxMarket === 'function') refreshCosmetixxMarket();
  } catch (err) {
    adminCosmetixxMarketRegenResult.innerHTML = `<p class="loss">${err.reason || 'Could not reach the server.'}</p>`;
  }
});

// ---------- Slab Granter ----------
// Mints a graded slab AND its registry cert in one server call (/admin/grant-slab). Grant Item
// above cannot do this: it only pushes an id into inventory, and BLACK LABEL / SUBGAINS live on the
// cert, not the id (see the comment in nmgSlabHtml, js/nmg.js) -- so a slab granted that way renders
// with "--" subgains, no cert number, and no black case until reconcileCerts() backfills it a
// subgain-less legacy cert. This block is the supported route for handing out a real slab.
//
// The server is authoritative for every rule here (grader/grade validity, the subgain spread, and
// whether the result is actually a Black Label). The client-side mirror below exists so the picker
// can't offer an impossible combination and the preview shows the true slab before it's minted.
const adminGrantSlabUsernameInput = document.getElementById('adminGrantSlabUsernameInput');
const adminGrantSlabBaseIdInput = document.getElementById('adminGrantSlabBaseIdInput');
const adminGrantSlabGraderSelect = document.getElementById('adminGrantSlabGraderSelect');
const adminGrantSlabGradeSelect = document.getElementById('adminGrantSlabGradeSelect');
const adminGrantSlabSubgainsRow = document.getElementById('adminGrantSlabSubgainsRow');
const adminGrantSlabSubgainsSelect = document.getElementById('adminGrantSlabSubgainsSelect');
const adminGrantSlabManualRow = document.getElementById('adminGrantSlabManualRow');
const adminGrantSlabPreview = document.getElementById('adminGrantSlabPreview');
const adminGrantSlabError = document.getElementById('adminGrantSlabError');
const btnAdminGrantSlab = document.getElementById('btnAdminGrantSlab');
const adminGrantSlabResult = document.getElementById('adminGrantSlabResult');

const adminSlabSubgainInputs = {
  gloss: document.getElementById('adminGrantSlabGloss'),
  stitch: document.getElementById('adminGrantSlabStitch'),
  aura: document.getElementById('adminGrantSlabAura'),
  drip: document.getElementById('adminGrantSlabDrip'),
};

// Mirrors SUBGAIN_SPREAD in mfmmoserver/gameLogic.js: a rolled subgain is always within 2 of the
// main grade, so a hand-set one is held to the same window -- an MGA 10 with a 3 for Drip is not a
// slab the grading system could ever have produced, and the registry should not contain one.
const ADMIN_SLAB_SUBGAIN_SPREAD = 2;

GRADER_IDS.forEach((id) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = GRADERS[id].short;
  adminGrantSlabGraderSelect.appendChild(option);
});
adminGrantSlabGraderSelect.value = 'mga';

for (let grade = 10; grade >= 1; grade -= 1) {
  const option = document.createElement('option');
  option.value = String(grade);
  option.textContent = `${grade} -- ${NMG_GRADE_TIERS[grade].label}`;
  adminGrantSlabGradeSelect.appendChild(option);
}
adminGrantSlabGradeSelect.value = '10';

function adminSlabGrader() {
  return getGraderDef(adminGrantSlabGraderSelect.value) || GRADERS.nmg;
}

function adminSlabGrade() {
  return Number(adminGrantSlabGradeSelect.value);
}

// The BLACK LABEL option only exists where a Black Label can: MGA, main grade 10.
function refreshAdminSlabBlackLabelOption() {
  const grader = adminSlabGrader();
  const allowed = !!grader.blackLabel && adminSlabGrade() === 10;
  const option = adminGrantSlabSubgainsSelect.querySelector('option[value="black"]');
  option.disabled = !allowed;
  option.textContent = allowed ? 'BLACK LABEL (all 10s)' : 'BLACK LABEL (MGA 10 only)';
  if (!allowed && adminGrantSlabSubgainsSelect.value === 'black') adminGrantSlabSubgainsSelect.value = 'roll';
}

// Manual subgains are clamped into the legal window every time the grade or mode changes, so the
// inputs can never sit on a value the Mint button would reject.
function clampAdminSlabSubgainInputs() {
  const grade = adminSlabGrade();
  const min = Math.max(1, grade - ADMIN_SLAB_SUBGAIN_SPREAD);
  const max = Math.min(10, grade + ADMIN_SLAB_SUBGAIN_SPREAD);
  Object.values(adminSlabSubgainInputs).forEach((input) => {
    input.min = String(min);
    input.max = String(max);
    const v = Math.round(+input.value);
    input.value = String(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : grade);
  });
}

// The subgains this mint will ask for: null = let the server roll them (or a grader that has none).
function adminSlabSubgains() {
  const grader = adminSlabGrader();
  if (!grader.subgains) return null;
  const mode = adminGrantSlabSubgainsSelect.value;
  if (mode === 'roll') return null;
  if (mode === 'black') return { gloss: 10, stitch: 10, aura: 10, drip: 10 };
  const subs = {};
  Object.entries(adminSlabSubgainInputs).forEach(([key, input]) => { subs[key] = Math.round(+input.value); });
  return subs;
}

function refreshAdminSlabPreview() {
  const grader = adminSlabGrader();
  refreshAdminSlabBlackLabelOption();

  const hasSubgains = !!grader.subgains;
  adminGrantSlabSubgainsRow.classList.toggle('hidden', !hasSubgains);
  adminGrantSlabManualRow.classList.toggle('hidden', !hasSubgains || adminGrantSlabSubgainsSelect.value !== 'manual');
  if (hasSubgains) clampAdminSlabSubgainInputs();

  const baseId = adminGrantSlabBaseIdInput.value.trim();
  const item = baseId ? getItemDef(`${baseId}${grader.suffix}${adminSlabGrade()}`) : null;
  if (!item) {
    adminGrantSlabPreview.innerHTML = baseId
      ? `<p class="arrest-record-empty">No title with id "${escapeHtml(baseId)}".</p>`
      : '<p class="arrest-record-empty">Enter a base title id to preview the slab.</p>';
    return;
  }

  // A preview cert, not a real one -- same shape /grading/my-certs returns, so the slab renders
  // exactly as it will once minted. `blackLabel` is derived here the same way the server derives
  // it (all four at 10 on a 10), never taken from the picker.
  const subs = adminSlabSubgains();
  const previewCert = {
    label: 'PREVIEW',
    subgains: subs,
    blackLabel: !!(grader.blackLabel && adminSlabGrade() === 10 && subs
      && SUBGAIN_ORDER.every(([key]) => subs[key] === 10)),
    firstEdition: false,
  };
  adminGrantSlabPreview.innerHTML = nmgSlabHtml(item, previewCert);
}

[adminGrantSlabBaseIdInput, adminGrantSlabGraderSelect, adminGrantSlabGradeSelect, adminGrantSlabSubgainsSelect]
  .forEach((el) => el.addEventListener('input', refreshAdminSlabPreview));
Object.values(adminSlabSubgainInputs).forEach((input) => input.addEventListener('input', refreshAdminSlabPreview));
refreshAdminSlabPreview();

btnAdminGrantSlab.addEventListener('click', async () => {
  adminGrantSlabError.textContent = '';
  adminGrantSlabResult.innerHTML = '';

  const username = adminGrantSlabUsernameInput.value.trim();
  const baseId = adminGrantSlabBaseIdInput.value.trim();
  if (!username) { adminGrantSlabError.textContent = 'Enter a player username.'; return; }
  if (!baseId) { adminGrantSlabError.textContent = 'Enter a base title id.'; return; }
  if (!getItemDef(baseId)) { adminGrantSlabError.textContent = `No title with id "${baseId}".`; return; }

  const grader = adminSlabGrader();
  const grade = adminSlabGrade();
  const subgains = adminSlabSubgains();
  if (!confirm(`Mint ${baseId} ${grader.short} ${grade} for ${username}? This adds the slab to their inventory and mints a real cert for it in the grading registry.`)) return;

  try {
    const result = await apiAdminGrantSlab(username, baseId, grader.id, grade, subgains);
    adminGrantSlabResult.innerHTML = `<p class="gain">${result.message}</p>`;
  } catch (err) {
    adminGrantSlabResult.innerHTML = `<p class="loss">${err.reason || 'Could not reach the server.'}</p>`;
  }
});
