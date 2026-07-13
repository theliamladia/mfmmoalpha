// ---------- Milos Trading Network ----------
// A player-to-player marketplace. The "market" below is deliberately kept separate from the
// character save (its own localStorage key, shape matches a DB table: id/sellerName/itemId/qty/
// price) so this whole file can be ported to multiplayer later by swapping loadMarketListings()/
// saveMarketListings() for real API calls -- nothing else in this file needs to change.
const MARKET_STORAGE_KEY = 'specialUnitsGui.market.v1';

function loadMarketListings() {
  const raw = localStorage.getItem(MARKET_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveMarketListings(listings) {
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(listings));
}

function nextListingId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function doCreateListing(itemId, qty, pricePerUnit) {
  if (!itemId || !(qty > 0) || !(pricePerUnit > 0)) return { ok: false, reason: 'Enter a valid item, quantity, and price.' };
  if (inventoryQty(itemId) < qty) return { ok: false, reason: "You don't have that many to list." };
  const item = getItemDef(itemId);
  if (!item) return { ok: false };

  removeFromInventory(itemId, qty);
  const listings = loadMarketListings();
  listings.push({
    id: nextListingId(),
    sellerName: characterFullName(),
    itemId,
    qty,
    pricePerUnit: round2(pricePerUnit),
    listedAt: Date.now(),
  });
  saveMarketListings(listings);

  character.mtnHistory.push({ type: 'listed', itemId, qty, totalPrice: round2(pricePerUnit * qty), ts: Date.now(), counterpartyName: null });
  return { ok: true, message: `Listed ${qty}x ${item.name} for $${(pricePerUnit * qty).toFixed(2)}.`, cls: 'gain' };
}

function doCancelListing(listingId) {
  const listings = loadMarketListings();
  const idx = listings.findIndex((l) => l.id === listingId);
  if (idx === -1) return { ok: false, reason: 'That listing is no longer available.' };
  const listing = listings[idx];
  if (listing.sellerName !== characterFullName()) return { ok: false, reason: 'You can only cancel your own listings.' };

  listings.splice(idx, 1);
  saveMarketListings(listings);
  addToInventory(listing.itemId, listing.qty);

  const item = getItemDef(listing.itemId);
  character.mtnHistory.push({ type: 'cancelled', itemId: listing.itemId, qty: listing.qty, totalPrice: 0, ts: Date.now(), counterpartyName: null });
  return { ok: true, message: `Cancelled listing: ${listing.qty}x ${item ? item.name : listing.itemId} returned to your Inventory.`, cls: '' };
}

function doBuyListing(listingId) {
  const listings = loadMarketListings();
  const idx = listings.findIndex((l) => l.id === listingId);
  if (idx === -1) return { ok: false, reason: 'That listing is no longer available.' };
  const listing = listings[idx];
  const total = round2(listing.pricePerUnit * listing.qty);
  if (character.cash < total) return { ok: false, reason: 'Not enough Floydbucks.' };

  listings.splice(idx, 1);
  saveMarketListings(listings);

  character.cash = round2(character.cash - total);
  addToInventory(listing.itemId, listing.qty);

  // In multiplayer this would credit the seller's own account. Right now this browser only has
  // one save, so a self-purchase nets back to zero instead of paying yourself.
  if (listing.sellerName === characterFullName()) {
    character.cash = round2(character.cash + total);
  }

  const item = getItemDef(listing.itemId);
  character.mtnHistory.push({ type: 'bought', itemId: listing.itemId, qty: listing.qty, totalPrice: total, ts: Date.now(), counterpartyName: listing.sellerName });
  return { ok: true, message: `Bought ${listing.qty}x ${item ? item.name : listing.itemId} for $${total.toFixed(2)}.`, cls: 'gain' };
}

// ---------- UI ----------
const mtnItemSelect = document.getElementById('mtnItemSelect');
const mtnQtyInput = document.getElementById('mtnQtyInput');
const mtnPriceInput = document.getElementById('mtnPriceInput');
const btnMtnList = document.getElementById('btnMtnList');
const mtnListingsGrid = document.getElementById('mtnListingsGrid');
const mtnHistoryList = document.getElementById('mtnHistoryList');
const mtnLog = document.getElementById('mtnLog');

const MTN_HISTORY_LABELS = { listed: 'Listed', bought: 'Bought', cancelled: 'Cancelled' };

function buildMtnItemSelect() {
  if (!mtnItemSelect) return;
  const prevValue = mtnItemSelect.value;
  mtnItemSelect.innerHTML = character.inventory.length
    ? character.inventory.map((stack) => {
      const item = getItemDef(stack.id);
      if (!item) return '';
      const label = item.type === 'title' ? `${item.name} (Title)` : item.name;
      return `<option value="${stack.id}">${label} (x${stack.qty} owned)</option>`;
    }).join('')
    : '<option value="">Nothing to list</option>';
  if (character.inventory.some((s) => s.id === prevValue)) mtnItemSelect.value = prevValue;
}

function buildMtnListingsGrid() {
  if (!mtnListingsGrid) return;
  const listings = loadMarketListings();
  const myName = characterFullName();

  mtnListingsGrid.innerHTML = listings.length
    ? listings.map((listing) => {
      const item = getItemDef(listing.itemId);
      const name = item ? item.name : listing.itemId;
      const total = round2(listing.pricePerUnit * listing.qty);
      const isMine = listing.sellerName === myName;
      return `
        <div class="hustle-card">
          <h3>${name}</h3>
          <p>Qty ${listing.qty} &times; $${listing.pricePerUnit.toFixed(2)} = <b>$${total.toFixed(2)}</b><br>Seller: ${listing.sellerName}</p>
          ${isMine
            ? `<button data-mtn-cancel="${listing.id}" class="secondary-btn">Cancel Listing</button>`
            : `<button data-mtn-buy="${listing.id}">Buy</button>`}
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No listings right now. Be the first to sell something.</p>';

  mtnListingsGrid.querySelectorAll('[data-mtn-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = doBuyListing(Number(btn.dataset.mtnBuy));
      if (!result.ok) { alert(result.reason); return; }
      logTo(mtnLog, result.message, result.cls);
      save();
      renderAll();
    });
  });

  mtnListingsGrid.querySelectorAll('[data-mtn-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = doCancelListing(Number(btn.dataset.mtnCancel));
      if (!result.ok) { alert(result.reason); return; }
      logTo(mtnLog, result.message, result.cls);
      save();
      renderAll();
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
    const name = item ? item.name : entry.itemId;
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
  if (!mtnItemSelect) return;
  buildMtnItemSelect();
  buildMtnListingsGrid();
  buildMtnHistoryList();
}

btnMtnList.addEventListener('click', () => {
  const itemId = mtnItemSelect.value;
  const qty = Math.max(1, Math.floor(+mtnQtyInput.value) || 1);
  const pricePerUnit = Math.max(0, +mtnPriceInput.value || 0);
  const result = doCreateListing(itemId, qty, pricePerUnit);
  if (!result.ok) { alert(result.reason); return; }
  logTo(mtnLog, result.message, result.cls);
  mtnQtyInput.value = '1';
  mtnPriceInput.value = '';
  save();
  renderAll();
});
