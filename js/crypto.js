// ---------- Floydcoin (crypto) ----------
// Must match CRYPTO_MACHINES/CRYPTO_UPGRADE_TIERS/MACHINE_UPGRADE_SCALING in
// mfmmoserver/gameLogic.js -- display-only mirror, the server is authoritative on rate/cost.
const CRYPTO_MACHINES = [
  { name: 'MyShitter900', baseRate: 0.05 },
  { name: 'iFminer', baseRate: 0.15 },
  { name: 'iFminer360', baseRate: 0.30 },
  { name: 'iFminer720', baseRate: 0.50 },
  { name: 'iFminerX', baseRate: 0.80 },
  { name: 'DBL Azeroth Mining Rig', baseRate: 1.20 },
  { name: 'DBL Azeroth Mining Array', baseRate: 1.75 },
  { name: 'DBL Blackhawk Mining Array', baseRate: 2.50 },
  { name: 'KRG White//White Configured Mining Solution', baseRate: 3.50 },
  { name: 'UNT Prototype Quantum Miner', baseRate: 5.00 },
];
const MACHINE_UPGRADE_SCALING = 1.5;
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
const btnCryptoAdvanceMachine = document.getElementById('btnCryptoAdvanceMachine');
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

function cryptoMachineScaling(machineTier) {
  return Math.pow(MACHINE_UPGRADE_SCALING, machineTier);
}

function cryptoTrackAddRate(crypto, track) {
  const tier = crypto[`${track}Tier`];
  const scale = cryptoMachineScaling(crypto.machineTier);
  return CRYPTO_UPGRADE_TIERS[track].slice(0, tier).reduce((sum, t) => sum + t.addRate * scale, 0);
}

function cryptoNextTrackCost(crypto, track) {
  const tiers = CRYPTO_UPGRADE_TIERS[track];
  const tier = crypto[`${track}Tier`];
  if (tier >= tiers.length) return null;
  return Math.round(tiers[tier].cost * cryptoMachineScaling(crypto.machineTier) * cryptoPrestigeCostMultiplier(crypto.prestigeLevel));
}

function cryptoTracksMaxed(crypto) {
  return ['ram', 'cpu', 'gpu'].every((track) => crypto[`${track}Tier`] >= CRYPTO_UPGRADE_TIERS[track].length);
}

function cryptoDailyRate(crypto) {
  const machine = CRYPTO_MACHINES[crypto.machineTier];
  const machineRate = machine.baseRate * cryptoMachineScaling(crypto.machineTier);
  const upgradeRate = cryptoTrackAddRate(crypto, 'ram') + cryptoTrackAddRate(crypto, 'cpu') + cryptoTrackAddRate(crypto, 'gpu');
  return (machineRate + upgradeRate) * cryptoPrestigeRateMultiplier(crypto.prestigeLevel);
}

function renderCrypto() {
  if (!cryptoStateCache) return;
  const crypto = cryptoStateCache;
  cryptoFcBalance.textContent = crypto.fc.toFixed(4);
  cryptoRateDesc.textContent = `Mining at ${cryptoDailyRate(crypto).toFixed(2)} FC/day. Collect hourly.`;

  const currentMachine = CRYPTO_MACHINES[crypto.machineTier];
  const hourlyRate = cryptoDailyRate(crypto) / 24;
  cryptoRigTitle.textContent = `${currentMachine.name} -- ${hourlyRate.toFixed(4)} FC/hr`
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

  const maxMachineTier = CRYPTO_MACHINES.length - 1;
  const tracksMaxed = cryptoTracksMaxed(crypto);
  const onLastMachine = crypto.machineTier >= maxMachineTier;

  cryptoUpgradeGrid.innerHTML = ['ram', 'cpu', 'gpu'].map((track) => {
    const tierKey = `${track}Tier`;
    const tiers = CRYPTO_UPGRADE_TIERS[track];
    const tier = crypto[tierKey];
    const maxed = tier >= tiers.length;
    const cost = !maxed ? cryptoNextTrackCost(crypto, track) : null;
    return `
      <div class="hustle-card">
        <h3>${track.toUpperCase()}</h3>
        <p>Tier ${tier}/${tiers.length}${maxed ? ' (maxed)' : ` -- next: $${cost.toLocaleString()}`}</p>
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

  btnCryptoAdvanceMachine.disabled = !tracksMaxed || onLastMachine;
  btnCryptoAdvanceMachine.textContent = onLastMachine
    ? (tracksMaxed ? 'Last Machine (Prestige to continue)' : 'Max RAM/CPU/GPU to Prestige')
    : (tracksMaxed ? `Upgrade to ${CRYPTO_MACHINES[crypto.machineTier + 1].name}` : 'Max RAM/CPU/GPU First');

  btnCryptoPrestige.disabled = !(onLastMachine && tracksMaxed);
  btnCryptoPrestige.textContent = (onLastMachine && tracksMaxed)
    ? '🌟 Prestige (+50% rate, +100% upgrade costs)'
    : `🌟 Prestige (max out ${CRYPTO_MACHINES[maxMachineTier].name} first)`;
}

btnCryptoAdvanceMachine.addEventListener('click', async () => {
  if (btnCryptoAdvanceMachine.disabled) return;
  try {
    const result = await apiCryptoAdvanceMachine();
    character = result.character;
    logTo(cryptoLog, result.message, result.cls);
    save();
    renderAll();
    await refreshCrypto();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

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
