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

// Crate sections render in the same order as the Switch Title dropdown's groups, with
// "Other Titles" (purchased/leaderboard/custom -- never crate-sourced) always last.
const CRATE_GROUP_ORDER = [...TITLE_CRATE_GROUPS.map((g) => g.label), OTHER_TITLES_LABEL];

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
  const sellPrice = item.rarity ? TITLE_SELL_PRICE_BY_RARITY[item.rarity] : null;
  // Base (unprestiged) stacks need 6 so one copy survives the prestige; already-prestiged
  // stacks fully convert at 5, since there's no reason to keep the lower prestige rank around.
  const prestigeThreshold = level === 0 ? PRESTIGE_COST + 1 : PRESTIGE_COST;
  const canPrestige = item.rarity && stack.qty >= prestigeThreshold;
  return `
    <div class="hustle-card">
      <h3>${itemLabel(item)}</h3>
      <p class="item-subheading">Title${item.rarity ? ` &middot; ${item.rarity}` : ''}</p>
      <div class="title-preview">${titleBadgeMarkup(item)}</div>
      <p>&times; ${stack.qty}</p>
      ${sellPrice ? `<button data-sell-title="${stack.id}" class="secondary-btn">Sell ($${sellPrice.toLocaleString()})</button>` : ''}
      ${canPrestige ? `<button data-prestige-title="${stack.id}">Prestige Title</button>` : ''}
    </div>
  `;
}

// Groups owned title stacks by the crate they (or their prestige base) came from, then splits
// each crate's stacks into Regular (prestige level 0) and Prestige (level >= 1) buckets, sorted
// per the user's ask: Regular by rarity, Prestige by prestige level (then rarity as a tiebreak).
function groupTitleStacksByCrate(titleStacks) {
  const groups = new Map();
  const byRarityThenPrestige = compareTitleStacksByRarityThenPrestige((s) => s.id, (s) => getItemDef(s.id));

  titleStacks.forEach((stack) => {
    const item = getItemDef(stack.id);
    const label = titleCrateGroupLabel(item);
    if (!groups.has(label)) groups.set(label, { regular: [], prestige: [] });
    const bucket = parsePrestigeId(stack.id).level === 0 ? 'regular' : 'prestige';
    groups.get(label)[bucket].push(stack);
  });

  groups.forEach((g) => {
    g.regular.sort(byRarityThenPrestige);
    g.prestige.sort(byRarityThenPrestige);
  });

  return groups;
}

function renderCosmeticsGrid() {
  const titleStacks = character.inventory.filter((stack) => {
    const item = getItemDef(stack.id);
    return item && item.type === 'title';
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
      const totalQty = [...g.regular, ...g.prestige].reduce((sum, s) => sum + s.qty, 0);
      const isExpanded = cosmeticsExpandedCrate === label;
      const hasPrestige = g.prestige.length > 0;
      const activeTab = hasPrestige ? (cosmeticsActiveSubTab[label] || 'regular') : 'regular';
      const stacksForTab = activeTab === 'prestige' ? g.prestige : g.regular;
      const cardsHtml = stacksForTab.length
        ? stacksForTab.map(titleStackCardHtml).join('')
        : `<p class="equip-picker-empty">No ${activeTab} titles from this crate yet.</p>`;

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
                <button class="crate-subtab-btn${activeTab === 'regular' ? ' active' : ''}" data-crate-subtab="${escapeHtml(label)}::regular">Regular</button>
                ${hasPrestige ? `<button class="crate-subtab-btn${activeTab === 'prestige' ? ' active' : ''}" data-crate-subtab="${escapeHtml(label)}::prestige">Prestige</button>` : ''}
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
    return item && item.type !== 'title';
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

  tradeItemSelect.innerHTML = character.inventory.length
    ? character.inventory.map((stack) => {
      const item = getItemDef(stack.id);
      if (!item) return '';
      const label = item.type === 'title' ? `${itemLabel(item)} (Title)` : itemLabel(item);
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
function sellTitle(stackId) {
  const item = getItemDef(stackId);
  if (!item || !item.rarity) return;
  const price = TITLE_SELL_PRICE_BY_RARITY[item.rarity];
  if (!confirm(`Sell 1x ${itemLabel(item)} for $${price.toLocaleString()}? This cannot be undone.`)) return;

  removeFromInventory(stackId, 1);
  character.cash = round2(character.cash + price);
  logTo(inventoryLog, `Sold ${itemLabel(item)} for $${price.toLocaleString()}.`, 'gain');
  save();
  renderAll();
}

function prestigeTitle(stackId) {
  const item = getItemDef(stackId);
  if (!item || !item.rarity) return;
  const { baseId, level } = parsePrestigeId(stackId);
  const threshold = level === 0 ? PRESTIGE_COST + 1 : PRESTIGE_COST;
  if (inventoryQty(stackId) < threshold) return;

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

