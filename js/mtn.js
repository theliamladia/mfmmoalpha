// ---------- Milos Trading Network ----------
// A real player-to-player marketplace, backed by a shared table on the server (mtn_listings) --
// not per-character storage, since a listing has to be visible to every player, not just its seller.
let mtnListingsCache = [];

async function refreshMtnListings() {
  try {
    const result = await apiMtnListings();
    mtnListingsCache = result.listings;
  } catch {
    // Best-effort -- keep showing the last known listings if the fetch fails.
  }
  buildMtnListingsGrid();
}

// ---------- UI ----------
const mtnItemPickerBtn = document.getElementById('mtnItemPickerBtn');
const mtnItemPickerPanel = document.getElementById('mtnItemPickerPanel');
const mtnItemPickerTabs = document.getElementById('mtnItemPickerTabs');
const mtnItemPickerList = document.getElementById('mtnItemPickerList');
const mtnQtyInput = document.getElementById('mtnQtyInput');
const mtnPriceInput = document.getElementById('mtnPriceInput');
const btnMtnList = document.getElementById('btnMtnList');
const mtnListingsGrid = document.getElementById('mtnListingsGrid');
const mtnHistoryList = document.getElementById('mtnHistoryList');
const mtnLog = document.getElementById('mtnLog');

const MTN_HISTORY_LABELS = { listed: 'Listed', bought: 'Bought', cancelled: 'Cancelled', sold: 'Sold' };

// ---------- Create Listing item picker ----------
// A custom dropdown (not a plain <select>, since a native select can't have subtabs) so items can
// be organized by category, then -- for titles specifically, where it actually means something --
// by crate and rarity, reusing the exact grouping helpers built for the Cosmetics tab
// (titleCrateGroupLabel/CRATE_GROUP_ORDER/compareTitleStacksByRarityThenPrestige in
// market.js/inventory.js).
const MTN_CATEGORY_DEFS = [
  { key: 'title', label: '🎖️ Titles', match: (item) => item.type === 'title' },
  { key: 'gun', label: '🔫 Guns', match: (item) => item.type === 'pistol' || item.type === 'rifle' },
  { key: 'melee', label: '🔪 Melee', match: (item) => item.type === 'melee' },
  { key: 'ammo', label: '💣 Ammo', match: (item) => item.type === 'ammo' },
  { key: 'gear', label: '🥋 Gear', match: (item) => item.type === 'gear' },
  { key: 'drug', label: '💊 Drugs', match: (item) => item.type === 'drug' },
];

let mtnSelectedItemId = null;
let mtnPickerActiveCategory = null;

function mtnInventoryStacksByCategory() {
  const buckets = {};
  MTN_CATEGORY_DEFS.forEach((c) => { buckets[c.key] = []; });
  character.inventory.forEach((stack) => {
    const item = getItemDef(stack.id);
    if (!item) return;
    const cat = MTN_CATEGORY_DEFS.find((c) => c.match(item));
    if (cat) buckets[cat.key].push(stack);
  });
  return buckets;
}

function mtnPickerRowHtml(stack) {
  const item = getItemDef(stack.id);
  const label = item.type === 'title' ? `${itemLabel(item)} (Title)` : itemLabel(item);
  return `<div class="mtn-item-picker-row" data-pick-item="${stack.id}"><span>${escapeHtml(label)}</span><span>x${stack.qty}</span></div>`;
}

function renderMtnItemPickerList(stacks) {
  if (mtnPickerActiveCategory === 'title') {
    const groups = new Map();
    const byRarity = compareTitleStacksByRarityThenPrestige((s) => s.id, (s) => getItemDef(s.id));
    stacks.forEach((stack) => {
      const label = titleCrateGroupLabel(getItemDef(stack.id));
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(stack);
    });
    groups.forEach((list) => list.sort(byRarity));

    mtnItemPickerList.innerHTML = CRATE_GROUP_ORDER
      .filter((label) => groups.has(label))
      .map((label) => `<p class="mtn-item-picker-crate-label">${label}</p>${groups.get(label).map(mtnPickerRowHtml).join('')}`)
      .join('');
  } else {
    const sorted = [...stacks].sort((a, b) => itemLabel(getItemDef(a.id)).localeCompare(itemLabel(getItemDef(b.id))));
    mtnItemPickerList.innerHTML = sorted.map(mtnPickerRowHtml).join('');
  }

  mtnItemPickerList.querySelectorAll('[data-pick-item]').forEach((row) => {
    row.addEventListener('click', () => {
      mtnSelectedItemId = row.dataset.pickItem;
      updateMtnItemPickerButtonLabel();
      mtnItemPickerPanel.classList.add('hidden');
    });
  });
}

function renderMtnItemPickerTabs() {
  const buckets = mtnInventoryStacksByCategory();
  const available = MTN_CATEGORY_DEFS.filter((c) => buckets[c.key].length > 0);

  if (!available.length) {
    mtnItemPickerTabs.innerHTML = '';
    mtnItemPickerList.innerHTML = '<p class="equip-picker-empty">Nothing to list.</p>';
    return;
  }
  if (!available.some((c) => c.key === mtnPickerActiveCategory)) mtnPickerActiveCategory = available[0].key;

  mtnItemPickerTabs.innerHTML = available.map((c) => `
    <button type="button" class="mtn-item-picker-tab${c.key === mtnPickerActiveCategory ? ' active' : ''}" data-cat="${c.key}">${c.label}</button>
  `).join('');
  mtnItemPickerTabs.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mtnPickerActiveCategory = btn.dataset.cat;
      renderMtnItemPickerTabs();
    });
  });

  renderMtnItemPickerList(buckets[mtnPickerActiveCategory]);
}

function updateMtnItemPickerButtonLabel() {
  const stack = mtnSelectedItemId ? character.inventory.find((s) => s.id === mtnSelectedItemId) : null;
  const item = stack ? getItemDef(mtnSelectedItemId) : null;
  if (!stack || !item) {
    mtnSelectedItemId = null;
    mtnItemPickerBtn.textContent = 'Choose an item…';
    return;
  }
  const label = item.type === 'title' ? `${itemLabel(item)} (Title)` : itemLabel(item);
  mtnItemPickerBtn.textContent = `${label} (x${stack.qty} owned)`;
}

// Called whenever character.inventory might have changed (after a listing, or any renderAll) --
// drops a selection that no longer exists and refreshes the open panel, if any.
function refreshMtnItemPicker() {
  if (!mtnItemPickerBtn) return;
  updateMtnItemPickerButtonLabel();
  if (!mtnItemPickerPanel.classList.contains('hidden')) renderMtnItemPickerTabs();
}

mtnItemPickerBtn && mtnItemPickerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = mtnItemPickerPanel.classList.contains('hidden');
  mtnItemPickerPanel.classList.toggle('hidden');
  if (willOpen) renderMtnItemPickerTabs();
});

document.addEventListener('click', (e) => {
  if (!mtnItemPickerPanel.classList.contains('hidden') && !mtnItemPickerPanel.contains(e.target) && e.target !== mtnItemPickerBtn) {
    mtnItemPickerPanel.classList.add('hidden');
  }
});

function buildMtnListingsGrid() {
  if (!mtnListingsGrid) return;
  const listings = mtnListingsCache;
  const myName = characterFullName();

  mtnListingsGrid.innerHTML = listings.length
    ? listings.map((listing) => {
      const item = getItemDef(listing.itemId);
      const name = item ? itemLabel(item) : listing.itemId;
      const total = round2(listing.pricePerUnit * listing.qty);
      const isMine = listing.sellerName === myName;
      const sellerNameHtml = styledNameHtmlById(listing.sellerTitleId, listing.sellerName);
      const buttonHtml = isMine
        ? `<button data-mtn-cancel="${listing.id}" class="secondary-btn">Cancel Listing</button>`
        : `<button data-mtn-buy="${listing.id}">Buy</button>`;

      // Titles get the full badge treatment (preview, name, how-obtained) since the plain id/name
      // alone doesn't tell a buyer anything -- physical items (guns/ammo/drugs/gear) keep the
      // simpler layout, since they have no badge or "how" flavor text to show.
      if (item && item.type === 'title') {
        return `
          <div class="hustle-card">
            <div class="title-preview">${titleBadgeMarkup(item)}</div>
            <p class="title-info-rank">${name}</p>
            ${item.how ? `<p class="title-info-how">${item.how}</p>` : ''}
            <p><b>$${total.toFixed(2)}</b></p>
            <p>Seller: ${sellerNameHtml}</p>
            ${buttonHtml}
          </div>
        `;
      }

      return `
        <div class="hustle-card">
          <h3>${name}</h3>
          <p>Qty ${listing.qty} &times; $${listing.pricePerUnit.toFixed(2)} = <b>$${total.toFixed(2)}</b><br>Seller: ${sellerNameHtml}</p>
          ${buttonHtml}
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No listings right now. Be the first to sell something.</p>';

  mtnListingsGrid.querySelectorAll('[data-mtn-buy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiMtnBuy(Number(btn.dataset.mtnBuy));
        character = result.character;
        mtnListingsCache = result.listings;
        logTo(mtnLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  mtnListingsGrid.querySelectorAll('[data-mtn-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiMtnCancel(Number(btn.dataset.mtnCancel));
        character = result.character;
        mtnListingsCache = result.listings;
        logTo(mtnLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

function buildMtnHistoryList() {
  if (!mtnHistoryList) return;
  if (character.mtnHistory.length === 0) {
    mtnHistoryList.innerHTML = '<p class="arrest-record-empty">No MTN activity yet.</p>';
    return;
  }
  mtnHistoryList.innerHTML = [...character.mtnHistory].reverse().slice(0, 30).map((entry) => {
    const item = getItemDef(entry.itemId);
    const name = item ? itemLabel(item) : entry.itemId;
    const counterparty = entry.counterpartyName ? ` (${entry.counterpartyName})` : '';
    return `
      <div class="arrest-record-row">
        <span>${MTN_HISTORY_LABELS[entry.type] || entry.type}: ${entry.qty}x ${name}${counterparty}</span>
        <span>${entry.totalPrice ? `$${entry.totalPrice.toFixed(2)}` : ''}</span>
        <span>${new Date(entry.ts).toLocaleString()}</span>
      </div>
    `;
  }).join('');
}

function buildMtnUI() {
  if (!mtnItemPickerBtn) return;
  refreshMtnItemPicker();
  buildMtnListingsGrid();
  buildMtnHistoryList();
}

btnMtnList.addEventListener('click', async () => {
  if (!mtnSelectedItemId) {
    alert('Choose an item to list.');
    return;
  }
  const itemId = mtnSelectedItemId;
  const qty = Math.max(1, Math.floor(+mtnQtyInput.value) || 1);
  const pricePerUnit = Math.max(0, +mtnPriceInput.value || 0);
  try {
    const result = await apiMtnList(itemId, qty, pricePerUnit);
    character = result.character;
    mtnListingsCache = result.listings;
    logTo(mtnLog, result.message, result.cls);
    mtnQtyInput.value = '1';
    mtnPriceInput.value = '';
    mtnSelectedItemId = null;
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
