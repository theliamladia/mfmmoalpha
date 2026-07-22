// ---------- Floydcoin (crypto) ----------
const CRYPTO_UPGRADE_TIERS = {
  ram: [
    { addRate: 0.02, cost: 2000 },
    { addRate: 0.05, cost: 5000 },
    { addRate: 0.10, cost: 10000 },
  ],
  cpu: [
    { addRate: 0.05, cost: 5000 },
    { addRate: 0.12, cost: 12000 },
    { addRate: 0.25, cost: 25000 },
  ],
  gpu: [
    { addRate: 0.10, cost: 10000 },
    { addRate: 0.25, cost: 25000 },
    { addRate: 0.50, cost: 50000 },
  ],
};
const CRYPTO_BASE_RATE = 0.05;

const cryptoFcBalance = document.getElementById('cryptoFcBalance');
const cryptoUpgradeGrid = document.getElementById('cryptoUpgradeGrid');
const cryptoRateDesc = document.getElementById('cryptoRateDesc');
const btnCryptoCollect = document.getElementById('btnCryptoCollect');
const cryptoBuyInput = document.getElementById('cryptoBuyInput');
const btnCryptoBuy = document.getElementById('btnCryptoBuy');
const cryptoSellInput = document.getElementById('cryptoSellInput');
const btnCryptoSell = document.getElementById('btnCryptoSell');
const cryptoLog = document.getElementById('cryptoLog');

let cryptoStateCache = null;

function cryptoTrackRate(track, tier) {
  return CRYPTO_UPGRADE_TIERS[track].slice(0, tier).reduce((sum, t) => sum + t.addRate, 0);
}

function cryptoDailyRate(crypto) {
  return CRYPTO_BASE_RATE + cryptoTrackRate('ram', crypto.ramTier) + cryptoTrackRate('cpu', crypto.cpuTier) + cryptoTrackRate('gpu', crypto.gpuTier);
}

function renderCrypto() {
  if (!cryptoStateCache) return;
  const crypto = cryptoStateCache;
  cryptoFcBalance.textContent = crypto.fc.toFixed(4);
  cryptoRateDesc.textContent = `Mining at ${cryptoDailyRate(crypto).toFixed(2)} FC/day. Collect hourly.`;

  cryptoUpgradeGrid.innerHTML = ['ram', 'cpu', 'gpu'].map((track) => {
    const tierKey = `${track}Tier`;
    const tiers = CRYPTO_UPGRADE_TIERS[track];
    const tier = crypto[tierKey];
    const maxed = tier >= tiers.length;
    const next = !maxed ? tiers[tier] : null;
    return `
      <div class="hustle-card">
        <h3>${track.toUpperCase()}</h3>
        <p>Tier ${tier}/${tiers.length}${maxed ? ' (maxed)' : ` -- next: +${next.addRate} FC/day for $${next.cost.toLocaleString()}`}</p>
        <button data-crypto-upgrade="${track}" ${maxed ? 'disabled' : ''}>${maxed ? 'Maxed' : 'Upgrade'}</button>
      </div>
    `;
  }).join('');

  cryptoUpgradeGrid.querySelectorAll('button[data-crypto-upgrade]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiCryptoUpgrade(btn.dataset.cryptoUpgrade);
        character = result.character;
        logTo(cryptoLog, result.message, result.cls);
        save();
        renderAll();
        await refreshCrypto();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

async function refreshCrypto() {
  try {
    const result = await apiCryptoState();
    cryptoStateCache = result.crypto;
    renderCrypto();
  } catch {
    // Best-effort -- keep showing the last known state if the fetch fails.
  }
}

btnCryptoCollect.addEventListener('click', async () => {
  try {
    const result = await apiCryptoCollect();
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnCryptoBuy.addEventListener('click', async () => {
  const amount = Number(cryptoBuyInput.value);
  try {
    const result = await apiCryptoBuy(amount);
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnCryptoSell.addEventListener('click', async () => {
  const amount = Number(cryptoSellInput.value);
  try {
    const result = await apiCryptoSell(amount);
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
