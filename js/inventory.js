// ---------- Inventory & Equipment ----------
const licensesGrid = document.getElementById('licensesGrid');
const itemsGrid = document.getElementById('itemsGrid');
const cosmeticsGrid = document.getElementById('cosmeticsGrid');
const inventoryLog = document.getElementById('inventoryLog');
const tradeItemSelect = document.getElementById('tradeItemSelect');
const tradeUsernameInput = document.getElementById('tradeUsernameInput');
const btnTradeSend = document.getElementById('btnTradeSend');
const equipSlotEls = document.querySelectorAll('.equip-slot');
const equipPickerModal = document.getElementById('equipPickerModal');
const equipPickerTitle = document.getElementById('equipPickerTitle');
const equipPickerList = document.getElementById('equipPickerList');
const btnEquipPickerClose = document.getElementById('btnEquipPickerClose');

// Crate sections render in the same order as the Switch Title dropdown's groups, with a dedicated
// Graded Titles section (still reachable here via the MTN item picker, js/mtn.js, even though
// renderCosmeticsGrid() below excludes graded stacks from this file's own grid) and "Other Titles"
// (purchased/leaderboard/custom -- never crate-sourced) always last.
const CRATE_GROUP_ORDER = [...TITLE_CRATE_GROUPS.map((g) => g.label), NMG_GRADED_LABEL, OTHER_TITLES_LABEL];

// UI-only state for the Cosmetics accordion -- which crate section is open and which of its
// Regular/Prestige sub-tabs is active. Lives outside buildInventoryGrid() so it survives the
// full re-render every save()/renderAll() triggers instead of resetting to collapsed each time.
let cosmeticsExpandedCrate = null;
const cosmeticsActiveSubTab = {};

function titleStackCardHtml(stack) {
  const item = getItemDef(stack.id);
  const { level } = parsePrestigeId(stack.id);
  // Only crate/store titles carry a `rarity` -- leaderboard/achievement/custom titles have
  // none and so get neither button (selling/prestiging those wouldn't make sense).
  // Foils are unsellable. The price table is keyed on base rarity, so a Foil would sell for the
  // same flat price as any one plain copy -- far under the 3 copies + $25,000 it cost to forge.
  // There's no price that makes the trade sane (a Foil is meant to be terminal), so the action is
  // removed rather than repriced. Mirrored in sellTitle().
  const sellPrice = item.rarity && !item.foil ? TITLE_SELL_PRICE_BY_RARITY[item.rarity] : null;
  // Base (unprestiged) stacks need 6 so one copy survives the prestige; already-prestiged
  // stacks fully convert at 5, since there's no reason to keep the lower prestige rank around.
  const prestigeThreshold = level === 0 ? PRESTIGE_COST + 1 : PRESTIGE_COST;
  // A graded (NMG) title inherits `rarity` from its base via the spread in getItemDef(), so this
  // must explicitly exclude it too -- otherwise a slab could be "prestiged" into a nonsensical
  // double-suffixed id (`..._nmg7_p1`). Graded stacks shouldn't reach this card at all in practice
  // (renderCosmeticsGrid() excludes them, they render via the Graded Titles tab instead) but this
  // stays defensive since titleStackCardHtml() has no other guarantee about its caller.
  // Foils are excluded for the same reason graded slabs are: a prestiged foil would produce a
  // double-suffixed `..._foil_p1` id that nothing knows how to resolve. Kept deliberately simple --
  // a Foil is a terminal form.
  const canPrestige = item.rarity && !item.nmgGrade && !item.foil && stack.qty >= prestigeThreshold && !llgPrestigeCapReached(parsePrestigeId(stack.id).baseId, level);
  return `
    <div class="hustle-card">
      <h3>${itemLabel(item)}</h3>
      <p class="item-subheading">Title${item.rarity ? ` &middot; ${item.rarity}` : ''}</p>
      ${item.foil ? '<p class="foil-ascended-line">FOIL ASCENDED</p>' : ''}
      <div class="title-preview">${titleBadgeMarkup(item)}</div>
      <p>&times; ${stack.qty}</p>
      ${sellPrice ? `<button data-sell-title="${stack.id}" class="secondary-btn">Sell ($${sellPrice.toLocaleString()})</button>` : ''}
      ${canPrestige ? `<button data-prestige-title="${stack.id}">Prestige Title</button>` : ''}
    </div>
  `;
}

// Groups owned title stacks by the crate they (or their prestige/foil base) came from, then splits
// each crate's stacks into Regular (prestige level 0), Prestige (level >= 1), and Foil buckets,
// sorted per the user's ask: Regular by rarity, Prestige by prestige level (then rarity as a
// tiebreak).
//
// Foils live here, under their own crate, rather than in a seventh top-level inventory tab: a Foil
// Krogger is a Krogger, and the category row was already carrying six tabs of which three would
// have been "titles in a different state". GRADED foils are the exception and still go to the
// Graded Titles tab -- renderCosmeticsGrid()'s `!item.nmgGrade` filter keeps them out of here
// entirely, so "ungraded foil -> Titles > Foil, graded foil -> Graded Titles" holds without any
// special-casing in this function.
const TITLE_SUBTABS = ['regular', 'prestige', 'foil'];
const TITLE_SUBTAB_LABELS = { regular: 'Regular', prestige: 'Prestige', foil: '\u2728 Foil' };

function groupTitleStacksByCrate(titleStacks) {
  const groups = new Map();
  const byRarityThenPrestige = compareTitleStacksByRarityThenPrestige((s) => s.id, (s) => getItemDef(s.id));

  titleStacks.forEach((stack) => {
    const item = getItemDef(stack.id);
    const label = titleCrateGroupLabel(item);
    if (!groups.has(label)) groups.set(label, { regular: [], prestige: [], foil: [] });
    // Foil is checked FIRST: a foil id carries no `_p${level}` suffix, so parsePrestigeId() reports
    // level 0 for it and it would otherwise be filed under Regular.
    const bucket = item.foil ? 'foil' : (parsePrestigeId(stack.id).level === 0 ? 'regular' : 'prestige');
    groups.get(label)[bucket].push(stack);
  });

  groups.forEach((g) => {
    TITLE_SUBTABS.forEach((b) => g[b].sort(byRarityThenPrestige));
  });

  return groups;
}

// Renders the Titles tab (data-invcat="cosmetics" -- internal key kept for the existing wiring in
// js/milos.js and js/badges.js; only the visible label was renamed from "Cosmetics").
//
// UNGRADED foils render here, inside their own crate's Foil sub-tab. GRADED anything -- foils
// included -- is excluded by the `!item.nmgGrade` filter below and belongs to the Graded Titles
// tab instead (renderGradedTitlesGrid, js/nmg.js). That single filter is what enforces the whole
// "ungraded foil here / graded foil there" rule.
function renderCosmeticsGrid() {
  const titleStacks = character.inventory.filter((stack) => {
    const item = getItemDef(stack.id);
    return item && item.type === 'title' && !item.nmgGrade;
  });

  if (!titleStacks.length) {
    cosmeticsGrid.innerHTML = '<p class="equip-picker-empty">No titles yet. Win them from a crate in Cosmetixxx.</p>';
    return;
  }

  const groups = groupTitleStacksByCrate(titleStacks);

  cosmeticsGrid.innerHTML = CRATE_GROUP_ORDER
    .filter((label) => groups.has(label))
    .map((label) => {
      const g = groups.get(label);
      const totalQty = TITLE_SUBTABS.reduce((sum, b) => sum + g[b].reduce((n, st) => n + st.qty, 0), 0);
      const isExpanded = cosmeticsExpandedCrate === label;
      // Regular is always shown; Prestige and Foil appear only once the player owns one, matching
      // the behavior Prestige already had (no point offering an always-empty sub-tab).
      const visibleTabs = TITLE_SUBTABS.filter((b) => b === 'regular' || g[b].length > 0);
      // A stored active tab can go stale -- e.g. the last foil from a crate gets graded, which
      // moves it to the Graded Titles tab and empties this bucket. Fall back to Regular rather
      // than rendering a sub-tab that is no longer offered.
      const storedTab = cosmeticsActiveSubTab[label];
      const activeTab = visibleTabs.includes(storedTab) ? storedTab : 'regular';
      const stacksForTab = g[activeTab];
      const cardsHtml = stacksForTab.length
        ? stacksForTab.map(titleStackCardHtml).join('')
        : (activeTab === 'foil'
          ? '<p class="equip-picker-empty">No Foil titles from this crate yet. Forge one at Cosmetixxx &rarr; Foil Ascension.</p>'
          : `<p class="equip-picker-empty">No ${activeTab} titles from this crate yet.</p>`);

      return `
        <div class="crate-cosmetics-section">
          <button class="crate-cosmetics-header" data-crate-toggle="${escapeHtml(label)}">
            <span>${label}</span>
            <span class="crate-cosmetics-count">${totalQty} owned</span>
            <span class="crate-cosmetics-caret">${isExpanded ? '▾' : '▸'}</span>
          </button>
          ${isExpanded ? `
            <div class="crate-cosmetics-body">
              <div class="crate-cosmetics-subtabs">
                ${visibleTabs.map((b) => `<button class="crate-subtab-btn${activeTab === b ? ' active' : ''}${b === 'foil' ? ' crate-subtab-foil' : ''}" data-crate-subtab="${escapeHtml(label)}::${b}">${TITLE_SUBTAB_LABELS[b]}</button>`).join('')}
              </div>
              <div class="hustle-grid">${cardsHtml}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

  cosmeticsGrid.querySelectorAll('[data-crate-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = btn.dataset.crateToggle;
      cosmeticsExpandedCrate = cosmeticsExpandedCrate === label ? null : label;
      renderCosmeticsGrid();
    });
  });
  cosmeticsGrid.querySelectorAll('[data-crate-subtab]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sep = btn.dataset.crateSubtab.lastIndexOf('::');
      const label = btn.dataset.crateSubtab.slice(0, sep);
      const tab = btn.dataset.crateSubtab.slice(sep + 2);
      cosmeticsActiveSubTab[label] = tab;
      renderCosmeticsGrid();
    });
  });
  cosmeticsGrid.querySelectorAll('[data-sell-title]').forEach((btn) => {
    btn.addEventListener('click', () => sellTitle(btn.dataset.sellTitle));
  });
  cosmeticsGrid.querySelectorAll('[data-prestige-title]').forEach((btn) => {
    btn.addEventListener('click', () => prestigeTitle(btn.dataset.prestigeTitle));
  });
}

function licenseCardHtml(name, lines) {
  return `
    <div class="hustle-card">
      <div class="title-hover-wrap">
        <span class="title-badge title-peak"><span class="title-text">${name}</span></span>
        <div class="title-info-card">
          ${lines.map((line, i) => `<p class="${i === 0 ? 'title-info-rank' : 'title-info-how'}">${line}</p>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function nmcLicenseCardHtml() {
  const fullName = `${character.firstName} ${character.lastName}`;
  return licenseCardHtml('NMC License', [fullName, 'NMC Resident']);
}

function gunSafetyLicenseCardHtml() {
  if (!character.licenses.gunSafety) return '';
  const s = character.weaponSkills;
  return licenseCardHtml('Gun Safety License', [
    'Weapon Skills',
    `Shooting: ${s.shooting.toFixed(2)}`,
    `Draw: ${s.draw.toFixed(2)}`,
    `Mag Reload: ${s.magReload.toFixed(2)}`,
  ]);
}

function concealedPermitCardHtml() {
  if (!character.licenses.concealedPermit) return '';
  return licenseCardHtml('Concealed Carry Permit', [
    'Concealed Carry Permit',
    'Granted. Lets you legally holster a pistol in New Milos City.',
  ]);
}

function buildInventoryGrid() {
  if (!licensesGrid) return;

  licensesGrid.innerHTML = nmcLicenseCardHtml() + gunSafetyLicenseCardHtml() + concealedPermitCardHtml();

  const gunAndAmmoStacks = character.inventory.filter((stack) => {
    const item = getItemDef(stack.id);
    return item && item.type !== 'title' && item.type !== 'vision';
  });
  itemsGrid.innerHTML = gunAndAmmoStacks.length
    ? gunAndAmmoStacks.map((stack) => {
      const item = getItemDef(stack.id);
      return `
        <div class="hustle-card">
          <h3>${item.name}</h3>
          <p>${item.type === 'gear' ? item.desc : `${item.caliber ? `${item.caliber} ` : ''}${item.type}`} &times; ${stack.qty}</p>
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No items yet. Buy a gun or ammo at the NMC Gun Club, or drugs from Guzman.</p>';

  renderCosmeticsGrid();
  if (typeof renderGradedTitlesGrid === 'function') renderGradedTitlesGrid();
  if (typeof renderBadgesGrid === 'function') renderBadgesGrid();

  tradeItemSelect.innerHTML = character.inventory.length
    ? character.inventory.map((stack) => {
      const item = getItemDef(stack.id);
      if (!item) return '';
      const typeSuffix = item.type === 'title' ? ' (Title)' : item.type === 'vision' ? ' (Vision)' : '';
      const label = `${itemLabel(item)}${typeSuffix}`;
      return `<option value="${stack.id}">${label} (x${stack.qty})</option>`;
    }).join('')
    : '<option value="">No items to trade</option>';

  // Dropdown of currently online players (excluding yourself), by first/last name -- onlinePlayersCache
  // is kept fresh app-wide (see milos.js's setInterval), not just while viewing New Milos City.
  const prevTradeTarget = tradeUsernameInput.value;
  tradeUsernameInput.innerHTML = onlinePlayersCache.length
    ? onlinePlayersCache.map((p) => `<option value="${p.username}">${escapeHtml(`${p.character.firstName} ${p.character.lastName}`)}</option>`).join('')
    : '<option value="">No players online</option>';
  if (onlinePlayersCache.some((p) => p.username === prevTradeTarget)) tradeUsernameInput.value = prevTradeTarget;
  btnTradeSend.disabled = !onlinePlayersCache.length;
}

// Titles are entirely client-side/trust-based (same as buying a crate spin or equipping a title),
// so Sell/Prestige are plain local mutations + the usual debounced sync, no server route needed.
//
// ONE exception: a GRADED slab carries a cert, and the registry is server-authoritative. Selling a
// slab for cash destroys it, so the cert is destroyed with it -- otherwise the Pop Report keeps
// counting a slab nobody holds and its number keeps resolving in Cert Lookup. This is the sidebar
// Sell only; an MTN listing or a profile stall sale moves the slab to another player, and there the
// cert moves with it and stays alive (see the hook list in mfmmoserver/server.js).
async function sellTitle(stackId) {
  const item = getItemDef(stackId);
  if (!item || !item.rarity || item.foil) return;
  const price = TITLE_SELL_PRICE_BY_RARITY[item.rarity];
  // Named in the confirm the same way Crack names it -- this is the more final of the two: a crack
  // keeps the number (retired, still looked-up-able), a sale deletes it outright.
  const cert = item.nmgGrade ? certForGradedId(stackId) : null;
  const certLine = cert ? `\n\n${cert.label} will be permanently DESTROYED -- struck from the grading registry and the Pop Report.` : '';
  if (!confirm(`Sell 1x ${itemLabel(item)} for $${price.toLocaleString()}? This cannot be undone.${certLine}`)) return;

  // Cert first, sale second. If the server can't be reached the player still has the slab, which is
  // the recoverable failure; the other order loses the slab locally while its cert lives on.
  if (item.nmgGrade) {
    try {
      await apiGradingDestroyCert(stackId);
    } catch (err) {
      alert(err.reason || 'Could not reach the server. The slab was not sold.');
      return;
    }
  }

  removeFromInventory(stackId, 1);
  character.cash = round2(character.cash + price);
  logTo(inventoryLog, `Sold ${itemLabel(item)} for $${price.toLocaleString()}.${cert ? ` ${cert.label} destroyed.` : ''}`, 'gain');
  save();
  // A duplicate stack's next cert becomes the one on show, so the cache has to catch up.
  if (item.nmgGrade) await refreshNmgCerts();
  renderAll();
}

function prestigeTitle(stackId) {
  const item = getItemDef(stackId);
  if (!item || !item.rarity || item.nmgGrade || item.foil) return;
  const { baseId, level } = parsePrestigeId(stackId);
  const threshold = level === 0 ? PRESTIGE_COST + 1 : PRESTIGE_COST;
  if (inventoryQty(stackId) < threshold) return;
  if (llgPrestigeCapReached(baseId, level)) return;

  const nextId = `${baseId}_p${level + 1}`;
  const nextDef = getItemDef(nextId);
  if (!confirm(`Prestige ${itemLabel(item)}? This consumes ${PRESTIGE_COST}x and grants 1x ${itemLabel(nextDef)}. This cannot be undone.`)) return;

  removeFromInventory(stackId, PRESTIGE_COST);
  addToInventory(nextId, 1);
  logTo(inventoryLog, `Prestiged into ${itemLabel(nextDef)}!`, 'gain');
  save();
  renderAll();
}

btnTradeSend.addEventListener('click', () => {
  const itemId = tradeItemSelect.value;
  const username = tradeUsernameInput.value;
  if (!itemId || !username) return;
  const item = getItemDef(itemId);
  const target = onlinePlayersCache.find((p) => p.username === username);
  const targetName = target ? `${target.character.firstName} ${target.character.lastName}` : username;
  logTo(inventoryLog, `Trade offer for ${item ? itemLabel(item) : itemId} sent to ${targetName}. They'll see it once multiplayer is live.`, 'gain');
  tradeUsernameInput.value = '';
});

function slotAcceptsItem(slot, item) {
  if (slot === 'holsterL' || slot === 'holsterR') return item.type === 'pistol';
  if (slot === 'openCarry') return item.type === 'pistol' || item.type === 'rifle';
  if (slot === 'melee') return item.type === 'melee';
  if (slot === 'helmet' || slot === 'chest' || slot === 'pants' || slot === 'feet' || slot === 'armor') return item.type === 'gear' && item.slot === slot;
  return false;
}

function renderEquipmentBoard() {
  equipSlotEls.forEach((slotEl) => {
    const slot = slotEl.dataset.slot;
    const itemId = character.equipment[slot];
    const itemLabelEl = slotEl.querySelector('.equip-slot-item');
    itemLabelEl.textContent = itemId ? (getItemDef(itemId)?.name || itemId) : '(empty)';
  });
}

function openEquipPicker(slot) {
  equipPickerTitle.textContent = `Equip — ${slot.replace('holsterL', 'Holster (Left)').replace('holsterR', 'Holster (Right)').replace('openCarry', 'Open Carry').replace('melee', 'Melee Weapon').toUpperCase()}`;
  const currentItemId = character.equipment[slot];
  const eligibleStacks = character.inventory.filter((stack) => {
    const item = getItemDef(stack.id);
    return item && slotAcceptsItem(slot, item);
  });

  let html = '';
  if (currentItemId) {
    const currentItem = getItemDef(currentItemId);
    html += `<div class="equip-picker-item" data-unequip="1"><span>Unequip ${currentItem ? currentItem.name : currentItemId}</span><span>&times;</span></div>`;
  }
  if (eligibleStacks.length === 0) {
    html += '<div class="equip-picker-empty">No eligible items available for this slot.</div>';
  } else {
    html += eligibleStacks.map((stack) => {
      const item = getItemDef(stack.id);
      return `<div class="equip-picker-item" data-equip-item="${item.id}"><span>${item.name} (x${stack.qty})</span><span>Equip</span></div>`;
    }).join('');
  }
  equipPickerList.innerHTML = html;

  equipPickerList.querySelectorAll('[data-equip-item]').forEach((el) => {
    el.addEventListener('click', () => {
      doEquipItem(slot, el.dataset.equipItem);
      save();
      renderAll();
      equipPickerModal.classList.add('hidden');
    });
  });
  const unequipEl = equipPickerList.querySelector('[data-unequip]');
  if (unequipEl) {
    unequipEl.addEventListener('click', () => {
      doUnequipItem(slot);
      save();
      renderAll();
      equipPickerModal.classList.add('hidden');
    });
  }

  equipPickerModal.classList.remove('hidden');
}

function doEquipItem(slot, itemId) {
  character.equipment[slot] = itemId;
}

function doUnequipItem(slot) {
  character.equipment[slot] = null;
}

equipSlotEls.forEach((slotEl) => {
  slotEl.addEventListener('click', () => openEquipPicker(slotEl.dataset.slot));
});

btnEquipPickerClose.addEventListener('click', () => {
  equipPickerModal.classList.add('hidden');
});

// ---------- Skills tab ----------
function skillBarRowHtml(label, value, max = 100) {
  const pct = Math.min(100, (value / max) * 100);
  return `
    <div class="skill-bar-row">
      <span class="skill-bar-label">${label}</span>
      <div class="progress-outer skill-bar-outer"><div class="progress-inner" style="width: ${pct}%"></div></div>
      <span class="skill-bar-value">${value.toFixed(2)}/${max}</span>
    </div>
  `;
}

function renderSkillsTab() {
  const jobSection = document.getElementById('skillsJobSection');
  const badJobSection = document.getElementById('skillsBadJobSection');
  const weaponSection = document.getElementById('skillsWeaponSection');
  const dealerSection = document.getElementById('skillsDealerSection');
  if (!jobSection) return;

  if (character.jobs.currentJob) {
    const job = GOOD_JOBS.find((j) => j.id === character.jobs.currentJob);
    const s = character.jobs.skills;
    jobSection.innerHTML = `
      <div class="hustle-card skill-card">
        <h3>${job.name} (Good Hustle)</h3>
        ${job.skills.map((sk) => skillBarRowHtml(sk.label, s[sk.key])).join('')}
      </div>
    `;
  } else {
    jobSection.innerHTML = '<div class="hustle-card skill-card"><h3>Good Hustle</h3><p class="equip-picker-empty">Not currently employed.</p></div>';
  }

  if (character.badJobs.currentJob) {
    const job = BAD_JOBS.find((j) => j.id === character.badJobs.currentJob);
    const s = character.badJobs.skills;
    badJobSection.innerHTML = `
      <div class="hustle-card skill-card">
        <h3>${job.name} (Bad Hustle)</h3>
        ${job.skills.map((sk) => skillBarRowHtml(sk.label, s[sk.key])).join('')}
      </div>
    `;
  } else {
    badJobSection.innerHTML = '<div class="hustle-card skill-card"><h3>Bad Hustle</h3><p class="equip-picker-empty">Not currently employed.</p></div>';
  }

  const ws = character.weaponSkills;
  weaponSection.innerHTML = `
    <div class="hustle-card skill-card">
      <h3>Weapon Skills</h3>
      ${skillBarRowHtml('Shooting', ws.shooting)}
      ${skillBarRowHtml('Draw', ws.draw)}
      ${skillBarRowHtml('Mag Reload', ws.magReload)}
    </div>
  `;

  const locked = nextLockedDealer();
  const unitsSold = character.drugDealer.unitsSold;
  dealerSection.innerHTML = `
    <div class="hustle-card skill-card">
      <h3>Drug Dealer Reputation</h3>
      ${locked
        ? skillBarRowHtml(`Units sold toward ${locked.name}`, unitsSold, locked.unlockUnits)
        : `<p>Units sold: ${unitsSold}. You've met every dealer in town.</p>`}
    </div>
  `;
}

// ---------- Alignment tab ----------
function renderAlignmentTab() {
  const marker = document.getElementById('alignmentMarker');
  if (!marker) return;
  marker.style.left = `${character.alliance}%`;

  document.getElementById('alignmentStatusText').textContent =
    `You are currently ${allianceLabel(character.alliance)} (${round1(character.alliance)}/100).`;

  const s = character.stats;
  const avg = (s.health + s.attack + s.speed + s.defense + s.looks) / 5;
  document.getElementById('journeyLevelText').textContent = `Level ${computeLevel()} -- ${computeRank()}.`;
  document.getElementById('journeyStatBar').style.width = `${avg}%`;
  document.getElementById('journeyStatText').textContent =
    `Average stat: ${round1(avg)}/100. Max all 5 stats to 100 to earn the PEAK CIVILIAN title.`;
}

