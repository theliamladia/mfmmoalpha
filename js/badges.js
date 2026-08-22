// ---------- Balaclava Badges ----------
// Entirely client-trust, same level as titles/crate spins/Morals Center -- no server route, the
// character.inventory stack mutations here are just posted up on the next /character/sync like
// everything else in this economy.
const btnBuyBadgeCrate = document.getElementById('btnBuyBadgeCrate');
const btnBuyBadgeCrateBanner = document.getElementById('btnBuyBadgeCrateBanner');
const badgeCrateQty = document.getElementById('badgeCrateQty');
const badgeCrateQtyBanner = document.getElementById('badgeCrateQtyBanner');
const btnViewBadgesInvcat = document.getElementById('btnViewBadgesInvcat');
const badgesGrid = document.getElementById('badgesGrid');

// Same 1-10 per action cap the crate spin inputs use -- the badge crate is a guaranteed Bronze
// rather than a roll, so this is purely "stop me clicking Buy thirty times", but a shared ceiling
// keeps every multi-buy in the game behaving the same way.
const BADGE_CRATE_MAX_PER_BUY = 10;

function readBadgeQty(input, max) {
  const n = Math.floor(+(input && input.value)) || 1;
  return Math.max(1, Math.min(n, max));
}

function buyBadgeCrate(qtyInput) {
  const qty = readBadgeQty(qtyInput, BADGE_CRATE_MAX_PER_BUY);
  const total = round2(BALACLAVA_BADGE_CRATE_COST * qty);
  if (character.cash < total) { alert(`Not enough Floydbucks -- ${qty}x costs $${total.toLocaleString()}.`); return; }
  character.cash = round2(character.cash - total);
  addToInventory('badgeBronze', qty);
  logTo(inventoryLog, `Opened ${qty}x Balaclava Badge Crate for $${total.toLocaleString()}: ${qty}x Bronze Balaclava!`, 'gain');
  save();
  renderAll();
}

btnBuyBadgeCrate.addEventListener('click', () => buyBadgeCrate(badgeCrateQty));
if (btnBuyBadgeCrateBanner) btnBuyBadgeCrateBanner.addEventListener('click', () => buyBadgeCrate(badgeCrateQtyBanner));

// Jumps straight from the Cosmetixxx banner to the Inventory > Badges sub-tab -- same tab-click
// idiom as every other cross-link button in this codebase (e.g. btnGoToCoinflip).
if (btnViewBadgesInvcat) {
  btnViewBadgesInvcat.addEventListener('click', () => {
    document.querySelector('[data-inv="items"]').click();
    document.querySelector('[data-invcat="badges"]').click();
  });
}

// `times` is how many merges to do at once -- 5 Bronze -> 1 Silver, done N times in one action and
// one confirm. Clamped to what the stack can actually pay for, so a stale qty input (the grid
// re-renders on every save) can never consume more badges than are there.
function rankUpBadge(fromId, times = 1) {
  const idx = BADGE_RANK_CHAIN.indexOf(fromId);
  if (idx === -1 || idx === BADGE_RANK_CHAIN.length - 1) return; // Grandmaster ranks up via tradeGrandmasterForGem instead
  const maxTimes = Math.floor(inventoryQty(fromId) / BADGE_RANK_UP_COST);
  if (maxTimes < 1) return;
  const count = Math.max(1, Math.min(Math.floor(times) || 1, maxTimes));
  const nextId = BADGE_RANK_CHAIN[idx + 1];
  const fromDef = getBadgeDef(fromId);
  const nextDef = getBadgeDef(nextId);
  const spend = BADGE_RANK_UP_COST * count;
  if (!confirm(`Rank up ${count}x? This consumes ${spend}x ${fromDef.name} and grants ${count}x ${nextDef.name}. This cannot be undone.`)) return;
  removeFromInventory(fromId, spend);
  addToInventory(nextId, count);
  logTo(inventoryLog, `Ranked up into ${count}x ${nextDef.name}!`, 'gain');
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
  if (!character.badges) character.badges = { equipped: null };
  character.badges.equipped = character.badges.equipped === badgeId ? null : badgeId;
  save();
  renderAll();
}

function renderBadgesGrid() {
  if (!badgesGrid) return;
  if (!character.badges) character.badges = { equipped: null };
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
      // The qty input only appears once more than one merge is actually affordable -- a lone
      // "1/1" spinner on a stack of 5 is noise. It defaults to 1 rather than to the max: merging
      // is irreversible, and the duplicates are somebody's stock for a future rank.
      const maxTimes = Math.floor(stack.qty / BADGE_RANK_UP_COST);
      actionHtml = `
        <div class="badge-rankup-row">
          ${maxTimes > 1 ? `<input type="number" class="crate-qty-input" data-rankup-qty="${stack.id}" min="1" max="${maxTimes}" value="1" title="How many to merge">` : ''}
          <button data-rankup="${stack.id}" ${maxTimes >= 1 ? '' : 'disabled'}>Rank Up (${stack.qty}/${BADGE_RANK_UP_COST})</button>
        </div>
      `;
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
    btn.addEventListener('click', () => {
      const qtyInput = badgesGrid.querySelector(`[data-rankup-qty="${btn.dataset.rankup}"]`);
      rankUpBadge(btn.dataset.rankup, qtyInput ? +qtyInput.value : 1);
    });
  });
  badgesGrid.querySelectorAll('[data-trade-gem]').forEach((btn) => {
    btn.addEventListener('click', () => tradeGrandmasterForGem(btn.dataset.tradeGem));
  });
  const btnTradeGemsForUnits = document.getElementById('btnTradeGemsForUnits');
  if (btnTradeGemsForUnits) btnTradeGemsForUnits.addEventListener('click', tradeGemsForUnits);
}
