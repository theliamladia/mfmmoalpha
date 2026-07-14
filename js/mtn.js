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
const mtnItemSelect = document.getElementById('mtnItemSelect');
const mtnQtyInput = document.getElementById('mtnQtyInput');
const mtnPriceInput = document.getElementById('mtnPriceInput');
const btnMtnList = document.getElementById('btnMtnList');
const mtnListingsGrid = document.getElementById('mtnListingsGrid');
const mtnHistoryList = document.getElementById('mtnHistoryList');
const mtnLog = document.getElementById('mtnLog');

const MTN_HISTORY_LABELS = { listed: 'Listed', bought: 'Bought', cancelled: 'Cancelled', sold: 'Sold' };

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
  const listings = mtnListingsCache;
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

btnMtnList.addEventListener('click', async () => {
  const itemId = mtnItemSelect.value;
  const qty = Math.max(1, Math.floor(+mtnQtyInput.value) || 1);
  const pricePerUnit = Math.max(0, +mtnPriceInput.value || 0);
  try {
    const result = await apiMtnList(itemId, qty, pricePerUnit);
    character = result.character;
    mtnListingsCache = result.listings;
    logTo(mtnLog, result.message, result.cls);
    mtnQtyInput.value = '1';
    mtnPriceInput.value = '';
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
