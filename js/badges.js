// ---------- Balaclava Badges ----------
// Entirely client-trust, same level as titles/crate spins/Morals Center -- no server route, the
// character.inventory stack mutations here are just posted up on the next /character/sync like
// everything else in this economy.
const btnBuyBadgeCrate = document.getElementById('btnBuyBadgeCrate');
const btnBuyBadgeCrateBanner = document.getElementById('btnBuyBadgeCrateBanner');
const btnViewBadgesInvcat = document.getElementById('btnViewBadgesInvcat');
const badgesGrid = document.getElementById('badgesGrid');

function buyBadgeCrate() {
  if (character.cash < BALACLAVA_BADGE_CRATE_COST) { alert('Not enough Floydbucks.'); return; }
  character.cash = round2(character.cash - BALACLAVA_BADGE_CRATE_COST);
  addToInventory('badgeBronze', 1);
  logTo(inventoryLog, 'Opened a Balaclava Badge Crate: 1x Bronze Balaclava!', 'gain');
  save();
  renderAll();
}

btnBuyBadgeCrate.addEventListener('click', buyBadgeCrate);
if (btnBuyBadgeCrateBanner) btnBuyBadgeCrateBanner.addEventListener('click', buyBadgeCrate);

// Jumps straight from the Cosmetixxx banner to the Inventory > Badges sub-tab -- same tab-click
// idiom as every other cross-link button in this codebase (e.g. btnGoToCoinflip).
if (btnViewBadgesInvcat) {
  btnViewBadgesInvcat.addEventListener('click', () => {
    document.querySelector('[data-inv="items"]').click();
    document.querySelector('[data-invcat="badges"]').click();
  });
}

function rankUpBadge(fromId) {
  const idx = BADGE_RANK_CHAIN.indexOf(fromId);
  if (idx === -1 || idx === BADGE_RANK_CHAIN.length - 1) return; // Grandmaster ranks up via tradeGrandmasterForGem instead
  if (inventoryQty(fromId) < BADGE_RANK_UP_COST) return;
  const nextId = BADGE_RANK_CHAIN[idx + 1];
  const fromDef = getBadgeDef(fromId);
  const nextDef = getBadgeDef(nextId);
  if (!confirm(`Rank up? This consumes ${BADGE_RANK_UP_COST}x ${fromDef.name} and grants 1x ${nextDef.name}. This cannot be undone.`)) return;
  removeFromInventory(fromId, BADGE_RANK_UP_COST);
  addToInventory(nextId, 1);
  logTo(inventoryLog, `Ranked up into ${nextDef.name}!`, 'gain');
  save();
  renderAll();
}

function tradeGrandmasterForGem(gemId) {
  if (!BADGE_GEM_IDS.includes(gemId)) return;
  if (inventoryQty('badgeGrandmaster') < 1) return;
  const gemDef = getBadgeDef(gemId);
  if (!confirm(`Trade your Grandmaster Balaclava for 1x ${gemDef.name}? This cannot be undone.`)) return;
  removeFromInventory('badgeGrandmaster', 1);
  addToInventory(gemId, 1);
  logTo(inventoryLog, `Traded up into ${gemDef.name}!`, 'gain');
  save();
  renderAll();
}

function tradeGemsForUnits() {
  if (BADGE_GEM_IDS.some((id) => inventoryQty(id) < 1)) return;
  if (!confirm('Trade all 3 Gem Balaclavas (Ruby, Sapphire, Emerald) for 1x UNITS Balaclava? This cannot be undone.')) return;
  BADGE_GEM_IDS.forEach((id) => removeFromInventory(id, 1));
  addToInventory(BADGE_UNITS_ID, 1);
  logTo(inventoryLog, 'Traded up into the UNITS Balaclava!', 'gain');
  save();
  renderAll();
}

function equipBadge(badgeId) {
  character.badges.equipped = character.badges.equipped === badgeId ? null : badgeId;
  save();
  renderAll();
}

function renderBadgesGrid() {
  if (!badgesGrid) return;
  const ownedStacks = character.inventory.filter((stack) => stack.qty > 0 && getBadgeDef(stack.id));
  if (!ownedStacks.length) {
    badgesGrid.innerHTML = '<p class="equip-picker-empty">No badges yet. Buy a Balaclava Badge Crate above.</p>';
    return;
  }

  const hasAllGems = BADGE_GEM_IDS.every((id) => inventoryQty(id) > 0);

  badgesGrid.innerHTML = ownedStacks.map((stack) => {
    const def = getBadgeDef(stack.id);
    const equipped = character.badges.equipped === stack.id;
    const chainIdx = BADGE_RANK_CHAIN.indexOf(stack.id);
    let actionHtml = '';
    if (chainIdx !== -1 && chainIdx < BADGE_RANK_CHAIN.length - 1) {
      const canRankUp = stack.qty >= BADGE_RANK_UP_COST;
      actionHtml = `<button data-rankup="${stack.id}" ${canRankUp ? '' : 'disabled'}>Rank Up (${stack.qty}/${BADGE_RANK_UP_COST})</button>`;
    } else if (stack.id === 'badgeGrandmaster') {
      actionHtml = `
        <div class="admin-button-row">
          <button data-trade-gem="badgeRuby">Trade for Ruby</button>
          <button data-trade-gem="badgeSapphire">Trade for Sapphire</button>
          <button data-trade-gem="badgeEmerald">Trade for Emerald</button>
        </div>
      `;
    } else if (BADGE_GEM_IDS.includes(stack.id) && hasAllGems) {
      actionHtml = '<button id="btnTradeGemsForUnits">Trade All 3 Gems for UNITS</button>';
    }
    return `
      <div class="hustle-card">
        <div class="title-preview"><span class="badge-chip-large ${def.cssClass}"></span></div>
        <h3>${def.name} &times; ${stack.qty}</h3>
        <button data-equip-badge="${stack.id}" class="${equipped ? 'active-hustle' : ''}">${equipped ? 'Equipped' : 'Equip'}</button>
        ${actionHtml}
      </div>
    `;
  }).join('');

  badgesGrid.querySelectorAll('[data-equip-badge]').forEach((btn) => {
    btn.addEventListener('click', () => equipBadge(btn.dataset.equipBadge));
  });
  badgesGrid.querySelectorAll('[data-rankup]').forEach((btn) => {
    btn.addEventListener('click', () => rankUpBadge(btn.dataset.rankup));
  });
  badgesGrid.querySelectorAll('[data-trade-gem]').forEach((btn) => {
    btn.addEventListener('click', () => tradeGrandmasterForGem(btn.dataset.tradeGem));
  });
  const btnTradeGemsForUnits = document.getElementById('btnTradeGemsForUnits');
  if (btnTradeGemsForUnits) btnTradeGemsForUnits.addEventListener('click', tradeGemsForUnits);
}
