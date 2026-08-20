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
let nmgSubmitSelectedGrader = null;

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
  // GRADER TRUST MULTIPLIER -- mirrors graderValueMult() in mfmmoserver/gameLogic.js, which is
  // authoritative (it is what KOLLECTOR actually ranks on). Three deliberate calls:
  //   NMG 1.0x  the baseline the whole pricing model was built against.
  //   MGA 1.0x  NO premium despite costing 3x to grade at and rolling SUBGAINS. Grading fees were
  //             never an input to slab value, and a Black Label premium should emerge from what
  //             players will actually pay each other on MTN rather than being minted by a formula.
  //   CCG 0.5x  a real discount. At parity, CCG's 60% cheaper fees would make it strictly dominant
  //             for KOLLECTOR value-farming (same score, 40% of the cash) and kill NMG grading
  //             outright; in-universe nobody takes a CCG slab seriously either.
  // Not pop-scaled, deliberately: valuation stays supply-blind (pop-scaled value would create
  // hoarding feedback loops and crack-your-rival manipulation).
  const graderMult = (GRADERS[def.grader] || GRADERS.nmg).valueMult;
  const raw = (def.foil
    ? (FOIL_ASCENSION_COPIES * basePreGrade + FOIL_ASCENSION_COST) * gradeMult
    : basePreGrade * gradeMult) * graderMult;

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

// ---------- Cert cache ----------
// The registry lives server-side (mfmmoserver grading_certs). The client holds a read-only snapshot
// so a slab can print its own cert number without a round-trip per render.
//
// FUNGIBILITY, CLIENT SIDE: inventory stacks are fungible -- two `cfRuby_nmg7` are one stack of
// qty 2 backed by two DIFFERENT certs. A rendered slab therefore shows the LOWEST-numbered living
// cert for that graded id, which is the same FIFO rule the server uses when one of them changes
// hands. So the number on the slab is the number that would actually move if you sold one. When you
// hold duplicates the pairing is a fiction either way; matching the server's rule makes it a
// consistent fiction rather than an arbitrary one.
let nmgCertsByGradedId = new Map();

async function refreshNmgCerts() {
  try {
    const result = await apiGradingMyCerts();
    const map = new Map();
    (result.certs || []).forEach((cert) => {
      if (!map.has(cert.gradedId)) map.set(cert.gradedId, []);
      map.get(cert.gradedId).push(cert);
    });
    map.forEach((list) => list.sort((a, b) => a.certNo - b.certNo));
    nmgCertsByGradedId = map;
  } catch {
    // Best-effort, same convention as slot state: slabs just render without a cert line.
  }
}

function certForGradedId(gradedId) {
  const list = nmgCertsByGradedId.get(gradedId);
  return list && list.length ? list[0] : null;
}

// ---------- SUBGAINS ----------
// MGA's four component scores. Rendered as one compact line under a "SUBGAINS" header, in the
// canonical order Gloss / Stitching / Aura / Drip. A grader that doesn't roll them renders nothing
// at all; a cert that HAS a subgain-rolling grader but null values (a legacy cert predating the
// registry) renders "--" per slot, which reads as "never recorded" rather than as a zero.
function subgainsLineHtml(subgains, grader) {
  const def = getGraderDef(grader);
  if (!def || !def.subgains) return '';
  const cells = SUBGAIN_ORDER.map(([key, label]) => {
    const v = subgains && subgains[key] !== null && subgains[key] !== undefined ? subgains[key] : null;
    return `<span class="nmg-subgain"><b>${escapeHtml(label)}</b>${v === null ? '&mdash;' : v}</span>`;
  }).join('');
  return `<div class="nmg-slab-subgains"><span class="nmg-subgains-header">SUBGAINS</span>${cells}</div>`;
}

// Used for the reveal modal's "big reveal" moment, where there's room for the full header/
// wordmark/art treatment. `item` must already be the resolved graded def (has nmgGrade/nmgBaseId/
// grader set, see the GRADED_ID_RE branch in getItemDef, js/core.js). The Graded Titles inventory
// list uses the much more compact nmgGradedRowPreviewHtml() below instead -- the full slab is too
// tall/heavy for routine browsing in the narrow character side panel.
//
// `cert` is optional: pass the cert object straight from a /nmg/reveal response so the brand-new
// number shows immediately; otherwise it's resolved from the cache above. Passing `null` explicitly
// is fine -- system slabs (the CosmetixxMarket rotation) have no cert until someone buys them.
//
// SLAB ART IS ART: every colour in here and in the matching style.css block is hardcoded, never a
// var(--token), so Visions cannot reskin a grader's case. That is the same line the crate/title/
// badge art already holds (see HANDOFF.md) -- page chrome is themeable, collectibles are not.
function nmgSlabHtml(item, cert) {
  const baseTitle = getItemDef(item.nmgBaseId);
  const tier = NMG_GRADE_TIERS[item.nmgGrade];
  const isElite = item.nmgGrade === 10;
  const artClass = baseTitle.custom ? '' : baseTitle.cssClass;
  const artStyle = titleArtInlineStyle(baseTitle);
  const grader = getGraderDef(item.grader) || GRADERS.nmg;
  const resolvedCert = cert === undefined ? certForGradedId(item.id) : cert;
  // BLACK LABEL is a property of the CERT, not of the id -- two MGA 10s of the same title share an
  // id but only one may be all-10 SUBGAINS. So a slab can only render its black case when its cert
  // is known. Rendering an unknown cert as "not black label" is the right default: a false negative
  // is a missing flex, a false positive would be a forged one.
  const isBlackLabel = !!(resolvedCert && resolvedCert.blackLabel);
  const firstEdition = !!(resolvedCert && resolvedCert.firstEdition);
  const caseClasses = [grader.slabClass, isBlackLabel ? 'nmg-slab-black-label' : ''].filter(Boolean).join(' ');

  return `
    <div class="nmg-slab ${caseClasses}">
      ${isBlackLabel ? '<div class="nmg-slab-black-banner">BLACK LABEL</div>' : ''}
      <div class="nmg-slab-header">
        <div class="nmg-slab-header-text">
          <p>${escapeHtml(titleCrateGroupLabel(baseTitle).replace(/^\S+\s/, ''))}</p>
          <p>${escapeHtml(itemLabel(baseTitle))}</p>
          <p>${escapeHtml(titleOddsLabel(baseTitle))}</p>
          ${item.foil ? '<p class="foil-ascended-line">FOIL ASCENDED</p>' : ''}
          ${firstEdition ? '<p class="nmg-slab-fe-stamp">\u{1F3F7} FIRST EDITION</p>' : ''}
        </div>
        <div class="nmg-slab-grade-box${isElite ? ' nmg-slab-grade-elite' : ''}">
          <span class="nmg-slab-grade-label">${tier.label}</span>
          <span class="nmg-slab-grade-number">${item.nmgGrade}</span>
        </div>
      </div>
      ${subgainsLineHtml(resolvedCert ? resolvedCert.subgains : null, grader.id)}
      <div class="nmg-slab-wordmark">${escapeHtml(grader.short)}${grader.id === 'ccg' ? '<span class="ccg-check">COOL \u2714</span>' : ''}</div>
      <div class="nmg-slab-art ${artClass}" style="${artStyle}"></div>
      ${resolvedCert ? `<div class="nmg-slab-cert-no">${escapeHtml(resolvedCert.label)}</div>` : ''}
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
  await refreshNmgCerts();
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
  // Which grader has it matters now that three of them charge wildly different prices -- a slot in
  // flight should say who is holding your title.
  const grader = getGraderDef(slot.grader) || GRADERS.nmg;
  const graderLine = `<p class="nmg-slot-grader nmg-slot-grader-${grader.id}">${escapeHtml(grader.short)}${slot.isRegrade ? ' &middot; REGRADE' : ''}</p>`;
  if (ready) {
    return `
      <div class="hustle-card nmg-slot-card">
        <div class="nmg-slot-empty-icon">🏅</div>
        ${graderLine}
        <p class="nmg-slot-pending-title">${escapeHtml(name)}</p>
        <p class="nmg-slot-ready-badge">Ready!</p>
        <button data-nmg-reveal-slot="${slot.id}">REVEAL</button>
      </div>
    `;
  }
  return `
    <div class="hustle-card nmg-slot-card">
      <div class="nmg-slot-empty-icon">⏳</div>
      ${graderLine}
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

// The submit flow is now THREE steps: pick a title -> pick a grader -> pick a turnaround tier.
// A separate grader step (rather than one flat grid of nine grader x tier buttons) keeps the
// price/prestige ladder legible: you choose who grades it, THEN how fast, which is the order the
// decision actually gets made in. Same two-step modal idiom the flow already used.
const nmgSubmitGraderStep = document.getElementById('nmgSubmitGraderStep');
const nmgSubmitGraderOptions = document.getElementById('nmgSubmitGraderOptions');
const nmgSubmitGraderTitleName = document.getElementById('nmgSubmitGraderTitleName');
const btnNmgSubmitGraderBack = document.getElementById('btnNmgSubmitGraderBack');

function graderOptionCardHtml(graderId) {
  const g = GRADERS[graderId];
  const cheapest = Math.min(...Object.values(g.tiers));
  return `
    <button class="nmg-grader-btn nmg-grader-${g.id}" data-grader="${g.id}">
      <span class="nmg-grader-name">${escapeHtml(g.name)}</span>
      <span class="nmg-grader-short">${escapeHtml(g.short)}</span>
      <span class="nmg-grader-pitch">${escapeHtml(g.pitch)}</span>
      <span class="nmg-grader-blurb">${escapeHtml(g.blurb)}</span>
      <span class="nmg-grader-from">from $${cheapest.toLocaleString()}</span>
    </button>
  `;
}

function buildNmgSubmitGraderOptions() {
  if (!nmgSubmitGraderOptions) return;
  // Rendered cheapest-first so the ladder reads left to right: CCG -> NMG -> MGA.
  nmgSubmitGraderOptions.innerHTML = GRADER_IDS.map((id) => graderOptionCardHtml(id)).join('');
  nmgSubmitGraderOptions.querySelectorAll('.nmg-grader-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      nmgSubmitSelectedGrader = btn.dataset.grader;
      nmgSubmitSelectedTier = null;
      btnNmgSubmitConfirm.disabled = true;
      nmgTierBtns.forEach((b) => b.classList.remove('active'));
      // Tier prices are per-grader, so the tier buttons are relabelled on every grader choice
      // rather than being static markup.
      const g = GRADERS[nmgSubmitSelectedGrader];
      nmgTierBtns.forEach((b) => {
        const cost = g.tiers[b.dataset.tier];
        b.innerHTML = `${escapeHtml(NMG_TIER_LABELS[b.dataset.tier])}<br>$${cost.toLocaleString()}`;
      });
      const item = getItemDef(nmgSubmitSelectedStackId);
      nmgSubmitSelectedTitleName.textContent = `${item ? itemLabel(item) : nmgSubmitSelectedStackId} \u2192 ${g.short}`;
      nmgSubmitGraderStep.classList.add('hidden');
      nmgSubmitTierStep.classList.remove('hidden');
    });
  });
}

function openNmgSubmitModal() {
  nmgSubmitSelectedStackId = null;
  nmgSubmitSelectedTier = null;
  nmgSubmitSelectedGrader = null;
  nmgSubmitTierStep.classList.add('hidden');
  if (nmgSubmitGraderStep) nmgSubmitGraderStep.classList.add('hidden');
  nmgSubmitPickerStep.classList.remove('hidden');
  btnNmgSubmitConfirm.disabled = true;
  nmgTierBtns.forEach((b) => b.classList.remove('active'));
  buildNmgSubmitGraderOptions();
  renderGroupedTitlePicker(nmgSubmitCandidates(), (titleId) => {
    nmgSubmitSelectedStackId = titleId;
    const item = getItemDef(titleId);
    if (nmgSubmitGraderTitleName) nmgSubmitGraderTitleName.textContent = item ? itemLabel(item) : titleId;
    nmgSubmitPickerStep.classList.add('hidden');
    nmgSubmitGraderStep.classList.remove('hidden');
  }, null, nmgSubmitPickerList);
  nmgSubmitModal.classList.remove('hidden');
}

// Back from the tier step lands on the GRADER step (not all the way back to the title picker) --
// changing your mind about 3hr-vs-10min at MGA shouldn't cost you your title selection.
btnNmgSubmitBack.addEventListener('click', () => {
  nmgSubmitTierStep.classList.add('hidden');
  nmgSubmitGraderStep.classList.remove('hidden');
});

if (btnNmgSubmitGraderBack) {
  btnNmgSubmitGraderBack.addEventListener('click', () => {
    nmgSubmitGraderStep.classList.add('hidden');
    nmgSubmitPickerStep.classList.remove('hidden');
  });
}

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
  if (!nmgSubmitSelectedStackId || !nmgSubmitSelectedTier || !nmgSubmitSelectedGrader) return;
  btnNmgSubmitConfirm.disabled = true;
  try {
    const result = await apiNmgSubmit(nmgSubmitSelectedStackId, nmgSubmitSelectedTier, nmgSubmitSelectedGrader);
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
      // The cert comes back on the reveal response, so the brand-new number (and a Black Label
      // case, if this is the one) shows in the reveal itself rather than a refresh later.
      nmgRevealSlab.innerHTML = item ? nmgSlabHtml(item, result.result.cert) : '';
      nmgRevealSlab.classList.remove('hidden');
      btnNmgRevealOk.classList.remove('hidden');
      if (result.result.blackLabel) {
        logTo(nmgLog, `BLACK LABEL. MGA 10 with all four SUBGAINS perfect. ${result.result.cert ? result.result.cert.label : ''}`, 'gain');
      }
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
// Cracking USED to be client-side (no timing/pricing property to protect, same precedent as
// Sell/Prestige in js/inventory.js). The cert registry changed that: a crack RETIRES a cert, and a
// retirement the server never hears about is a permanent, silent Pop Report lie -- the slab would
// keep counting toward its population forever. So it goes through POST /nmg/crack now, and the
// server does the cash, the inventory swap, the showcase detach and the cert retirement together.
function crackNmgCandidates() {
  return character.inventory
    .filter((stack) => stack.qty > 0)
    .map((stack) => getItemDef(stack.id))
    .filter((t) => t && t.nmgGrade);
}

async function crackNmgTitle(stackId) {
  const item = getItemDef(stackId);
  if (!item || !item.nmgGrade) return;
  if (character.cash < NMG_CRACK_COST) {
    alert(`You need $${NMG_CRACK_COST.toLocaleString()} to crack a slab.`);
    return;
  }
  const baseTitle = getItemDef(item.nmgBaseId);
  const cert = certForGradedId(stackId);
  // Naming the cert in the confirm is the point of the registry showing up here: cracking does not
  // just destroy a grade any more, it retires a numbered object that will read as retired forever.
  const certLine = cert ? `\n\n${cert.label} will be permanently RETIRED in the grading registry.` : '';
  if (!confirm(`Crack ${itemLabel(item)} for $${NMG_CRACK_COST.toLocaleString()}? This removes the grade and returns 1x ${itemLabel(baseTitle)} to your inventory. This cannot be undone.${certLine}`)) return;

  try {
    // The server does the whole thing (cash, inventory swap, Portfolio Showcase detach, cert
    // retirement) and hands back the authoritative character -- no local mutation to drift from it.
    const result = await apiNmgCrack(stackId);
    character = result.character;
    save();
    logTo(nmgLog, `Cracked ${itemLabel(item)} back into ${itemLabel(baseTitle)}.${result.cert ? ` ${result.cert} retired.` : ''}`, 'loss');
    await refreshNmgCerts();
    renderAll();
  } catch (err) {
    logTo(nmgLog, err.reason || 'Could not reach the server.', 'loss');
  }
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
const NMG_REGRADE_FEES = GRADERS.nmg.regradeFees;
const NMG_TIER_LABELS = { '3hr': '3 Hour Turnaround', '1hr': '1 Hour Turnaround', '10min': '10 Minute Turnaround' };

// A slab always goes back to the grader that graded it -- an MGA slab regrades at MGA prices with
// fresh SUBGAINS, a CCG slab at CCG prices with none. The server reads the grader off the slab's own
// id and ignores anything the client says about it, so this is display only.
function regradeFeesFor(stackId) {
  const item = getItemDef(stackId);
  const grader = getGraderDef(item && item.grader) || GRADERS.nmg;
  return grader.regradeFees;
}

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
  const fees = nmgRegradeSelectedStackId ? regradeFeesFor(nmgRegradeSelectedStackId) : NMG_REGRADE_FEES;
  nmgRegradeTierOptions.innerHTML = Object.keys(fees).map((tier) => `
    <button class="nmg-tier-btn nmg-regrade-tier-btn" data-tier="${tier}">${NMG_TIER_LABELS[tier]}<br>$${fees[tier].toLocaleString()}</button>
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
  renderGroupedTitlePicker(nmgRegradeCandidates(), (titleId) => {
    nmgRegradeSelectedStackId = titleId;
    const item = getItemDef(titleId);
    const grader = getGraderDef(item && item.grader) || GRADERS.nmg;
    // Fees are per-grader, so the tier buttons can only be built once we know WHICH slab.
    buildNmgRegradeTierOptions();
    nmgRegradeSelectedTitleName.textContent = `${item ? itemLabel(item) : titleId} \u2192 back to ${grader.short}`;
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
    const grader = getGraderDef(item && item.grader) || GRADERS.nmg;
    const fee = regradeFeesFor(nmgRegradeSelectedStackId)[nmgRegradeSelectedTier];
    const cert = certForGradedId(nmgRegradeSelectedStackId);
    // CERT CONTINUITY is the reassuring half of this scary confirm: the grade can go down, but the
    // cert number survives and the regrade becomes part of the slab's recorded story.
    const certLine = cert ? `\n\n${cert.label} keeps its number -- the regrade is recorded in its provenance.` : '';
    const subLine = grader.subgains ? '\nSUBGAINS are re-rolled too.' : '';
    if (!confirm(`Regrade ${itemLabel(item)} at ${grader.short} for $${fee.toLocaleString()}? The current grade (${item.nmgGrade}) is destroyed and replaced by a fresh roll -- it can come back LOWER.${subLine} This cannot be undone.${certLine}`)) return;
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
    // CosmetixxMarket stocks NMG slabs and only NMG slabs -- the store is the SYSTEM buying
    // grading, and the system uses the everyman grader (MGA is a player prestige path you opt into,
    // CCG a player budget choice). Mirrors the same hardcoded choice in /cosmetixx-market/buy.
    const def = getItemDef(`${slot.titleId}${GRADERS.nmg.suffix}${slot.grade}`);
    if (!def) return '';
    return `
      <div class="profile-slab-slot">
        ${nmgSlabHtml(def, null)}
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

// ---------- Pop Report ----------
// The headline collectibility feature: for every title x grade with at least one LIVING cert, how
// many exist. Three separate populations -- CCG, NMG and MGA are different graders and a CCG 10 is
// not "the same slab" as an MGA 10 -- so the report is sectioned by grader with a toggle, on the
// same title x grade axes.
//
// The server does the aggregation and caches it for 60s (GET /grading/pop-report); the crate
// grouping and rarity ordering happen HERE because the crate catalogs and their pull weights live
// client-side and the server has no title catalog of its own.
const nmgPopReportBody = document.getElementById('nmgPopReportBody');
const nmgPopReportGraderTabs = document.getElementById('nmgPopReportGraderTabs');
const nmgPopReportMeta = document.getElementById('nmgPopReportMeta');
const btnNmgPopReportRefresh = document.getElementById('btnNmgPopReportRefresh');

let popReportCache = null;
let popReportGrader = 'nmg';

// Rarity first (rarest crate-pull weight first), then grade descending -- so the interesting rows
// are at the top of every crate section instead of buried under a wall of commons.
const POP_RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

function popTitleSortKey(preGradeId) {
  const base = parsePrestigeId(preGradeId.replace(/_foil$/, '')).baseId;
  const def = getItemDef(base);
  const rarityRank = def && def.rarity ? (POP_RARITY_ORDER[def.rarity] ?? 4) : 4;
  // Weight ascending inside a rarity band: a 0.05% mythic outranks a 5% one, and the rarity words
  // are inconsistent across crates (RED/BLUE's "mythic" is a 5% pull; Anima's is 0.05%).
  const weight = def && typeof def.weight === 'number' ? def.weight : 999;
  return { rarityRank, weight };
}

async function refreshPopReport(force) {
  try {
    popReportCache = await apiGradingPopReport();
  } catch (err) {
    if (!popReportCache) {
      if (nmgPopReportBody) nmgPopReportBody.innerHTML = '<p class="equip-picker-empty">Could not load the Pop Report.</p>';
      return;
    }
  }
  void force;
  buildPopReport();
}

function buildPopReportGraderTabs() {
  if (!nmgPopReportGraderTabs || !popReportCache) return;
  nmgPopReportGraderTabs.innerHTML = popReportCache.graders.map((g) => `
    <button class="nmg-pop-grader-tab${g.grader === popReportGrader ? ' active' : ''}" data-pop-grader="${g.grader}">
      ${escapeHtml(g.short)} <span class="nmg-pop-grader-total">${g.total.toLocaleString()}</span>
    </button>
  `).join('');
  nmgPopReportGraderTabs.querySelectorAll('[data-pop-grader]').forEach((btn) => {
    btn.addEventListener('click', () => {
      popReportGrader = btn.dataset.popGrader;
      buildPopReport();
    });
  });
}

function buildPopReport() {
  if (!nmgPopReportBody || !popReportCache) return;
  buildPopReportGraderTabs();

  const section = popReportCache.graders.find((g) => g.grader === popReportGrader);
  if (nmgPopReportMeta) {
    const ageS = Math.max(0, Math.round((Date.now() + clockOffsetMs - popReportCache.cachedAt) / 1000));
    nmgPopReportMeta.textContent = `${section ? section.total.toLocaleString() : 0} living ${section ? section.short : ''} slabs across the city · updated ${ageS}s ago`;
  }
  if (!section || !section.titles.length) {
    nmgPopReportBody.innerHTML = `<p class="equip-picker-empty">No ${section ? section.short : ''} slabs exist yet. Be the first.</p>`;
    return;
  }

  // Group by crate, using the same labels the title pickers already use, so the report reads like
  // the rest of the game's cosmetics surfaces rather than a database dump.
  const byCrate = new Map();
  section.titles.forEach((t) => {
    const base = parsePrestigeId(t.preGradeId.replace(/_foil$/, '')).baseId;
    const def = getItemDef(base);
    // titleCrateGroupLabel() branches on nmgGrade first, so it must be handed the BASE title def,
    // never the graded one -- otherwise every row would land in "Graded Titles".
    const label = def ? titleCrateGroupLabel(def) : OTHER_TITLES_LABEL;
    if (!byCrate.has(label)) byCrate.set(label, []);
    byCrate.get(label).push(t);
  });

  const crateBlocks = [...byCrate.entries()].map(([label, titles]) => {
    titles.sort((a, b) => {
      const ka = popTitleSortKey(a.preGradeId);
      const kb = popTitleSortKey(b.preGradeId);
      if (ka.rarityRank !== kb.rarityRank) return ka.rarityRank - kb.rarityRank;
      if (ka.weight !== kb.weight) return ka.weight - kb.weight;
      return a.preGradeId.localeCompare(b.preGradeId);
    });
    const crateTotal = titles.reduce((sum, t) => sum + t.total, 0);
    const cratePop1s = titles.reduce((sum, t) => sum + t.grades.filter((g) => g.pop === 1).length, 0);

    const rows = titles.map((t) => {
      const def = getItemDef(t.preGradeId);
      const name = def ? itemLabel(def) : t.preGradeId;
      const gradeRows = t.grades.map((g) => {
        // POP 1 is the flex: exactly one of this title at this grade from this grader exists in the
        // entire game. It gets its own row treatment -- this is the line players will screenshot.
        const isPop1 = g.pop === 1;
        const tier = NMG_GRADE_TIERS[g.grade];
        return `
          <tr class="${isPop1 ? 'nmg-pop-1-row' : ''}">
            <td class="nmg-pop-grade"><span class="nmg-pop-grade-chip" style="color:${tier ? tier.color : '#fff'}">${g.grade}</span> ${escapeHtml(tier ? tier.label : '')}</td>
            <td class="nmg-pop-count">${isPop1 ? '<span class="nmg-pop-1-badge">POP 1</span>' : g.pop.toLocaleString()}</td>
            <td class="nmg-pop-extra">${g.fePop > 0 ? `<span class="nmg-pop-fe" title="First Edition copies">\u{1F3F7} ${g.fePop}</span>` : ''}${g.blPop > 0 ? `<span class="nmg-pop-bl" title="Black Label copies">BLACK LABEL ${g.blPop}</span>` : ''}</td>
          </tr>
        `;
      }).join('');
      return `
        <div class="nmg-pop-title-block">
          <div class="nmg-pop-title-head">
            <span class="nmg-pop-title-name">${escapeHtml(name)}</span>
            <span class="nmg-pop-title-total">total ${t.total.toLocaleString()}</span>
          </div>
          <table class="nmg-pop-table"><tbody>${gradeRows}</tbody></table>
        </div>
      `;
    }).join('');

    return `
      <details class="nmg-pop-crate" open>
        <summary>
          <span class="nmg-pop-crate-label">${escapeHtml(label)}</span>
          <span class="nmg-pop-crate-summary">${titles.length} title${titles.length === 1 ? '' : 's'} · ${crateTotal.toLocaleString()} slab${crateTotal === 1 ? '' : 's'}${cratePop1s ? ` · ${cratePop1s} Pop 1` : ''}</span>
        </summary>
        ${rows}
      </details>
    `;
  }).join('');

  nmgPopReportBody.innerHTML = crateBlocks;
}

if (btnNmgPopReportRefresh) {
  btnNmgPopReportRefresh.addEventListener('click', () => refreshPopReport(true));
}

// ---------- Cert Lookup ----------
// Type a cert number, get the slab, its current owner, its SUBGAINS, its First Edition status and
// its full provenance timeline. Addressed by the DISPLAY series (grader + number) because that is
// what is printed on the slab -- the global cert_no is an internal id nobody ever sees.
const nmgCertLookupGrader = document.getElementById('nmgCertLookupGrader');
const nmgCertLookupInput = document.getElementById('nmgCertLookupInput');
const btnNmgCertLookup = document.getElementById('btnNmgCertLookup');
const nmgCertLookupResult = document.getElementById('nmgCertLookupResult');

const CERT_EVENT_COPY = {
  graded: (e) => `Graded${e.by ? ` for ${escapeHtml(e.by)}` : ''}${e.grade ? ` — grade ${e.grade}` : ''}${e.legacy ? ' (pre-registry, backfilled)' : ''}`,
  regraded: (e) => `Regraded${e.by ? ` by ${escapeHtml(e.by)}` : ''}${e.fromGrade ? ` — ${e.fromGrade} → ${e.grade}` : e.grade ? ` — grade ${e.grade}` : ''}`,
  market_mint: () => 'Minted for the CosmetixxMarket rotation',
  market_buy: (e) => `Bought on CosmetixxMarket${e.to ? ` by ${escapeHtml(e.to)}` : ''}${e.price ? ` for $${e.price.toLocaleString()}` : ''}`,
  mtn_sale: (e) => `Sold${e.from ? ` by ${escapeHtml(e.from)}` : ''}${e.to ? ` to ${escapeHtml(e.to)}` : ''}${e.price ? ` for $${e.price.toLocaleString()}` : ''}`,
  trade: (e) => `Traded${e.from ? ` from ${escapeHtml(e.from)}` : ''}${e.to ? ` to ${escapeHtml(e.to)}` : ''}`,
  cracked: (e) => `Cracked${e.by ? ` by ${escapeHtml(e.by)}` : ''}${e.reconciled ? ' (registry reconciliation)' : ''} — slab destroyed`,
};

function certEventLine(e) {
  const fn = CERT_EVENT_COPY[e.type];
  const when = new Date(e.t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `
    <li class="nmg-cert-event nmg-cert-event-${escapeHtml(e.type)}">
      <span class="nmg-cert-event-date">${escapeHtml(when)}</span>
      <span class="nmg-cert-event-text">${fn ? fn(e) : escapeHtml(e.type)}</span>
    </li>
  `;
}

async function runCertLookup() {
  if (!nmgCertLookupResult) return;
  const grader = nmgCertLookupGrader ? nmgCertLookupGrader.value : 'nmg';
  // Tolerant of how a player would actually type it: "NMG #000482", "#482", "482" all work.
  const raw = (nmgCertLookupInput ? nmgCertLookupInput.value : '').trim();
  const seriesNo = Number(raw.replace(/^[a-z]{3}/i, '').replace(/[^0-9]/g, ''));
  if (!seriesNo) {
    nmgCertLookupResult.innerHTML = '<p class="equip-picker-empty">Enter a cert number.</p>';
    return;
  }
  nmgCertLookupResult.innerHTML = '<p class="equip-picker-empty">Looking up…</p>';
  try {
    const result = await apiGradingCert(grader, seriesNo);
    const cert = result.cert;
    const def = getItemDef(cert.gradedId);
    const retired = cert.retiredAt !== null && cert.retiredAt !== undefined;
    nmgCertLookupResult.innerHTML = `
      <div class="nmg-cert-card${retired ? ' nmg-cert-retired' : ''}">
        <div class="nmg-cert-slab">${def ? nmgSlabHtml(def, cert) : '<p class="equip-picker-empty">This cert refers to a title this client does not know.</p>'}</div>
        <div class="nmg-cert-facts">
          <h3>${escapeHtml(cert.label)}</h3>
          ${retired ? '<p class="nmg-cert-retired-stamp">RETIRED — this slab was cracked and no longer exists.</p>' : ''}
          <p><b>Owner</b> ${cert.ownerName ? escapeHtml(cert.ownerName) : '—'}</p>
          <p><b>Graded</b> ${escapeHtml(new Date(cert.mintedAt).toLocaleDateString())} · ${escapeHtml(cert.source)}</p>
          <p><b>First Edition</b> ${cert.firstEdition ? '\u{1F3F7} Yes' : 'No'}</p>
          <p><b>SUBGAINS</b> ${cert.subgains
            ? SUBGAIN_ORDER.map(([k, l]) => `${escapeHtml(l)} ${cert.subgains[k]}`).join(' · ')
            : '—'}</p>
          ${cert.blackLabel ? '<p class="nmg-cert-black-label">BLACK LABEL</p>' : ''}
          <h4>Provenance</h4>
          <ul class="nmg-cert-timeline">${cert.history.length ? cert.history.map(certEventLine).join('') : '<li class="nmg-cert-event">No recorded events.</li>'}</ul>
        </div>
      </div>
    `;
  } catch (err) {
    nmgCertLookupResult.innerHTML = `<p class="equip-picker-empty">${escapeHtml(err.reason || 'Could not reach the server.')}</p>`;
  }
}

if (btnNmgCertLookup) btnNmgCertLookup.addEventListener('click', () => runCertLookup());
if (nmgCertLookupInput) {
  nmgCertLookupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runCertLookup();
  });
}

// ---------- Set Registry ----------
// PSA Set Registry parody: own a graded slab (any grader, any grade) of every title in a crate and
// the set is complete. The server does all the aggregation (your progress + the public ranked
// board) and caches it for 60s, same as the Pop Report above -- see GET /grading/registry.
const nmgRegistryProgressEl = document.getElementById('nmgRegistryProgress');
const nmgRegistryBoardEl = document.getElementById('nmgRegistryBoard');
const nmgRegistryMeta = document.getElementById('nmgRegistryMeta');
const btnNmgRegistryRefresh = document.getElementById('btnNmgRegistryRefresh');

let registryCache = null;

// Matches the icon each set's crate already carries in TITLE_CRATE_GROUPS (js/market.js), keyed by
// the server's crate `key` (mfmmoserver/gameLogic.js REGISTRY_CRATE_DEFS) rather than re-deriving
// it, since the server owns which titles belong to which set.
const REGISTRY_CRATE_ICONS = {
  anima: '🎮', counterfinish: '🎨', red: '🔴', blue: '🔵', llg: '✅',
  milosLegends: '🎖️', anima2: '🎮', waifu: '💖',
};

function registrySetIcon(key) {
  return REGISTRY_CRATE_ICONS[key] || '📇';
}

async function refreshRegistry(force) {
  try {
    registryCache = await apiGradingRegistry();
  } catch (err) {
    if (!registryCache) {
      if (nmgRegistryProgressEl) nmgRegistryProgressEl.innerHTML = '<p class="equip-picker-empty">Could not load the Set Registry.</p>';
      if (nmgRegistryBoardEl) nmgRegistryBoardEl.innerHTML = '';
      return;
    }
  }
  void force;
  buildRegistryProgress();
  buildRegistryBoard();
}

function buildRegistryProgress() {
  if (!nmgRegistryProgressEl || !registryCache) return;
  if (nmgRegistryMeta) {
    const ageS = Math.max(0, Math.round((Date.now() + clockOffsetMs - registryCache.cachedAt) / 1000));
    nmgRegistryMeta.textContent = `Updated ${ageS}s ago`;
  }
  if (!registryCache.yourProgress.length) {
    nmgRegistryProgressEl.innerHTML = '<p class="equip-picker-empty">No sets to chase yet.</p>';
    return;
  }
  nmgRegistryProgressEl.innerHTML = registryCache.yourProgress.map((set) => {
    const pct = set.total ? Math.round((set.haveCount / set.total) * 100) : 0;
    const missingBadges = set.missing.map((id) => {
      const def = getItemDef(id);
      return `<span class="nmg-reg-missing-badge">${escapeHtml(def ? itemLabel(def) : id)}</span>`;
    }).join('');
    return `
      <div class="nmg-reg-set${set.complete ? ' nmg-reg-complete' : ''}">
        <div class="nmg-reg-set-head">
          <span class="nmg-reg-set-name">${registrySetIcon(set.key)} ${escapeHtml(set.name)}</span>
          <span class="nmg-reg-set-count">${set.haveCount}/${set.total} titles</span>
          ${set.complete ? `<span class="nmg-reg-set-gpa">GPA ${set.gpa.toFixed(2)}</span>` : ''}
        </div>
        <div class="nmg-reg-progress-bar"><div class="nmg-reg-progress-fill" style="width:${pct}%"></div></div>
        ${set.complete
          ? '<p class="nmg-reg-set-complete-note">Set complete. Sitting in the public Registry below.</p>'
          : `<div class="nmg-reg-missing">${missingBadges}</div>`}
      </div>
    `;
  }).join('');
}

function buildRegistryBoard() {
  if (!nmgRegistryBoardEl || !registryCache) return;
  const blocks = registryCache.sets.map((set) => {
    const rows = (registryCache.registry[set.key] || []);
    const body = rows.length
      ? `
        <table class="nmg-reg-board-table">
          <thead><tr><th></th><th>Player</th><th>Grader Mix</th><th>Completed</th><th>GPA</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => {
              const mix = Object.entries(r.graderMix || {})
                .sort((a, b) => b[1] - a[1])
                .map(([g, n]) => `${n} ${(GRADERS[g] && GRADERS[g].short) || g.toUpperCase()}`)
                .join(' · ');
              const when = new Date(r.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
              return `
                <tr>
                  <td class="nmg-reg-board-rank">${i + 1}</td>
                  <td class="nmg-reg-board-name"><a href="#" onclick="viewProfile('${escapeHtml(r.username)}'); return false;">${escapeHtml(r.name)}</a></td>
                  <td class="nmg-reg-board-mix">${escapeHtml(mix)}</td>
                  <td class="nmg-reg-board-date">${escapeHtml(when)}</td>
                  <td class="nmg-reg-board-gpa">${r.gpa.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `
      : '<p class="equip-picker-empty">Nobody has finished this set yet. Be the first name on the board.</p>';
    return `
      <details class="nmg-pop-crate" open>
        <summary>
          <span class="nmg-pop-crate-label">${registrySetIcon(set.key)} ${escapeHtml(set.name)}</span>
          <span class="nmg-pop-crate-summary">${rows.length} completed set${rows.length === 1 ? '' : 's'}</span>
        </summary>
        ${body}
      </details>
    `;
  }).join('');
  nmgRegistryBoardEl.innerHTML = blocks;
}

if (btnNmgRegistryRefresh) {
  btnNmgRegistryRefresh.addEventListener('click', () => refreshRegistry(true));
}

// The Pop Report and Set Registry are each a whole extra aggregate query, so both load lazily on
// their own sub-tab click -- same reasoning as the NMG slot state and the CosmetixxMarket rotation
// above.
document.querySelectorAll('[data-nmg-subtab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.nmgSubtab;
    document.querySelectorAll('[data-nmg-subtab]').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('[data-nmg-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.nmgPanel !== target);
    });
    if (target === 'pop') refreshPopReport();
    if (target === 'reg') refreshRegistry();
  });
});
