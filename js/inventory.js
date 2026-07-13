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

  const titleStacks = character.inventory.filter((stack) => {
    const item = getItemDef(stack.id);
    return item && item.type === 'title';
  });
  cosmeticsGrid.innerHTML = titleStacks.length
    ? titleStacks.map((stack) => {
      const item = getItemDef(stack.id);
      return `
        <div class="hustle-card">
          <h3>${item.name}</h3>
          <p class="item-subheading">Title</p>
          <div class="title-preview">${titleBadgeMarkup(item)}</div>
          <p>&times; ${stack.qty}</p>
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No titles yet. Win them from a crate in Cosmetixxx.</p>';

  tradeItemSelect.innerHTML = character.inventory.length
    ? character.inventory.map((stack) => {
      const item = getItemDef(stack.id);
      if (!item) return '';
      const label = item.type === 'title' ? `${item.name} (Title)` : item.name;
      return `<option value="${stack.id}">${label} (x${stack.qty})</option>`;
    }).join('')
    : '<option value="">No items to trade</option>';
}

btnTradeSend.addEventListener('click', () => {
  const itemId = tradeItemSelect.value;
  const username = tradeUsernameInput.value.trim();
  if (!itemId || !username) return;
  const item = getItemDef(itemId);
  logTo(inventoryLog, `Trade offer for ${item ? item.name : itemId} sent to ${username}. They'll see it once multiplayer is live.`, 'gain');
  tradeUsernameInput.value = '';
});

function slotAcceptsItem(slot, item) {
  if (slot === 'holsterL' || slot === 'holsterR') return item.type === 'pistol';
  if (slot === 'openCarry') return item.type === 'pistol' || item.type === 'rifle';
  if (slot === 'melee') return item.type === 'melee';
  if (slot === 'helmet' || slot === 'chest' || slot === 'pants' || slot === 'feet') return item.type === 'gear' && item.slot === slot;
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

