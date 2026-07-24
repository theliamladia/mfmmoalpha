// ---------- Floydcoin (crypto) ----------
// Must match CRYPTO_RIG_TIERS in mfmmoserver/gameLogic.js -- display-only mirror, the server is
// authoritative on the actual rate/cost.
const CRYPTO_RIG_TIERS = [
  { name: 'MyShitter900', rate: 0.05, cost: 0 },
  { name: 'iFminer', rate: 0.15, cost: 5000 },
  { name: 'iFminer360', rate: 0.30, cost: 12000 },
  { name: 'iFminer720', rate: 0.50, cost: 25000 },
  { name: 'iFminerX', rate: 0.80, cost: 45000 },
  { name: 'DBL Azeroth Mining Rig', rate: 1.20, cost: 75000 },
  { name: 'DBL Azeroth Mining Array', rate: 1.75, cost: 120000 },
  { name: 'DBL Blackhawk Mining Array', rate: 2.50, cost: 180000 },
  { name: 'KRG White//White Configured Mining Solution', rate: 3.50, cost: 260000 },
  { name: 'UNT Prototype Quantum Miner', rate: 5.00, cost: 400000 },
];
const FC_PRICE = 10000; // must match FC_START_PRICE in mfmmoserver/gameLogic.js

// Must match COLD_STORAGE_BASE_CAP/COLD_STORAGE_UPGRADE_TIERS in mfmmoserver/gameLogic.js --
// display-only mirror, the server is authoritative on the actual cap/cost.
const COLD_STORAGE_BASE_CAP = 10;
const COLD_STORAGE_UPGRADE_TIERS = [
  { addCap: 15, cost: 5000 },
  { addCap: 25, cost: 12000 },
  { addCap: 50, cost: 25000 },
];

function coldStorageCapacity(coldStorage) {
  return COLD_STORAGE_BASE_CAP + COLD_STORAGE_UPGRADE_TIERS.slice(0, coldStorage.tier).reduce((sum, t) => sum + t.addCap, 0);
}

const cryptoFcBalance = document.getElementById('cryptoFcBalance');
const cryptoRigTitle = document.getElementById('cryptoRigTitle');
const cryptoUpgradeGrid = document.getElementById('cryptoUpgradeGrid');
const btnCryptoPrestige = document.getElementById('btnCryptoPrestige');
const cryptoRateDesc = document.getElementById('cryptoRateDesc');
const btnCryptoCollect = document.getElementById('btnCryptoCollect');
const cryptoBuyInput = document.getElementById('cryptoBuyInput');
const btnCryptoBuy = document.getElementById('btnCryptoBuy');
const cryptoSellInput = document.getElementById('cryptoSellInput');
const btnCryptoSell = document.getElementById('btnCryptoSell');
const btnCryptoBuyMax = document.getElementById('btnCryptoBuyMax');
const btnCryptoSellAll = document.getElementById('btnCryptoSellAll');
const cryptoLog = document.getElementById('cryptoLog');

const cryptoColdStorageDesc = document.getElementById('cryptoColdStorageDesc');
const cryptoColdStorageDepositInput = document.getElementById('cryptoColdStorageDepositInput');
const btnCryptoColdStorageDeposit = document.getElementById('btnCryptoColdStorageDeposit');
const btnCryptoColdStorageDepositAll = document.getElementById('btnCryptoColdStorageDepositAll');
const cryptoColdStorageWithdrawInput = document.getElementById('cryptoColdStorageWithdrawInput');
const btnCryptoColdStorageWithdraw = document.getElementById('btnCryptoColdStorageWithdraw');
const btnCryptoColdStorageWithdrawAll = document.getElementById('btnCryptoColdStorageWithdrawAll');
const btnCryptoColdStorageUpgrade = document.getElementById('btnCryptoColdStorageUpgrade');

let cryptoStateCache = null;

function cryptoPrestigeRateMultiplier(prestigeLevel) {
  return Math.pow(1.5, prestigeLevel);
}

function cryptoPrestigeCostMultiplier(prestigeLevel) {
  return Math.pow(2, prestigeLevel);
}

function cryptoDailyRate(crypto) {
  return CRYPTO_RIG_TIERS[crypto.rigTier].rate * cryptoPrestigeRateMultiplier(crypto.prestigeLevel);
}

function renderCrypto() {
  if (!cryptoStateCache) return;
  const crypto = cryptoStateCache;
  cryptoFcBalance.textContent = crypto.fc.toFixed(4);
  cryptoRateDesc.textContent = `Mining at ${cryptoDailyRate(crypto).toFixed(2)} FC/day. Collect hourly.`;

  const currentRig = CRYPTO_RIG_TIERS[crypto.rigTier];
  const hourlyRate = cryptoDailyRate(crypto) / 24;
  cryptoRigTitle.textContent = `${currentRig.name} -- ${hourlyRate.toFixed(4)} FC/hr`
    + (crypto.prestigeLevel > 0 ? ` (Prestige ${crypto.prestigeLevel})` : '');

  const coldStorage = crypto.coldStorage || { fc: 0, tier: 0 };
  const capacity = coldStorageCapacity(coldStorage);
  const upgradeTiers = COLD_STORAGE_UPGRADE_TIERS;
  const maxed = coldStorage.tier >= upgradeTiers.length;
  const next = !maxed ? upgradeTiers[coldStorage.tier] : null;
  cryptoColdStorageDesc.textContent = `Safe from robbery wallet-drains -- ${coldStorage.fc.toFixed(4)}/${capacity} FC stored.`
    + (maxed ? ' Capacity maxed.' : ` Next upgrade: +${next.addCap} FC capacity for $${next.cost.toLocaleString()}.`);
  btnCryptoColdStorageUpgrade.disabled = maxed;
  btnCryptoColdStorageUpgrade.textContent = maxed ? 'Capacity Maxed' : 'Upgrade Capacity';

  const maxTier = CRYPTO_RIG_TIERS.length - 1;
  const rigMaxed = crypto.rigTier >= maxTier;
  const nextRig = !rigMaxed ? CRYPTO_RIG_TIERS[crypto.rigTier + 1] : null;
  const nextRigCost = nextRig ? Math.round(nextRig.cost * cryptoPrestigeCostMultiplier(crypto.prestigeLevel)) : null;

  cryptoUpgradeGrid.innerHTML = `
    <div class="hustle-card">
      <h3>🖥️ ${escapeHtml(currentRig.name)}</h3>
      <p>Tier ${crypto.rigTier}/${maxTier}${rigMaxed ? ' (maxed)' : ` -- next: ${escapeHtml(nextRig.name)} for $${nextRigCost.toLocaleString()}`}</p>
      <button id="btnCryptoRigUpgrade" ${rigMaxed ? 'disabled' : ''}>${rigMaxed ? 'Maxed' : 'Upgrade'}</button>
    </div>
  `;

  document.getElementById('btnCryptoRigUpgrade').addEventListener('click', async () => {
    try {
      const result = await apiCryptoUpgrade();
      character = result.character;
      logTo(cryptoLog, result.message, result.cls);
      save();
      renderAll();
      await refreshCrypto();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });

  btnCryptoPrestige.disabled = !rigMaxed;
  btnCryptoPrestige.textContent = rigMaxed
    ? '🌟 Prestige (+50% rate, +100% upgrade costs)'
    : `🌟 Prestige (max out ${CRYPTO_RIG_TIERS[maxTier].name} first)`;
}

btnCryptoPrestige.addEventListener('click', async () => {
  if (btnCryptoPrestige.disabled) return;
  if (!confirm('Prestige your rig? This resets you back to MyShitter900, but mining rate goes up 50% and upgrade costs go up 100%, permanently.')) return;
  try {
    const result = await apiCryptoPrestige();
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

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

async function runCryptoBuy(amount) {
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
}

async function runCryptoSell(amount) {
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
}

btnCryptoBuy.addEventListener('click', () => runCryptoBuy(Number(cryptoBuyInput.value)));

btnCryptoSell.addEventListener('click', () => runCryptoSell(Number(cryptoSellInput.value)));

btnCryptoBuyMax.addEventListener('click', () => {
  const maxAmount = Math.floor((character.cash / FC_PRICE) * 10000) / 10000;
  if (maxAmount <= 0) { alert('Not enough Floydbucks.'); return; }
  runCryptoBuy(maxAmount);
});

btnCryptoSellAll.addEventListener('click', () => {
  const allFc = cryptoStateCache ? cryptoStateCache.fc : 0;
  if (allFc <= 0) { alert("You don't have any FC to sell."); return; }
  runCryptoSell(allFc);
});

async function runColdStorageDeposit(amount) {
  try {
    const result = await apiCryptoColdStorageDeposit(amount);
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

async function runColdStorageWithdraw(amount) {
  try {
    const result = await apiCryptoColdStorageWithdraw(amount);
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

btnCryptoColdStorageDeposit.addEventListener('click', () => {
  runColdStorageDeposit(Number(cryptoColdStorageDepositInput.value));
});

btnCryptoColdStorageDepositAll.addEventListener('click', () => {
  if (!cryptoStateCache) return;
  const coldStorage = cryptoStateCache.coldStorage || { fc: 0, tier: 0 };
  const room = Math.round((coldStorageCapacity(coldStorage) - coldStorage.fc) * 10000) / 10000;
  const amount = Math.min(cryptoStateCache.fc, room);
  if (amount <= 0) {
    alert(room <= 0 ? 'Cold Storage is already full.' : "You don't have any FC in your hot wallet to deposit.");
    return;
  }
  runColdStorageDeposit(amount);
});

btnCryptoColdStorageWithdraw.addEventListener('click', () => {
  runColdStorageWithdraw(Number(cryptoColdStorageWithdrawInput.value));
});

btnCryptoColdStorageWithdrawAll.addEventListener('click', () => {
  const allColdFc = cryptoStateCache && cryptoStateCache.coldStorage ? cryptoStateCache.coldStorage.fc : 0;
  if (allColdFc <= 0) {
    alert("You don't have any FC in Cold Storage to withdraw.");
    return;
  }
  runColdStorageWithdraw(allColdFc);
});

btnCryptoColdStorageUpgrade.addEventListener('click', async () => {
  try {
    const result = await apiCryptoColdStorageUpgrade();
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

// ---------- Admin: All Floydcoin Balances ----------
// Same UI-only convenience pattern as js/admin.js's btnAdmin -- always visible, real gate is
// server-side (requireAdminPassword on /admin/crypto-balances).
const CRYPTO_ADMIN_USERNAME = 'mrleems';
const btnViewCryptoBalances = document.getElementById('btnViewCryptoBalances');
const cryptoBalancesModal = document.getElementById('cryptoBalancesModal');
const cryptoBalancesList = document.getElementById('cryptoBalancesList');
const btnCryptoBalancesClose = document.getElementById('btnCryptoBalancesClose');
const btnCryptoBalancesCloseX = document.getElementById('btnCryptoBalancesCloseX');

async function refreshCryptoBalancesModal() {
  try {
    const result = await apiAdminCryptoBalances();
    cryptoBalancesList.innerHTML = result.balances.length
      ? result.balances.map((b) => `
        <div class="stock-transaction-row">
          <span><b>${escapeHtml(b.name)}</b> (${escapeHtml(b.username)})</span>
          <span>Hot wallet: ${b.hotWalletFc.toFixed(4)} FC &mdash; Cold Storage: ${b.coldStorageFc.toFixed(4)} FC (tier ${b.coldStorageTier})</span>
          <span>Total: ${b.totalFc.toFixed(4)} FC</span>
        </div>
      `).join('')
      : '<p class="equip-picker-empty">No players yet.</p>';
  } catch (err) {
    cryptoBalancesList.innerHTML = `<p class="equip-picker-empty">${escapeHtml(err.reason || 'Failed to load balances.')}</p>`;
  }
}

btnViewCryptoBalances.addEventListener('click', () => {
  if ((getMyUsername() || '').toLowerCase() !== CRYPTO_ADMIN_USERNAME) {
    alert('Not authorized.');
    return;
  }
  cryptoBalancesModal.classList.remove('hidden');
  refreshCryptoBalancesModal();
});

btnCryptoBalancesClose.addEventListener('click', () => cryptoBalancesModal.classList.add('hidden'));
btnCryptoBalancesCloseX.addEventListener('click', () => cryptoBalancesModal.classList.add('hidden'));
