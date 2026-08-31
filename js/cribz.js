// ---------- Cribz: plots, houses, vault, stash, slab display + neighbourhoods ----------
// Same "server-authoritative, own state cache refreshed after every action" shape as js/crypto.js
// (cryptoStateCache/refreshCrypto). CRIB_TIERS/CRIB_STREETS/CRIB_STREET_ORDER (js/core.js) mirror
// mfmmoserver/gameLogic.js's copies exactly for display -- the server is the real authority on
// every /crib/* route.
let cribStateCache = null; // { street, tier, vault, stash, display, visionId }
let cribVisitCache = null; // the OTHER player's house, from GET /crib/visit/:username
let cribPendingVisitUsername = null; // consumed once by refreshCribz() -- set by viewCribHouse()
let neighbourhoodCache = []; // GET /crib/neighbourhood's houses[]

const cribNoPlot = document.getElementById('cribNoPlot');
const cribStreetsList = document.getElementById('cribStreetsList');
const cribHouseWrap = document.getElementById('cribHouseWrap');
const cribVisitWrap = document.getElementById('cribVisitWrap');
const cribHouseTierName = document.getElementById('cribHouseTierName');
const cribHouseStreetName = document.getElementById('cribHouseStreetName');
const cribUpgradeDesc = document.getElementById('cribUpgradeDesc');
const btnCribUpgrade = document.getElementById('btnCribUpgrade');
const cribVaultBalance = document.getElementById('cribVaultBalance');
const cribVaultCap = document.getElementById('cribVaultCap');
const cribVaultAmount = document.getElementById('cribVaultAmount');
const btnCribVaultDeposit = document.getElementById('btnCribVaultDeposit');
const btnCribVaultWithdraw = document.getElementById('btnCribVaultWithdraw');
const cribVaultLog = document.getElementById('cribVaultLog');
const cribStashUsed = document.getElementById('cribStashUsed');
const cribStashCap = document.getElementById('cribStashCap');
const cribStashList = document.getElementById('cribStashList');
const cribStashLog = document.getElementById('cribStashLog');
const cribVisionSwatch = document.getElementById('cribVisionSwatch');
const cribVisionLabel = document.getElementById('cribVisionLabel');
const btnCribVisionChange = document.getElementById('btnCribVisionChange');
const cribDisplayCount = document.getElementById('cribDisplayCount');
const cribDisplayMax = document.getElementById('cribDisplayMax');
const btnCribDisplayAdd = document.getElementById('btnCribDisplayAdd');
const cribDisplayGrid = document.getElementById('cribDisplayGrid');
const btnCribVisitBack = document.getElementById('btnCribVisitBack');
const cribVisitName = document.getElementById('cribVisitName');
const cribVisitStreetTier = document.getElementById('cribVisitStreetTier');
const btnCribVisitProfile = document.getElementById('btnCribVisitProfile');
const cribVisitGrid = document.getElementById('cribVisitGrid');
const cribPickerModal = document.getElementById('cribPickerModal');
const cribPickerTitle = document.getElementById('cribPickerTitle');
const cribPickerList = document.getElementById('cribPickerList');
const btnCribPickerClose = document.getElementById('btnCribPickerClose');
const neighbourhoodStreets = document.getElementById('neighbourhoodStreets');

function cribLogTo(el, message, cls) {
  if (typeof logTo === 'function') logTo(el, message, cls);
}

async function runCribAction(apiFn, logEl, onSuccess) {
  try {
    const result = await apiFn();
    character = result.character;
    (result.messages || [{ message: result.message, cls: result.cls }]).forEach((e) => cribLogTo(logEl, e.message, e.cls));
    save();
    renderAll();
    if (onSuccess) onSuccess();
    await refreshCribz();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

// Jump straight to another player's house view from the Neighbourhood (js/core.js) or a click
// elsewhere -- NOT their profile (see the secondary "View Profile" button in the visit view for
// that). Consumed once by refreshCribz() the same way profileNavTargetUsername is consumed by
// switchPage('profile') in js/core.js.
function viewCribHouse(username) {
  cribPendingVisitUsername = username;
  switchPage('cribz');
}

async function refreshCribz() {
  if (cribPendingVisitUsername) {
    const target = cribPendingVisitUsername;
    cribPendingVisitUsername = null;
    await loadCribVisit(target);
    return;
  }
  cribVisitCache = null;
  try {
    const result = await apiCribState();
    cribStateCache = result.crib;
  } catch {
    // Best-effort -- keep showing the last known state if the fetch fails.
  }
  renderCribz();
}

async function loadCribVisit(username) {
  try {
    const result = await apiCribVisit(username);
    cribVisitCache = result;
  } catch (err) {
    cribVisitCache = null;
    if (err.reason) alert(err.reason);
  }
  renderCribz();
}

function renderCribz() {
  const visiting = !!cribVisitCache;
  cribVisitWrap.classList.toggle('hidden', !visiting);
  cribNoPlot.classList.toggle('hidden', visiting || !cribStateCache || !!cribStateCache.street);
  cribHouseWrap.classList.toggle('hidden', visiting || !cribStateCache || !cribStateCache.street);

  if (visiting) {
    renderCribVisit();
    return;
  }
  if (!cribStateCache) return;
  if (!cribStateCache.street) {
    renderCribStreets();
    return;
  }
  renderCribHouse();
}

function renderCribStreets() {
  if (!cribStreetsList) return;
  cribStreetsList.innerHTML = CRIB_STREET_ORDER.map((id) => {
    const s = CRIB_STREETS[id];
    return `
      <div class="hustle-card">
        <h3>${escapeHtml(s.name)}</h3>
        <p>$${s.cost.toLocaleString()}</p>
        <button data-crib-buy-street="${id}" ${character.cash < s.cost ? 'disabled' : ''}>Buy Plot</button>
      </div>
    `;
  }).join('');

  cribStreetsList.querySelectorAll('[data-crib-buy-street]').forEach((btn) => {
    btn.addEventListener('click', () => {
      runCribAction(() => apiCribBuyPlot(btn.dataset.cribBuyStreet), null);
    });
  });
}

function renderCribHouse() {
  const crib = cribStateCache;
  const tier = CRIB_TIERS[crib.tier];
  const nextTier = CRIB_TIERS[crib.tier + 1];
  const street = CRIB_STREETS[crib.street];

  cribHouseTierName.textContent = `🏠 ${tier.name}`;
  cribHouseStreetName.textContent = street ? street.name : '';

  if (nextTier) {
    cribUpgradeDesc.textContent = `Upgrade to ${nextTier.name} for $${nextTier.upgradeCost.toLocaleString()} -- vault cap $${nextTier.vaultCap.toLocaleString()}, stash cap ${nextTier.stashCap.toLocaleString()} units, slab display ${nextTier.slabDisplay}.`;
    btnCribUpgrade.textContent = `Upgrade ($${nextTier.upgradeCost.toLocaleString()})`;
    btnCribUpgrade.disabled = character.cash < nextTier.upgradeCost;
  } else {
    cribUpgradeDesc.textContent = 'Your house is already at the highest tier.';
    btnCribUpgrade.textContent = 'Maxed Out';
    btnCribUpgrade.disabled = true;
  }

  cribVaultBalance.textContent = crib.vault.toLocaleString(undefined, { maximumFractionDigits: 2 });
  cribVaultCap.textContent = tier.vaultCap.toLocaleString();

  const stashUsed = Object.values(crib.stash).reduce((sum, qty) => sum + (qty || 0), 0);
  cribStashUsed.textContent = stashUsed.toLocaleString();
  cribStashCap.textContent = tier.stashCap.toLocaleString();

  cribStashList.innerHTML = Object.values(DRUG_ITEMS_BY_ID).map((d) => {
    const stashed = crib.stash[d.id] || 0;
    const owned = inventoryQty(d.id);
    return `
      <div class="crib-stash-row action-row">
        <span class="action-row-name">${escapeHtml(d.name)}</span>
        <span class="action-row-hint">Stashed ${stashed} &middot; On hand ${owned}</span>
        <input type="number" min="0" step="1" data-crib-stash-qty="${d.id}" placeholder="Qty" style="width:70px;">
        <button data-crib-stash-deposit="${d.id}">Stash</button>
        <button data-crib-stash-withdraw="${d.id}" class="secondary-btn">Take Out</button>
      </div>
    `;
  }).join('');

  cribStashList.querySelectorAll('[data-crib-stash-deposit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.cribStashDeposit;
      const input = cribStashList.querySelector(`[data-crib-stash-qty="${id}"]`);
      const qty = Math.max(0, Math.floor(+input.value || 0));
      runCribAction(() => apiCribStashDeposit(id, qty), cribStashLog, () => { input.value = ''; });
    });
  });
  cribStashList.querySelectorAll('[data-crib-stash-withdraw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.cribStashWithdraw;
      const input = cribStashList.querySelector(`[data-crib-stash-qty="${id}"]`);
      const qty = Math.max(0, Math.floor(+input.value || 0));
      runCribAction(() => apiCribStashWithdraw(id, qty), cribStashLog, () => { input.value = ''; });
    });
  });

  // House Vision: OWN slot (crib.visionId), independent of character.visions.equipped -- scoped to
  // this house element only, for both the owner's own view and any visitor's (see renderCribVisit).
  // Never applied to document.documentElement, so it can't leak into the wider app theme.
  const visionDef = crib.visionId ? VISIONS_TITLES.find((v) => v.id === crib.visionId) : null;
  cribVisionSwatch.className = `profile-vision-swatch${visionDef ? ` ${visionDef.cssClass}` : ''}`;
  cribVisionLabel.textContent = visionDef ? `🌀 Vision: ${visionDef.name}` : '🌀 No Vision equipped';
  if (typeof applyVisionCssVars === 'function') applyVisionCssVars(cribHouseWrap, crib.visionId);

  cribDisplayCount.textContent = crib.display.length;
  cribDisplayMax.textContent = tier.slabDisplay;
  btnCribDisplayAdd.classList.toggle('hidden', crib.display.length >= tier.slabDisplay);

  const displayDefs = crib.display.map((id) => getItemDef(id, character)).filter((d) => d && d.nmgGrade);
  cribDisplayGrid.innerHTML = displayDefs.length
    ? displayDefs.map((def) => `
      <div class="profile-slab-slot">
        ${nmgSlabHtml(def, undefined)}
        <div class="profile-slab-slot-actions">
          <button class="secondary-btn" data-crib-display-remove="${def.id}">Remove</button>
        </div>
      </div>
    `).join('')
    : '<p class="equip-picker-empty">No slabs displayed yet.</p>';

  cribDisplayGrid.querySelectorAll('[data-crib-display-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      runCribAction(() => apiCribDisplayRemove(btn.dataset.cribDisplayRemove), null);
    });
  });
}

function renderCribVisit() {
  const v = cribVisitCache;
  if (!v) return;
  const street = CRIB_STREETS[v.street];
  cribVisitName.textContent = `🏠 ${v.firstName} ${v.lastName}'s House`;
  cribVisitStreetTier.textContent = `${street ? street.name : v.street} -- ${v.tierName}`;
  btnCribVisitProfile.onclick = () => { if (typeof viewProfile === 'function') viewProfile(v.username); };

  // House Vision scoped to THIS visit view element only -- exactly the way renderProfile scopes a
  // viewed player's Vision to #page-profile, never to document.documentElement.
  if (typeof applyVisionCssVars === 'function') applyVisionCssVars(cribVisitWrap, v.visionId);

  const displayDefs = (v.display || []).map((id) => getItemDef(id)).filter((d) => d && d.nmgGrade);
  // Visitor's own cert cache only holds THEIR OWN certs -- passing `null` (not undefined) here
  // keeps a visitor from ever resolving (and printing) their own cert number on someone else's
  // slab. See the identical note above renderProfileSlabShowcase in js/profile.js.
  cribVisitGrid.innerHTML = displayDefs.length
    ? displayDefs.map((def) => `
      <div class="profile-slab-slot">
        ${nmgSlabHtml(def, null)}
      </div>
    `).join('')
    : '<p class="equip-picker-empty">Nothing displayed yet.</p>';
}

btnCribVisitBack.addEventListener('click', () => {
  cribVisitCache = null;
  refreshCribz();
});

btnCribUpgrade.addEventListener('click', () => {
  if (btnCribUpgrade.disabled) return;
  runCribAction(apiCribUpgrade, null);
});

btnCribVaultDeposit.addEventListener('click', () => {
  const amount = Math.max(0, +cribVaultAmount.value || 0);
  runCribAction(() => apiCribVaultDeposit(amount), cribVaultLog, () => { cribVaultAmount.value = ''; });
});
btnCribVaultWithdraw.addEventListener('click', () => {
  const amount = Math.max(0, +cribVaultAmount.value || 0);
  runCribAction(() => apiCribVaultWithdraw(amount), cribVaultLog, () => { cribVaultAmount.value = ''; });
});

// ---------- Picker modal: reused for both "Add Slab" (renderGroupedTitlePicker, grouped by
// grading company, same as the Portfolio Showcase's own picker) and "Change House Vision" (a plain
// list mirroring the profile's existing Change Vision picker exactly). ----------
function openCribPicker(heading) {
  cribPickerTitle.textContent = heading;
  cribPickerModal.classList.remove('hidden');
}
btnCribPickerClose.addEventListener('click', () => cribPickerModal.classList.add('hidden'));

btnCribDisplayAdd.addEventListener('click', () => {
  if (!cribStateCache) return;
  const owned = (typeof profileOwnedTitleDefs === 'function' ? profileOwnedTitleDefs(character) : []).filter((d) => d.nmgGrade);
  const displayIds = cribStateCache.display || [];
  const available = owned.filter((d) => !displayIds.includes(d.id));
  openCribPicker('Add a slab to your house display');
  renderGroupedTitlePicker(available, async (gradedId) => {
    cribPickerModal.classList.add('hidden');
    await runCribAction(() => apiCribDisplayAdd(gradedId), null);
  }, '', cribPickerList);
});

btnCribVisionChange.addEventListener('click', () => {
  if (!cribStateCache) return;
  const owned = typeof profileOwnedVisionDefs === 'function' ? profileOwnedVisionDefs(character) : [];
  openCribPicker('Change your House Vision');
  const noneRow = `<div class="equip-picker-item" data-crib-pick-vision="none">None</div>`;
  cribPickerList.innerHTML = noneRow + (owned.length
    ? owned.map((v) => `
        <div class="equip-picker-item" data-crib-pick-vision="${v.id}">
          <span class="title-badge ${v.cssClass}"><span class="title-text">${escapeHtml(v.name)}</span></span>
        </div>
      `).join('')
    : '<p class="equip-picker-empty">No Visions yet. Spin one in GOOD&reg;.</p>');

  cribPickerList.querySelectorAll('[data-crib-pick-vision]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.cribPickVision;
      cribPickerModal.classList.add('hidden');
      await runCribAction(() => apiCribVisionEquip(id === 'none' ? null : id), null);
    });
  });
});

// ---------- Da Skreetz: The Neighbourhood ----------
async function refreshNeighbourhood() {
  try {
    const result = await apiCribNeighbourhood();
    neighbourhoodCache = result.houses;
  } catch {
    // Best-effort -- keep showing the last known roster if the fetch fails.
  }
  renderNeighbourhood();
}

function renderNeighbourhood() {
  if (!neighbourhoodStreets) return;
  const myUsername = typeof getMyUsername === 'function' ? getMyUsername() : null;

  neighbourhoodStreets.innerHTML = CRIB_STREET_ORDER.map((streetId) => {
    const street = CRIB_STREETS[streetId];
    const houses = neighbourhoodCache.filter((h) => h.street === streetId);
    const rowsHtml = houses.length
      ? houses.map((h) => {
        const otherChar = { titles: h.titles, badges: h.badges, stats: h.stats, inventory: [] };
        const fullName = `${h.firstName} ${h.lastName}`;
        const styledName = typeof styledNameHtmlById === 'function' ? styledNameHtmlById(h.titles.equipped, fullName) : escapeHtml(fullName);
        return `
          <div class="crib-house-row" data-crib-visit="${h.username}">
            ${typeof displayBadgeMarkupFor === 'function' ? displayBadgeMarkupFor(otherChar) : ''}
            <span class="player-name">${styledName}${h.username === myUsername ? ' (you)' : ''}</span>
            <span class="action-row-hint">${escapeHtml(h.tierName)}</span>
          </div>
        `;
      }).join('')
      : '<p class="equip-picker-empty">No houses here yet.</p>';
    return `
      <div class="crib-street-group">
        <h4>${escapeHtml(street.name)}</h4>
        ${rowsHtml}
      </div>
    `;
  }).join('');

  neighbourhoodStreets.querySelectorAll('[data-crib-visit]').forEach((row) => {
    row.addEventListener('click', () => viewCribHouse(row.dataset.cribVisit));
  });
}
