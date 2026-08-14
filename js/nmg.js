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

// ---------- Estimated slab value ----------
// Display-only mirror of the server's cosmetixxSlabPrice() / foilSlabValue() (mfmmoserver
// gameLogic.js) -- the same algorithm the CosmetixxMarket prices its daily rotation with and the
// KOLLECTOR leaderboard ranks collections by. Client and server hand-mirror game constants
// throughout this codebase (see HANDOFF.md); the server stays authoritative and this is only a
// label, so a drift here misprices a caption, never a transaction.
//
// The catalog itself is NOT duplicated: every crate title already carries its real pull `weight`
// client-side, and crate costs are constants in core.js, so the only thing this needs is which
// crate a title came from. Open Beta and GOOD(R) Season 1 are deliberately absent below because the
// server's COSMETIXX_MARKET_TITLES excludes them too -- their slabs genuinely have no market price.
const NMG_VALUE_BASELINE_WEIGHT = 15;
const NMG_VALUE_GRADE_MULT = {
  1: 0.4, 2: 0.45, 3: 0.5,
  4: 0.7, 5: 0.85, 6: 1, 7: 1.2,
  8: 1.7, 9: 2.4, 10: 3.5,
};
const NMG_VALUE_MIN_PRICE = 500;
const NMG_VALUE_MAX_PRICE = 1500000;
const NMG_VALUE_ARCHIVED_MULT = 10;
const NMG_VALUE_ARCHIVED_MAX_PRICE = 3000000;

// Built lazily: core.js defines these arrays/constants, and while it does load first, a lazy map
// keeps this independent of script order in index.html.
let nmgValueCrateMap = null;
function nmgValueCrateInfo(baseId) {
  if (!nmgValueCrateMap) {
    nmgValueCrateMap = new Map();
    [
      { titles: ANIMA_CRATE_TITLES, crateCost: ANIMA_CRATE_COST, archived: true },
      { titles: COUNTERFINISH_CRATE_TITLES, crateCost: COUNTERFINISH_CRATE_COST, archived: true },
      { titles: RED_CRATE_TITLES, crateCost: RED_CRATE_COST, archived: true },
      { titles: BLUE_CRATE_TITLES, crateCost: BLUE_CRATE_COST, archived: true },
      { titles: LEEMS_LARUDO_GOOD_TITLES, crateCost: LLG_CRATE_COST, archived: false },
      { titles: MILOS_LEGENDS_TITLES, crateCost: MILOS_LEGENDS_CRATE_COST, archived: false },
    ].forEach(({ titles, crateCost, archived }) => {
      titles.forEach((t) => nmgValueCrateMap.set(t.id, { crateCost, archived, weight: t.weight }));
    });
    // The hidden Autos carry no `weight` of their own (they're deliberately absent from the crates'
    // published odds), so their effective pull rate is derived: a spin must first land on that
    // side's Presidential Rare (weight 5), then pass the 1% hiddenAuto swap -- 5 * 0.01 = 0.05, the
    // same rarity as a Milos Legends mythic. Mirrors the two rotationExcluded entries in the
    // server's COSMETIXX_MARKET_TITLES: priceable, but never stocked by the store.
    [CRATE_RED, CRATE_BLUE].forEach((crate) => {
      const { fromId, toId, chance } = crate.hiddenAuto;
      const parent = crate.titles.find((t) => t.id === fromId);
      if (!parent) return;
      nmgValueCrateMap.set(toId, { crateCost: crate.cost, archived: true, weight: parent.weight * chance });
    });
  }
  return nmgValueCrateMap.get(baseId) || null;
}

// Returns a Floydbucks estimate for a graded slab def, or null when the slab has no market price
// (a title outside the market catalog, an unpriceable one-off like the Auto pulls -- which carry no
// `weight` and so never enter the map above -- or anything that isn't a graded slab at all).
function estimatedSlabValue(def) {
  if (!def || !def.nmgGrade) return null;
  const gradeMult = NMG_VALUE_GRADE_MULT[def.nmgGrade];
  if (!gradeMult) return null;

  // A graded foil's nmgBaseId is the FOIL id (`mlKrogger_foil`); foilBaseId spreads through
  // getItemDef's NMG branch and is already the plain base. A graded prestiged slab's nmgBaseId
  // still carries its `_p2` suffix, so strip that too before looking up the crate.
  const preGradeId = def.foilBaseId || def.nmgBaseId;
  const baseId = parsePrestigeId(preGradeId).baseId;
  const info = nmgValueCrateInfo(baseId);
  if (!info || !info.weight) return null;

  const archivedMult = info.archived ? NMG_VALUE_ARCHIVED_MULT : 1;
  const rarityFactor = Math.sqrt(NMG_VALUE_BASELINE_WEIGHT / info.weight);
  const basePreGrade = info.crateCost * rarityFactor * archivedMult;

  // A Foil consumed FOIL_ASCENSION_COPIES copies plus FOIL_ASCENSION_COST in cash, so it is priced
  // from that recipe rather than a flat multiplier -- which makes the premium taper from ~3.8x on a
  // cheap title down toward 3x on a mythic, since the flat cash is a shrinking share of the cost.
  const raw = def.foil
    ? (FOIL_ASCENSION_COPIES * basePreGrade + FOIL_ASCENSION_COST) * gradeMult
    : basePreGrade * gradeMult;

  // Clamp mirrors the server's foilSlabValue() literally (3 * cap + 75000) rather than deriving the
  // 75000 from FOIL_ASCENSION_COST, so the two expressions can't drift apart if that fee changes.
  const cap = info.archived ? NMG_VALUE_ARCHIVED_MAX_PRICE : NMG_VALUE_MAX_PRICE;
  const max = def.foil ? 3 * cap + 75000 : cap;
  const rounded = Math.round(raw / 100) * 100;
  return Math.min(max, Math.max(NMG_VALUE_MIN_PRICE, rounded));
}

// Small caption under a showcased slab. Renders nothing at all for slabs with no market price --
// an "Est. value: --" line would read as a bug rather than as "this collection was never priced".
function slabEstValueHtml(def) {
  const value = estimatedSlabValue(def);
  if (value === null) return '';
  // Whole Floydbucks, not formatMoney() -- slab prices are always round hundreds, so trailing
  // cents would be pure noise next to the existing .profile-slab-market-price captions.
  return `<p class="slab-est-value" title="Estimated at the price the CosmetixxMarket would list this slab for. Not a sale offer.">Est. value <b>$${value.toLocaleString()}</b></p>`;
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
          ${item.foil ? '<p class="foil-ascended-line">FOIL ASCENDED</p>' : ''}
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
  // Every owned title is gradeable (mirrors the server's own eligibility check -- isCosmeticInventoryId
  // in mfmmoserver/gameLogic.js -- which is permissive for any title/crate id by default instead of a
  // manually maintained allowlist). No separate "already in a slot" tracking needed here -- every
  // submit/reveal response overwrites `character` with the server's authoritative inventory, which
  // already reflects the decremented qty, so a stack with copies still remaining after a submission
  // correctly stays pickable for its remaining qty.
  return character.inventory
    .filter((stack) => stack.qty > 0)
    .map((stack) => getItemDef(stack.id))
    // Foils ARE gradeable. The resulting `${base}_foil_nmg${N}` id needs no new plumbing: the NMG
    // branch in getItemDef() runs BEFORE the foil branch and resolves the base to `${base}_foil`,
    // which then resolves through the foil branch -- so the graded def inherits `foil: true`,
    // `rarity`, and the `title-foil` art class by spread. Only Prestige stays closed to foils.
    .filter((t) => t && t.type === 'title' && !t.nmgGrade);
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

// ---------- Regrade flow ----------
// Resubmit an already-graded slab for a fresh roll. Structurally identical to the submit flow above
// (picker step -> tier step -> server call -> the slot grid), and the reveal is literally the same
// modal: the server stores the slab's PRE-grade id in the slot row, so /nmg/reveal mints
// `${preGradeId}_nmg${newGrade}` through its existing code path with no branching at all.
//
// Fees mirror NMG_REGRADE_FEES in mfmmoserver/gameLogic.js, which is authoritative for what's
// actually charged. Owner's constraint: a regrade must beat cracking the slab ($50,000) and
// resubmitting it at the same tier. Each fee is 60% of (crack + tier cost):
//   3hr    $33,000  vs  $55,000 crack+resubmit
//   1hr    $36,000  vs  $60,000
//   10min  $42,000  vs  $70,000
const NMG_REGRADE_FEES = { '3hr': 33000, '1hr': 36000, '10min': 42000 };
const NMG_TIER_LABELS = { '3hr': '3 Hour Turnaround', '1hr': '1 Hour Turnaround', '10min': '10 Minute Turnaround' };

const btnNmgRegradeOpen = document.getElementById('btnNmgRegradeOpen');
const nmgRegradeModal = document.getElementById('nmgRegradeModal');
const nmgRegradePickerStep = document.getElementById('nmgRegradePickerStep');
const nmgRegradePickerList = document.getElementById('nmgRegradePickerList');
const nmgRegradeTierStep = document.getElementById('nmgRegradeTierStep');
const nmgRegradeTierOptions = document.getElementById('nmgRegradeTierOptions');
const nmgRegradeSelectedTitleName = document.getElementById('nmgRegradeSelectedTitleName');
const btnNmgRegradeBack = document.getElementById('btnNmgRegradeBack');
const btnNmgRegradeConfirm = document.getElementById('btnNmgRegradeConfirm');
const btnNmgRegradeClose = document.getElementById('btnNmgRegradeClose');

let nmgRegradeSelectedStackId = null;
let nmgRegradeSelectedTier = null;

// Same candidate set as Crack -- any graded slab actually in inventory. A slab listed on the Player
// Market is already out of character.inventory (see doCreateListing), so it can't reach this list,
// which is exactly why the server needs no listing cleanup on regrade either.
function nmgRegradeCandidates() {
  return crackNmgCandidates();
}

function buildNmgRegradeTierOptions() {
  nmgRegradeTierOptions.innerHTML = Object.keys(NMG_REGRADE_FEES).map((tier) => `
    <button class="nmg-tier-btn nmg-regrade-tier-btn" data-tier="${tier}">${NMG_TIER_LABELS[tier]}<br>$${NMG_REGRADE_FEES[tier].toLocaleString()}</button>
  `).join('');
  nmgRegradeTierOptions.querySelectorAll('.nmg-regrade-tier-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      nmgRegradeSelectedTier = btn.dataset.tier;
      nmgRegradeTierOptions.querySelectorAll('.nmg-regrade-tier-btn').forEach((b) => b.classList.toggle('active', b === btn));
      btnNmgRegradeConfirm.disabled = false;
    });
  });
}

function openNmgRegradeModal() {
  nmgRegradeSelectedStackId = null;
  nmgRegradeSelectedTier = null;
  nmgRegradeTierStep.classList.add('hidden');
  nmgRegradePickerStep.classList.remove('hidden');
  btnNmgRegradeConfirm.disabled = true;
  buildNmgRegradeTierOptions();
  renderGroupedTitlePicker(nmgRegradeCandidates(), (titleId) => {
    nmgRegradeSelectedStackId = titleId;
    const item = getItemDef(titleId);
    nmgRegradeSelectedTitleName.textContent = item ? itemLabel(item) : titleId;
    nmgRegradePickerStep.classList.add('hidden');
    nmgRegradeTierStep.classList.remove('hidden');
  }, null, nmgRegradePickerList);
  nmgRegradeModal.classList.remove('hidden');
}

if (btnNmgRegradeOpen) btnNmgRegradeOpen.addEventListener('click', () => openNmgRegradeModal());
if (btnNmgRegradeClose) btnNmgRegradeClose.addEventListener('click', () => nmgRegradeModal.classList.add('hidden'));
if (btnNmgRegradeBack) {
  btnNmgRegradeBack.addEventListener('click', () => {
    nmgRegradeTierStep.classList.add('hidden');
    nmgRegradePickerStep.classList.remove('hidden');
  });
}
if (btnNmgRegradeConfirm) {
  btnNmgRegradeConfirm.addEventListener('click', async () => {
    if (!nmgRegradeSelectedStackId || !nmgRegradeSelectedTier) return;
    const item = getItemDef(nmgRegradeSelectedStackId);
    const fee = NMG_REGRADE_FEES[nmgRegradeSelectedTier];
    if (!confirm(`Regrade ${itemLabel(item)} for $${fee.toLocaleString()}? The current grade (${item.nmgGrade}) is destroyed and replaced by a fresh roll -- it can come back LOWER. This cannot be undone.`)) return;
    btnNmgRegradeConfirm.disabled = true;
    try {
      const result = await apiNmgRegrade(nmgRegradeSelectedStackId, nmgRegradeSelectedTier);
      character = result.character;
      save();
      renderAll();
      nmgRegradeModal.classList.add('hidden');
      logTo(nmgLog, `Slab sent back for regrading (was grade ${result.previousGrade}).`, 'gain');
      await refreshNmgState();
    } catch (err) {
      logTo(nmgLog, err.reason || 'Could not reach the server.', 'loss');
      btnNmgRegradeConfirm.disabled = false;
    }
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
    //
    // `!item.foil` mirrors the same gate titleStackCardHtml() applies: a graded foil spreads
    // `foil: true` through the NMG branch, and sellTitle() already early-returns on it, so without
    // this the button would render and then silently do nothing when clicked.
    const sellPrice = item.rarity && !item.foil ? TITLE_SELL_PRICE_BY_RARITY[item.rarity] : null;
    return `
    <div class="hustle-card">
      <h3>${itemLabel(item)}</h3>
      <p class="item-subheading">${escapeHtml(tier.label)} ${item.nmgGrade} &middot; ${escapeHtml(titleCrateGroupLabel(baseTitle).replace(/^\S+\s/, ''))}</p>
      ${item.foil ? '<p class="foil-ascended-line">FOIL ASCENDED</p>' : ''}
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

// ---------- CosmetixxMarket ----------
// 5 system-generated graded-title slabs, shared across every player, rotating every 24h -- server
// owns generation/pricing entirely (see mfmmoserver's /cosmetixx-market/state), same trust boundary
// as a real NMG grade roll. Rendered with the exact same nmgSlabHtml() used for owned slabs --
// getItemDef() resolves any `${baseId}_nmg${grade}` id from the id string alone, regardless of
// whether the viewer owns it, so no separate rendering path is needed here.
const cosmetixxMarketGrid = document.getElementById('cosmetixxMarketGrid');
const cosmetixxMarketCountdown = document.getElementById('cosmetixxMarketCountdown');
let cosmetixxMarketCache = { slots: [], nextRotationAt: 0 };

async function refreshCosmetixxMarket() {
  if (!cosmetixxMarketGrid) return;
  try {
    cosmetixxMarketCache = await apiCosmetixxMarketState();
  } catch {
    // Best-effort -- keep showing the last known state if the poll fails.
  }
  buildCosmetixxMarketGrid();
}

function buildCosmetixxMarketGrid() {
  if (!cosmetixxMarketGrid) return;
  const { slots } = cosmetixxMarketCache;
  if (!slots || !slots.length) {
    cosmetixxMarketGrid.innerHTML = '<p class="equip-picker-empty">Loading today\'s slabs...</p>';
    return;
  }

  cosmetixxMarketGrid.innerHTML = slots.map((slot) => {
    const def = getItemDef(`${slot.titleId}_nmg${slot.grade}`);
    if (!def) return '';
    return `
      <div class="profile-slab-slot">
        ${nmgSlabHtml(def)}
        <p class="profile-slab-market-price">$${slot.price.toLocaleString()}</p>
        <div class="profile-slab-slot-actions">
          ${slot.sold
            ? '<button class="secondary-btn" disabled>SOLD</button>'
            : `<button data-cosmetixx-market-buy="${slot.id}">Buy</button>`}
        </div>
      </div>
    `;
  }).join('');

  cosmetixxMarketGrid.querySelectorAll('button[data-cosmetixx-market-buy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Buy this slab?')) return;
      btn.disabled = true;
      try {
        const result = await apiCosmetixxMarketBuy(Number(btn.dataset.cosmetixxMarketBuy));
        character = result.character;
        save();
        renderAll();
        await refreshCosmetixxMarket();
      } catch (err) {
        alert(err.reason || 'Could not reach the server.');
        btn.disabled = false;
      }
    });
  });

  tickCosmetixxMarketUI();
}

function tickCosmetixxMarketUI() {
  if (!cosmetixxMarketCountdown || !cosmetixxMarketCache.nextRotationAt) return;
  const remaining = cosmetixxMarketCache.nextRotationAt - (Date.now() + clockOffsetMs);
  if (remaining <= 0) {
    refreshCosmetixxMarket();
    return;
  }
  cosmetixxMarketCountdown.textContent = `Refreshes in ${nmgDurationLabel(remaining)}`;
}

// Lazy-load on the Cosmetixxx tab click, same reasoning as the NMG tab above.
const cosmetixxMarketTabBtn = document.querySelector('.market-tab-btn[data-shop="titles"]');
if (cosmetixxMarketTabBtn) {
  cosmetixxMarketTabBtn.addEventListener('click', () => refreshCosmetixxMarket());
}
