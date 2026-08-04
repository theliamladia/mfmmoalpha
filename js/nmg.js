// ---------- New Milos Grading (NMG) ----------
// Submit an owned rarity-bearing title, pay for a turnaround tier, wait, then reveal a 1-10 grade.
// Slot/timer state is server-authoritative and lives in its own DB table (mfmmoserver/db.js
// nmg_slots) rather than character_json, since /character/sync applies zero field validation and
// a client-editable ready_at would make the paid turnaround tiers meaningless -- see the comment
// above the nmg_slots table in db.js. The grade itself is rolled once, server-side, at reveal.

const nmgSlotsGrid = document.getElementById('nmgSlotsGrid');
const nmgLog = document.getElementById('nmgLog');
const gradedTitlesGrid = document.getElementById('gradedTitlesGrid');

const nmgSubmitModal = document.getElementById('nmgSubmitModal');
const nmgSubmitPickerStep = document.getElementById('nmgSubmitPickerStep');
const nmgSubmitPickerList = document.getElementById('nmgSubmitPickerList');
const nmgSubmitTierStep = document.getElementById('nmgSubmitTierStep');
const nmgSubmitSelectedTitleName = document.getElementById('nmgSubmitSelectedTitleName');
const btnNmgSubmitBack = document.getElementById('btnNmgSubmitBack');
const btnNmgSubmitConfirm = document.getElementById('btnNmgSubmitConfirm');
const btnNmgSubmitClose = document.getElementById('btnNmgSubmitClose');
const nmgTierBtns = document.querySelectorAll('.nmg-tier-btn');

const nmgRevealModal = document.getElementById('nmgRevealModal');
const nmgRevealStatus = document.getElementById('nmgRevealStatus');
const nmgRevealSlab = document.getElementById('nmgRevealSlab');
const btnNmgRevealOk = document.getElementById('btnNmgRevealOk');

const btnNmgCrackOpen = document.getElementById('btnNmgCrackOpen');
const nmgCrackModal = document.getElementById('nmgCrackModal');
const nmgCrackPickerList = document.getElementById('nmgCrackPickerList');
const btnNmgCrackClose = document.getElementById('btnNmgCrackClose');

const nmgViewSlabModal = document.getElementById('nmgViewSlabModal');
const nmgViewSlabContent = document.getElementById('nmgViewSlabContent');
const btnNmgViewSlabClose = document.getElementById('btnNmgViewSlabClose');

const NMG_CRACK_COST = 50000;

let nmgSlotsCache = [];
let nmgSubmitSelectedStackId = null;
let nmgSubmitSelectedTier = null;

// mm under an hour, "Hh Mm" under a day, "Dd Hh" once it's a day or more.
function nmgDurationLabel(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Third header line on the slab shows the title's actual pull odds (e.g. "0.075%") rather than a
// generic rarity word -- every rarity-bearing crate catalog's weights are already expressed as
// direct per-crate percentages. Falls back to the rarity word only for the two titles that carry
// `rarity` but no `weight` (the Presidential Auto signature titles -- not directly drawable, only
// reachable via a separate post-draw swap chance stored on the crate, not the title itself).
function titleOddsLabel(item) {
  if (typeof item.weight === 'number') return `${item.weight}%`;
  return item.rarity ? item.rarity.toUpperCase() : '';
}

// Used for the reveal modal's "big reveal" moment, where there's room for the full header/
// wordmark/art treatment. `item` must already be the resolved graded def (has nmgGrade/nmgBaseId
// set, see the NMG_ID_RE branch in getItemDef, js/core.js). The Graded Titles inventory list uses
// the much more compact nmgGradedRowPreviewHtml() below instead -- the full slab is too tall/heavy
// for routine browsing in the narrow character side panel.
function nmgSlabHtml(item) {
  const baseTitle = getItemDef(item.nmgBaseId);
  const tier = NMG_GRADE_TIERS[item.nmgGrade];
  const isElite = item.nmgGrade === 10;
  const artClass = baseTitle.custom ? '' : baseTitle.cssClass;
  const artStyle = titleArtInlineStyle(baseTitle);
  return `
    <div class="nmg-slab">
      <div class="nmg-slab-header">
        <div class="nmg-slab-header-text">
          <p>${escapeHtml(titleCrateGroupLabel(baseTitle).replace(/^\S+\s/, ''))}</p>
          <p>${escapeHtml(itemLabel(baseTitle))}</p>
          <p>${escapeHtml(titleOddsLabel(baseTitle))}</p>
        </div>
        <div class="nmg-slab-grade-box${isElite ? ' nmg-slab-grade-elite' : ''}">
          <span class="nmg-slab-grade-label">${tier.label}</span>
          <span class="nmg-slab-grade-number">${item.nmgGrade}</span>
        </div>
      </div>
      <div class="nmg-slab-wordmark">NMG</div>
      <div class="nmg-slab-art ${artClass}" style="${artStyle}"></div>
    </div>
  `;
}

// Compact preview for the Graded Titles inventory list -- a small landscape art thumbnail with
// the grade badge overlaid in the corner, matching the same compact/scannable card shape every
// other inventory card in this sidebar already uses (title, subheading, small preview, qty,
// actions -- see titleStackCardHtml, js/inventory.js) instead of the full ornate slab.
function nmgGradedRowPreviewHtml(item) {
  const baseTitle = getItemDef(item.nmgBaseId);
  const tier = NMG_GRADE_TIERS[item.nmgGrade];
  const artClass = baseTitle.custom ? '' : baseTitle.cssClass;
  const artStyle = titleArtInlineStyle(baseTitle);
  return `
    <div class="nmg-mini-preview ${artClass}" style="${artStyle}">
      <span class="nmg-mini-grade-badge" style="color:${tier.color}">${item.nmgGrade}</span>
    </div>
  `;
}

// ---------- Slot grid (Market > New Milos Grading) ----------

async function refreshNmgState() {
  try {
    const result = await apiNmgState();
    nmgSlotsCache = result.slots;
  } catch {
    // Best-effort, same convention as crate stock/farms -- grid just falls back to "no slots"
    // rendering (all 4 empty) if the fetch fails; any real action still round-trips its own state.
  }
  buildNmgGrid();
}

function nmgSlotCardHtml(index) {
  const slot = nmgSlotsCache.find((s) => s.slotIndex === index);
  if (!slot) {
    return `
      <div class="hustle-card nmg-slot-card">
        <div class="nmg-slot-empty-icon">🏅</div>
        <h3>Empty Slot</h3>
        <button data-nmg-submit-slot="${index}">Submit a Title</button>
      </div>
    `;
  }
  const remaining = slot.readyAt - (Date.now() + clockOffsetMs);
  const ready = slot.ready || remaining <= 0;
  const item = getItemDef(slot.titleId);
  const name = item ? itemLabel(item) : slot.titleId;
  if (ready) {
    return `
      <div class="hustle-card nmg-slot-card">
        <div class="nmg-slot-empty-icon">🏅</div>
        <p class="nmg-slot-pending-title">${escapeHtml(name)}</p>
        <p class="nmg-slot-ready-badge">Ready!</p>
        <button data-nmg-reveal-slot="${slot.id}">REVEAL</button>
      </div>
    `;
  }
  return `
    <div class="hustle-card nmg-slot-card">
      <div class="nmg-slot-empty-icon">⏳</div>
      <p class="nmg-slot-pending-title">${escapeHtml(name)}</p>
      <p class="nmg-slot-countdown" data-nmg-countdown="${slot.id}">${nmgDurationLabel(remaining)}</p>
    </div>
  `;
}

function buildNmgGrid() {
  if (!nmgSlotsGrid) return;
  nmgSlotsGrid.innerHTML = [0, 1, 2, 3].map(nmgSlotCardHtml).join('');

  nmgSlotsGrid.querySelectorAll('button[data-nmg-submit-slot]').forEach((btn) => {
    btn.addEventListener('click', () => openNmgSubmitModal());
  });
  nmgSlotsGrid.querySelectorAll('button[data-nmg-reveal-slot]').forEach((btn) => {
    btn.addEventListener('click', () => startNmgReveal(Number(btn.dataset.nmgRevealSlot)));
  });
}

// Cheap per-tick update -- only rewrites the countdown text nodes, no full grid rebuild, unless a
// pending slot's local countdown just crossed zero (then rebuild once to swap in the Reveal
// button). The server independently re-checks readiness at reveal time regardless, so this local
// flip is purely a UI nicety, never authoritative.
function tickNmgSlotsUI() {
  if (!nmgSlotsGrid || !character) return;
  let needsRebuild = false;
  nmgSlotsGrid.querySelectorAll('[data-nmg-countdown]').forEach((el) => {
    const slot = nmgSlotsCache.find((s) => String(s.id) === el.dataset.nmgCountdown);
    if (!slot) return;
    const remaining = slot.readyAt - (Date.now() + clockOffsetMs);
    if (remaining <= 0) {
      needsRebuild = true;
      return;
    }
    el.textContent = nmgDurationLabel(remaining);
  });
  if (needsRebuild) buildNmgGrid();
}

// ---------- Submit flow ----------

function nmgSubmitCandidates() {
  // Only rarity-bearing, not-already-graded stacks (mirrors the server's own eligibility check,
  // NMG_ELIGIBLE_BASE_TITLE_IDS in mfmmoserver/gameLogic.js). No separate "already in a slot"
  // tracking needed here -- every submit/reveal response overwrites `character` with the server's
  // authoritative inventory, which already reflects the decremented qty, so a stack with copies
  // still remaining after a submission correctly stays pickable for its remaining qty.
  return character.inventory
    .filter((stack) => stack.qty > 0)
    .map((stack) => getItemDef(stack.id))
    .filter((t) => t && t.type === 'title' && t.rarity && !t.nmgGrade);
}

function openNmgSubmitModal() {
  nmgSubmitSelectedStackId = null;
  nmgSubmitSelectedTier = null;
  nmgSubmitTierStep.classList.add('hidden');
  nmgSubmitPickerStep.classList.remove('hidden');
  btnNmgSubmitConfirm.disabled = true;
  nmgTierBtns.forEach((b) => b.classList.remove('active'));
  renderGroupedTitlePicker(nmgSubmitCandidates(), (titleId) => {
    nmgSubmitSelectedStackId = titleId;
    const item = getItemDef(titleId);
    nmgSubmitSelectedTitleName.textContent = item ? itemLabel(item) : titleId;
    nmgSubmitPickerStep.classList.add('hidden');
    nmgSubmitTierStep.classList.remove('hidden');
  }, null, nmgSubmitPickerList);
  nmgSubmitModal.classList.remove('hidden');
}

btnNmgSubmitBack.addEventListener('click', () => {
  nmgSubmitTierStep.classList.add('hidden');
  nmgSubmitPickerStep.classList.remove('hidden');
});

btnNmgSubmitClose.addEventListener('click', () => {
  nmgSubmitModal.classList.add('hidden');
});

nmgTierBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    nmgSubmitSelectedTier = btn.dataset.tier;
    nmgTierBtns.forEach((b) => b.classList.toggle('active', b === btn));
    btnNmgSubmitConfirm.disabled = false;
  });
});

btnNmgSubmitConfirm.addEventListener('click', async () => {
  if (!nmgSubmitSelectedStackId || !nmgSubmitSelectedTier) return;
  btnNmgSubmitConfirm.disabled = true;
  try {
    const result = await apiNmgSubmit(nmgSubmitSelectedStackId, nmgSubmitSelectedTier);
    character = result.character;
    save();
    renderAll();
    nmgSubmitModal.classList.add('hidden');
    logTo(nmgLog, 'Title submitted for grading.', 'gain');
    await refreshNmgState();
  } catch (err) {
    logTo(nmgLog, err.reason || 'Could not reach the server.', 'loss');
    btnNmgSubmitConfirm.disabled = false;
  }
});

// ---------- Reveal flow ----------
// Server does the real work (roll grade, mint the title, delete the slot row) immediately on
// click -- the "Grading..." delay below is pure suspense theater, same idiom as the slime duel
// modal (js/slime.js showSlimeDuelModal): the outcome is already decided by the time it plays.
const NMG_REVEAL_SUSPENSE_MS = 1300;

async function startNmgReveal(slotId) {
  nmgRevealModal.classList.remove('hidden');
  nmgRevealStatus.textContent = 'Grading...';
  nmgRevealStatus.classList.remove('hidden');
  nmgRevealSlab.classList.add('hidden');
  nmgRevealSlab.innerHTML = '';
  btnNmgRevealOk.classList.add('hidden');

  try {
    const result = await apiNmgReveal(slotId);
    character = result.character;
    save();
    setTimeout(() => {
      const item = getItemDef(result.result.gradedId);
      nmgRevealStatus.classList.add('hidden');
      nmgRevealSlab.innerHTML = item ? nmgSlabHtml(item) : '';
      nmgRevealSlab.classList.remove('hidden');
      btnNmgRevealOk.classList.remove('hidden');
      renderAll();
      refreshNmgState();
    }, NMG_REVEAL_SUSPENSE_MS);
  } catch (err) {
    nmgRevealModal.classList.add('hidden');
    logTo(nmgLog, err.reason || 'Could not reach the server.', 'loss');
  }
}

btnNmgRevealOk.addEventListener('click', () => {
  nmgRevealModal.classList.add('hidden');
});

// ---------- Crack flow ----------
// Cracking has no timing/pricing property to protect (unlike grading itself), so it follows the
// same client-side/trust-based precedent as Sell/Prestige (js/inventory.js) rather than adding a
// new server route.
function crackNmgCandidates() {
  return character.inventory
    .filter((stack) => stack.qty > 0)
    .map((stack) => getItemDef(stack.id))
    .filter((t) => t && t.nmgGrade);
}

function crackNmgTitle(stackId) {
  const item = getItemDef(stackId);
  if (!item || !item.nmgGrade) return;
  if (character.cash < NMG_CRACK_COST) {
    alert(`You need $${NMG_CRACK_COST.toLocaleString()} to crack a slab.`);
    return;
  }
  const baseTitle = getItemDef(item.nmgBaseId);
  if (!confirm(`Crack ${itemLabel(item)} for $${NMG_CRACK_COST.toLocaleString()}? This removes the grade and returns 1x ${itemLabel(baseTitle)} to your inventory. This cannot be undone.`)) return;

  character.cash = round2(character.cash - NMG_CRACK_COST);
  removeFromInventory(stackId, 1);
  addToInventory(item.nmgBaseId, 1);
  // Portfolio Showcase pins by id, not by live ownership (getItemDef synthesizes the slab from the
  // id alone, same as the original Title Showcase) -- without this it'd keep rendering a slab that
  // no longer exists. No Player Market cleanup needed here: a listed slab is already pulled out of
  // character.inventory at listing time (doCreateListing), so it can never appear in
  // crackNmgCandidates() to begin with -- you'd have to cancel the listing first.
  if (character.profile && character.profile.slabShowcaseIds) {
    character.profile.slabShowcaseIds = character.profile.slabShowcaseIds.filter((id) => id !== stackId);
  }
  logTo(nmgLog, `Cracked ${itemLabel(item)} back into ${itemLabel(baseTitle)}.`, 'loss');
  save();
  renderAll();
}

function openNmgCrackModal() {
  renderGroupedTitlePicker(crackNmgCandidates(), (titleId) => {
    nmgCrackModal.classList.add('hidden');
    crackNmgTitle(titleId);
  }, null, nmgCrackPickerList);
  nmgCrackModal.classList.remove('hidden');
}

if (btnNmgCrackOpen) {
  btnNmgCrackOpen.addEventListener('click', () => openNmgCrackModal());
}
if (btnNmgCrackClose) {
  btnNmgCrackClose.addEventListener('click', () => {
    nmgCrackModal.classList.add('hidden');
  });
}

// ---------- View full slab modal ----------

function openNmgViewSlabModal(item) {
  if (!nmgViewSlabModal || !nmgViewSlabContent) return;
  nmgViewSlabContent.innerHTML = nmgSlabHtml(item);
  nmgViewSlabModal.classList.remove('hidden');
}

if (btnNmgViewSlabClose) {
  btnNmgViewSlabClose.addEventListener('click', () => {
    nmgViewSlabModal.classList.add('hidden');
  });
}

// ---------- Graded Titles inventory tab ----------

function renderGradedTitlesGrid() {
  if (!gradedTitlesGrid) return;
  const gradedStacks = character.inventory
    .map((stack) => ({ stack, item: getItemDef(stack.id) }))
    .filter(({ item }) => item && item.nmgGrade);

  if (!gradedStacks.length) {
    gradedTitlesGrid.innerHTML = '<p class="equip-picker-empty">No graded titles yet. Submit one at Milos Market &rarr; New Milos Grading.</p>';
    return;
  }

  gradedTitlesGrid.innerHTML = gradedStacks.map(({ stack, item }) => {
    const baseTitle = getItemDef(item.nmgBaseId);
    const tier = NMG_GRADE_TIERS[item.nmgGrade];
    // Graded titles still carry `rarity` (inherited via the spread in getItemDef's NMG branch),
    // so the existing sellTitle() (js/inventory.js) works unchanged -- same price table as any
    // other title of that base rarity, same confirm-dialog/remove/pay-out flow. This doubles as
    // the "delete" option: there's nothing else useful to do with a graded slab you don't want.
    const sellPrice = item.rarity ? TITLE_SELL_PRICE_BY_RARITY[item.rarity] : null;
    return `
    <div class="hustle-card">
      <h3>${itemLabel(item)}</h3>
      <p class="item-subheading">${escapeHtml(tier.label)} ${item.nmgGrade} &middot; ${escapeHtml(titleCrateGroupLabel(baseTitle).replace(/^\S+\s/, ''))}</p>
      ${nmgGradedRowPreviewHtml(item)}
      <p>&times; ${stack.qty}</p>
      <button data-nmg-showcase="${stack.id}" class="secondary-btn">Add to Showcase</button>
      ${sellPrice ? `<button data-sell-title="${stack.id}" class="secondary-btn">Sell ($${sellPrice.toLocaleString()})</button>` : ''}
    </div>
  `;
  }).join('');

  gradedTitlesGrid.querySelectorAll('button[data-sell-title]').forEach((btn) => {
    btn.addEventListener('click', () => sellTitle(btn.dataset.sellTitle));
  });

  gradedTitlesGrid.querySelectorAll('button[data-nmg-showcase]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiAddShowcaseTitle(btn.dataset.nmgShowcase);
        character = result.character;
        save();
        renderAll();
      } catch (err) {
        alert(err.reason || 'Could not reach the server.');
      }
    });
  });

  gradedTitlesGrid.querySelectorAll('.nmg-mini-preview').forEach((el, i) => {
    el.addEventListener('click', () => openNmgViewSlabModal(gradedStacks[i].item));
  });
}

// Lazy-load NMG slot state only when the tab is actually opened, same reasoning as Farms
// (refreshFarms() on its own Milos sub-tab click) -- avoids a server round-trip on every page
// load for a tab most sessions won't visit. Layered alongside the generic market-tab-btn handler
// in js/market.js (which just toggles visibility) rather than modifying it.
const nmgMarketTabBtn = document.querySelector('.market-tab-btn[data-shop="nmg"]');
if (nmgMarketTabBtn) {
  nmgMarketTabBtn.addEventListener('click', () => refreshNmgState());
}
