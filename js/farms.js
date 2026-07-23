// ---------- Milos Outlook Farms ----------
const FARM_UNLOCK_UNITS_SOLD = 400;
const FARM_PLOT_COST = 50000;
const FARM_PREP_COST = 1200;
const FARM_SEED_COST_BY_DRUG = { drugWeed: 150, drugCoke: 1200 };
const FARM_SECURITY_MAX_TIER = 5;

const farmsLockedNote = document.getElementById('farmsLockedNote');
const farmsUnlockedContent = document.getElementById('farmsUnlockedContent');
const farmsSecurityDesc = document.getElementById('farmsSecurityDesc');
const farmsPlotsGrid = document.getElementById('farmsPlotsGrid');
const btnFarmsBuyPlot = document.getElementById('btnFarmsBuyPlot');
const btnFarmsBuySecurity = document.getElementById('btnFarmsBuySecurity');
const farmsLog = document.getElementById('farmsLog');

let farmsStateCache = null;

function farmConfiscationChancePct(securityTier) {
  return Math.max(5, 30 - securityTier * 5);
}

// mm:ss under an hour, h:mm:ss once it's an hour or more (Grow/Ship stages start at 1h).
function formatFarmDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const FARM_STAGE_VERB = { growing: 'Growing', packaging: 'Packaging', shipping: 'Shipping' };

// stageReadyAt is a server-stamped absolute timestamp -- offset by clockOffsetMs (same clock-skew
// calibration cooldowns use, see clientAuth.js) rather than raw Date.now(), so a player whose
// device clock drifts doesn't see a wildly wrong countdown.
function farmStageLabel(plot) {
  if (plot.stage === 'empty') return plot.prepped ? 'Prepped -- ready to plant' : 'Empty -- till/water/fertilize first';
  if (plot.stage === 'ready') return 'Ready to collect!';
  const remaining = plot.stageReadyAt - (Date.now() + clockOffsetMs);
  // Local countdown can hit zero slightly before the next refreshFarms() poll confirms the real
  // stage change -- show a neutral "almost there" line rather than a stale/negative timer.
  if (remaining <= 0) return 'Almost ready...';
  const verb = FARM_STAGE_VERB[plot.stage] || plot.stage;
  const note = plot.stage === 'shipping' ? ' -- vulnerable to interception' : '';
  return `${verb} (${formatFarmDuration(remaining)})${note}`;
}

function farmPlotCardHtml(plot) {
  const actions = [];
  if (plot.stage === 'empty' && !plot.prepped) {
    actions.push(`<button data-farm-prep="${plot.id}">Till/Water/Fertilize ($${FARM_PREP_COST.toLocaleString()})</button>`);
  }
  if (plot.stage === 'empty' && plot.prepped) {
    actions.push(`
      <select data-farm-seed-select="${plot.id}">
        <option value="drugWeed">🌿 Weed seed ($${FARM_SEED_COST_BY_DRUG.drugWeed.toLocaleString()})</option>
        <option value="drugCoke">❄️ Cocaine seed ($${FARM_SEED_COST_BY_DRUG.drugCoke.toLocaleString()})</option>
      </select>
      <button data-farm-plant="${plot.id}">Plant Seed</button>
    `);
  }
  if (plot.stage === 'ready') {
    actions.push(`<button data-farm-collect="${plot.id}">Collect Harvest</button>`);
  }
  const riskNote = plot.stage !== 'empty'
    ? `<p class="${plot.confiscated ? 'loss' : 'gain'}">${plot.confiscated ? 'This run is busted -- no payout on collect.' : 'This run is clear of confiscation.'}</p>`
    : '';
  return `
    <div class="hustle-card">
      <h3>🌱 Plot</h3>
      <p data-farm-timer="${plot.id}">${farmStageLabel(plot)}</p>
      ${riskNote}
      ${actions.join('')}
    </div>
  `;
}

function renderFarms() {
  if (!farmsStateCache) return;
  const unlocked = farmsStateCache.unitsSold >= FARM_UNLOCK_UNITS_SOLD;
  farmsLockedNote.classList.toggle('hidden', unlocked);
  farmsUnlockedContent.classList.toggle('hidden', !unlocked);
  if (!unlocked) return;

  const farms = farmsStateCache.farms;
  const chancePct = farmConfiscationChancePct(farms.securityTier);
  farmsSecurityDesc.textContent = farms.securityTier >= FARM_SECURITY_MAX_TIER
    ? `Maxed out -- confiscation risk floored at ${chancePct}%.`
    : `Tier ${farms.securityTier} -- confiscation risk ${chancePct}%. Next upgrade: $${((farms.securityTier + 1) * 10000).toLocaleString()}.`;
  btnFarmsBuySecurity.disabled = farms.securityTier >= FARM_SECURITY_MAX_TIER;

  farmsPlotsGrid.innerHTML = farms.plots.length
    ? farms.plots.map(farmPlotCardHtml).join('')
    : '<p class="equip-picker-empty">No plots yet.</p>';
  btnFarmsBuyPlot.disabled = farms.plots.length >= 1;

  farmsPlotsGrid.querySelectorAll('button[data-farm-prep]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiFarmsPrepPlot(btn.dataset.farmPrep);
        character = result.character;
        logTo(farmsLog, result.message, result.cls);
        save();
        renderAll();
        await refreshFarms();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  farmsPlotsGrid.querySelectorAll('button[data-farm-plant]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const plotId = btn.dataset.farmPlant;
      const select = farmsPlotsGrid.querySelector(`select[data-farm-seed-select="${plotId}"]`);
      try {
        const result = await apiFarmsPlantSeed(plotId, select.value);
        character = result.character;
        logTo(farmsLog, result.message, result.cls);
        save();
        renderAll();
        await refreshFarms();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  farmsPlotsGrid.querySelectorAll('button[data-farm-collect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiFarmsCollect(btn.dataset.farmCollect);
        character = result.character;
        logTo(farmsLog, result.message, result.cls);
        save();
        renderAll();
        await refreshFarms();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

// Patches just the timer text in place every tick (see tickCooldownUI in market.js) rather than
// re-rendering the whole grid, same reasoning as tickCrimeUI/tickBankCountdown -- a full re-render
// would also nuke the seed <select>'s in-progress value.
function tickFarmsUI() {
  if (!farmsStateCache || !farmsStateCache.farms) return;
  farmsStateCache.farms.plots.forEach((plot) => {
    const el = farmsPlotsGrid.querySelector(`[data-farm-timer="${plot.id}"]`);
    if (el) el.textContent = farmStageLabel(plot);
  });
}

async function refreshFarms() {
  try {
    farmsStateCache = await apiFarmsState();
    renderFarms();
  } catch {
    // Best-effort -- keep showing the last known state if the fetch fails.
  }
}

btnFarmsBuyPlot.addEventListener('click', async () => {
  try {
    const result = await apiFarmsBuyPlot();
    character = result.character;
    logTo(farmsLog, result.message, result.cls);
    save();
    renderAll();
    await refreshFarms();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnFarmsBuySecurity.addEventListener('click', async () => {
  try {
    const result = await apiFarmsBuySecurity();
    character = result.character;
    logTo(farmsLog, result.message, result.cls);
    save();
    renderAll();
    await refreshFarms();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
