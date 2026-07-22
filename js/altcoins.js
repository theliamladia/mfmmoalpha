// ---------- Altcoins (rug-pull system) ----------
const altcoinMintNameInput = document.getElementById('altcoinMintNameInput');
const btnAltcoinMint = document.getElementById('btnAltcoinMint');
const altcoinListGrid = document.getElementById('altcoinListGrid');
const altcoinHoldingsGrid = document.getElementById('altcoinHoldingsGrid');
const altcoinLog = document.getElementById('altcoinLog');

let altcoinListCache = [];
let altcoinMineCache = { holdings: [], myActiveMintId: null };

function altcoinCardHtml(coin) {
  const holding = altcoinMineCache.holdings.find((h) => h.altcoinId === coin.id);
  const soldOut = coin.remaining === 0;
  const actions = [];
  if (coin.status === 'active' && coin.remaining > 0) {
    actions.push(`
      <input type="number" min="1" max="${coin.remaining}" value="1" data-altcoin-qty="${coin.id}" style="width:70px">
      <button data-altcoin-buy="${coin.id}">Buy</button>
    `);
  }
  if (coin.status === 'active') {
    actions.push(`<button data-altcoin-dump="${coin.id}" class="secondary-btn">${soldOut ? 'Sell Now' : 'Rug'}</button>`);
  }
  if (coin.status === 'active' && soldOut) {
    actions.push(`<button data-altcoin-buyout="${coin.id}">Full Buyout</button>`);
  }
  return `
    <div class="hustle-card">
      <h3>🪙 ${escapeHtml(coin.name)}</h3>
      <p>By ${escapeHtml(coin.creatorName)} &mdash; ${coin.price.toFixed(4)} FC/coin &mdash; ${coin.remaining}/${coin.supply} left &mdash; ${coin.status}${holding ? ` &mdash; you hold ${holding.qty}` : ''}</p>
      ${actions.join('')}
    </div>
  `;
}

function renderAltcoins() {
  btnAltcoinMint.disabled = !!altcoinMineCache.myActiveMintId;

  altcoinListGrid.innerHTML = altcoinListCache.length
    ? altcoinListCache.map(altcoinCardHtml).join('')
    : '<p class="equip-picker-empty">No coins minted yet.</p>';

  altcoinHoldingsGrid.innerHTML = altcoinMineCache.holdings.length
    ? altcoinMineCache.holdings.map((h) => `
      <div class="hustle-card">
        <h3>🪙 ${escapeHtml(h.name)}</h3>
        <p>You hold ${h.qty} coin(s). Status: ${h.status}.</p>
      </div>
    `).join('')
    : '<p class="equip-picker-empty">You don\'t hold any coins right now.</p>';

  altcoinListGrid.querySelectorAll('button[data-altcoin-buy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const coinId = Number(btn.dataset.altcoinBuy);
      const qtyInput = altcoinListGrid.querySelector(`input[data-altcoin-qty="${coinId}"]`);
      const qty = Number(qtyInput.value);
      try {
        const result = await apiAltcoinBuy(coinId, qty);
        character = result.character;
        logTo(altcoinLog, result.message, result.cls);
        save();
        renderAll();
        await refreshAltcoins();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  altcoinListGrid.querySelectorAll('button[data-altcoin-dump]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const coinId = Number(btn.dataset.altcoinDump);
      if (!confirm('Drain the pool and crash this coin? This cannot be undone.')) return;
      try {
        const result = await apiAltcoinDump(coinId);
        character = result.character;
        logTo(altcoinLog, result.message, result.cls);
        save();
        renderAll();
        await refreshAltcoins();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  altcoinListGrid.querySelectorAll('button[data-altcoin-buyout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const coinId = Number(btn.dataset.altcoinBuyout);
      if (!confirm('Pay out every holder pro-rata and close this coin out fairly?')) return;
      try {
        const result = await apiAltcoinBuyout(coinId);
        character = result.character;
        logTo(altcoinLog, result.message, result.cls);
        save();
        renderAll();
        await refreshAltcoins();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

async function refreshAltcoins() {
  try {
    const [listResult, mineResult] = await Promise.all([apiAltcoinsList(), apiAltcoinsMine()]);
    altcoinListCache = listResult.coins;
    altcoinMineCache = mineResult;
    renderAltcoins();
  } catch {
    // Best-effort -- keep showing the last known state if the fetch fails.
  }
}

btnAltcoinMint.addEventListener('click', async () => {
  const name = altcoinMintNameInput.value.trim();
  try {
    const result = await apiAltcoinMint(name);
    character = result.character;
    logTo(altcoinLog, result.message, result.cls);
    altcoinMintNameInput.value = '';
    save();
    renderAll();
    await refreshAltcoins();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
