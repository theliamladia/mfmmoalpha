// ---------- New Milos City ----------
const drugSellSelect = document.getElementById('drugSellSelect');
const drugSellQty = document.getElementById('drugSellQty');
const drugSellOddsLine = document.getElementById('drugSellOddsLine');
const btnSellDrugs = document.getElementById('btnSellDrugs');
const btnRobbery = document.getElementById('btnRobbery');
const milosLog = document.getElementById('milosLog');
const playerListEl = document.getElementById('playerListEl');
const chatMessagesEl = document.getElementById('chatMessages');
const chatInputEl = document.getElementById('chatInput');
const btnChatSend = document.getElementById('btnChatSend');
const milosWarningModal = document.getElementById('milosWarningModal');
const milosWarningDontShow = document.getElementById('milosWarningDontShow');
const btnMilosWarningOk = document.getElementById('btnMilosWarningOk');
const goodJobsContainer = document.getElementById('goodJobsContainer');
const badJobsContainer = document.getElementById('badJobsContainer');
const dealerContainer = document.getElementById('dealerContainer');
const drugRankStatus = document.getElementById('drugRankStatus');

let onlinePlayersCache = [];

function renderPlayerList() {
  const display = getDisplayTitle();
  const badgeMarkup = display
    ? titleHoverMarkup(display)
    : `<span class="badge rank-badge">${computeRank()}</span>`;
  const fullName = `${character.firstName} ${character.lastName}`;
  const styledName = styledNameHtml(character, fullName);
  const youRow = `
    <li class="player-row">
      ${badgeMarkup}
      <span class="player-name">${styledName}</span>
      <div class="player-hover-card">
        <p><b>${styledName}</b></p>
        <p>Height: ${formatHeight(character.height)}</p>
        <p>Weight: ${round1(150 + character.fatGained + character.muscleGained)} lbs</p>
      </div>
    </li>
  `;

  const otherRows = onlinePlayersCache.map((p) => {
    const otherFullName = `${p.character.firstName} ${p.character.lastName}`;
    const otherStyledName = styledNameHtml(p.character, otherFullName);
    return `
    <li class="player-row" data-username="${p.username}">
      ${displayBadgeMarkupFor(p.character)}
      <span class="player-name">${otherStyledName}</span>
      <div class="player-hover-card">
        <p><b>${otherStyledName}</b></p>
        <p>Height: ${formatHeight(p.character.height)}</p>
        <p>Weight: ${round1(150 + p.character.fatGained + p.character.muscleGained)} lbs</p>
      </div>
    </li>
  `;
  }).join('');

  playerListEl.innerHTML = youRow + otherRows;

  playerListEl.querySelectorAll('.player-row[data-username]').forEach((row) => {
    row.addEventListener('click', () => openPlayerActionModal(row.dataset.username));
  });
}

// Presence is scoped to New Milos City specifically (see /milos/enter, /milos/leave) -- poll
// periodically while this tab is open so the roster reflects who's actually looking at it right now.
const ONLINE_POLL_MS = 15000;

async function refreshOnlinePlayers() {
  if (!getAuthToken()) return;
  try {
    const result = await apiOnlinePlayers();
    onlinePlayersCache = result.players.filter((p) => !p.you);
    if (typeof handlePendingDuelChallenge === 'function') handlePendingDuelChallenge(result.pendingDuelChallenge);
    if (typeof handlePendingMarriageProposal === 'function') handlePendingMarriageProposal(result.pendingMarriageProposal);
  } catch {
    // Presence is best-effort -- keep showing the last known list if the poll fails.
  }
  if (!pageMilos.classList.contains('hidden')) renderPlayerList();
}

setInterval(refreshOnlinePlayers, ONLINE_POLL_MS);
refreshOnlinePlayers();

function renderMilos() {
  if (!goodJobsContainer) return;
  const meetsGuzman = character.alliance >= GUZMAN_MIN_ALLIANCE;

  btnSellDrugs.disabled = character.jail.inJail || !meetsGuzman || !drugSellSelect.value;
  btnRobbery.disabled = character.jail.inJail || !meetsGuzman || isPeaceActive() || getRemainingCooldown('robbery', ROBBERY_COOLDOWN_MS) > 0;

  buildGoodJobsUI();
  buildBadJobsUI();
  buildDealerUI();
  buildDrugSellSelect();
  renderDrugSellOdds();
  buildCrimeUI();
  renderCombat();
  buildMoralsCenterUI();
  buildMtnUI();
  buildPenitentiaryUI();
  if (!pageMilos.classList.contains('hidden')) renderPlayerList();
}

function tickMilosCooldownUI() {
  if (!goodJobsContainer || pageMilos.classList.contains('hidden')) return;
  const meetsGuzman = character.alliance >= GUZMAN_MIN_ALLIANCE;

  btnSellDrugs.disabled = character.jail.inJail || !meetsGuzman || !drugSellSelect.value;

  const robberyRemaining = getRemainingCooldown('robbery', ROBBERY_COOLDOWN_MS);
  if (!meetsGuzman) {
    btnRobbery.disabled = true;
    btnRobbery.textContent = 'Requires Bad Alliance or Worse';
  } else if (isPeaceActive()) {
    btnRobbery.disabled = true;
    btnRobbery.textContent = 'Disabled -- Peace & Prosperity';
  } else if (robberyRemaining > 0) {
    btnRobbery.disabled = true;
    btnRobbery.textContent = `Attempt Robbery (${Math.ceil(robberyRemaining / 1000)}s)`;
  } else {
    btnRobbery.disabled = character.jail.inJail;
    btnRobbery.textContent = 'Attempt Robbery';
  }

  tickGoodJobsUI();
  tickBadJobsUI();
  tickDealerUI();
  tickCrimeUI();

  renderCombat();

  const approval = doCheckConcealedPermitApproval();
  if (approval.approved) {
    logTo(gunClubLog, 'Your Concealed Carry Permit application was approved!', 'gain');
    save();
    renderAll();
  } else {
    renderGunClub();
  }

  renderGunRange();
}

function doCheckConcealedPermitApproval() {
  if (character.licenses.concealedPermit) return { approved: false };
  if (character.licenses.concealedPendingUntil <= 0) return { approved: false };
  if (character.licenses.concealedPendingUntil > Date.now()) return { approved: false };
  character.licenses.concealedPermit = true;
  character.licenses.concealedPendingUntil = 0;
  return { approved: true };
}

// ---------- Good Jobs ----------
function meetsGoodJobAlliance() {
  return character.alliance <= GOOD_HUSTLE_MAX_ALLIANCE;
}

function goodJobSkillAvg() {
  const s = character.jobs.skills;
  return (s.skill1 + s.skill2 + s.skill3 + s.skill4) / 4;
}

function goodJobRank() {
  return rankFor(JOB_RANKS, goodJobSkillAvg());
}

function jobPerkActive(jobId, isBad) {
  if (isBad) return character.badJobs.currentJob === jobId && badJobSkillAvg() >= JOB_PERK_MIN_AVG;
  return character.jobs.currentJob === jobId && goodJobSkillAvg() >= JOB_PERK_MIN_AVG;
}

// sqrt curve so early Looks gains matter, not just Looks near the cap -- re-based (see
// LOOKS_TRAIN_BASE/LOOKS_TRAIN_K in core.js) so the starting Looks stat itself grants 0% bonus.
function looksTrainMult() {
  const looks = Math.min(character.stats.looks, STAT_CAP);
  return 1 + Math.max(0, Math.sqrt(looks / 100) - Math.sqrt(LOOKS_TRAIN_BASE / 100)) * LOOKS_TRAIN_K;
}

function goodJobSkillTrainMult() {
  return looksTrainMult();
}

function buildGoodJobsUI() {
  if (!goodJobsContainer) return;
  if (!meetsGoodJobAlliance()) {
    goodJobsContainer.innerHTML = '<p class="equip-picker-empty">Requires Neutral Alliance or Better.</p>';
    return;
  }

  const currentId = character.jobs.currentJob;
  if (!currentId) {
    goodJobsContainer.innerHTML = GOOD_JOBS.map((job) => `
      <div class="hustle-card">
        <h3>${job.name}</h3>
        <p>${job.desc}</p>
        <button data-apply-good="${job.id}" ${character.jail.inJail ? 'disabled' : ''}>Apply</button>
      </div>
    `).join('');
    goodJobsContainer.querySelectorAll('[data-apply-good]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await apiApplyGoodJob(btn.dataset.applyGood);
          character = result.character;
          logTo(milosLog, result.message, result.cls);
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
    return;
  }

  const job = GOOD_JOBS.find((j) => j.id === currentId);
  const s = character.jobs.skills;
  const avg = goodJobSkillAvg();
  const rank = goodJobRank();
  const next = nextRankFor(JOB_RANKS, avg);
  const nextLine = next
    ? `Next promotion: <b>${next.title}</b> at ${next.minAvg} average skill ($${next.payMin.toFixed(2)}&ndash;$${next.payMax.toFixed(2)} per click, ${(next.cooldownMs / 1000).toFixed(1)}s cooldown).`
    : 'You\'ve hit the top of the ladder &mdash; nowhere to go but stay sharp.';
  const perk = JOB_PERKS[job.id];
  const perkUnlocked = jobPerkActive(job.id, false);
  const perkLine = perk
    ? `<p class="job-payout-line">${perkUnlocked ? '✓' : '\u{1F512}'} <b>${perk.name}</b> (unlocks at Supervisor): ${perk.desc}</p>`
    : '';
  const ceoActive = avg >= GOOD_CEO_MIN_AVG && character.alliance <= COMBAT_GOOD_MAX_ALLIANCE;
  const ceoLine = avg >= GOOD_CEO_MIN_AVG
    ? `<p class="job-payout-line">${ceoActive ? '✓' : '\u{1F512}'} <b>👔 CEO Bonus</b> (Regional Manager + Good alliance): +${Math.round((GOOD_CEO_MULTIPLIER - 1) * 100)}% pay${ceoActive ? ' (active)' : ' -- stay Good to activate'}.</p>`
    : '';
  goodJobsContainer.innerHTML = `
    <div class="hustle-card job-card">
      <h3>${job.name} &mdash; <span class="job-rank-title">${rank.title}</span></h3>
      <p>Pay per click: <b>$${(rank.payMin * (ceoActive ? GOOD_CEO_MULTIPLIER : 1)).toFixed(2)}&ndash;$${(rank.payMax * (ceoActive ? GOOD_CEO_MULTIPLIER : 1)).toFixed(2)}</b>, cooldown <b>${(rank.cooldownMs / 1000).toFixed(1)}s</b>. ${nextLine}</p>
      <p class="job-payout-line">Looks Training Bonus: +${Math.round((goodJobSkillTrainMult() - 1) * 100)}% skill gain per click (from ${round1(character.stats.looks)} Looks).</p>
      ${perkLine}
      ${ceoLine}
      <p>Each button below pays out and trains that skill. Higher Looks trains skills faster. Promotions raise both your pay and your cooldown speed &mdash; the grind gets a lot better at the top.</p>
      ${job.skills.map((sk, i) => `
        <div class="job-skill-row">
          <span>${sk.label}: <b>${s[sk.key].toFixed(2)}</b>/100</span>
          <button data-work-good="${sk.key}" data-cooldown="jobSkill${i + 1}">Work</button>
        </div>
      `).join('')}
      ${job.id === 'wrestler' && perkUnlocked ? buildWrestlingGearStoreHtml() : ''}
      <hr class="hustle-divider">
      <button id="btnResignGood" class="secondary-btn">Resign</button>
    </div>
  `;

  goodJobsContainer.querySelectorAll('[data-work-good]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cooldownKey = btn.dataset.cooldown;
      if (getRemainingCooldown(cooldownKey, goodJobRank().cooldownMs) > 0) return;
      attemptMilosAction(async () => {
        try {
          const result = await apiGoodJobWork(btn.dataset.workGood);
          character = result.character;
          result.messages.forEach((m) => logTo(milosLog, m.message, m.cls));
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  });

  goodJobsContainer.querySelectorAll('[data-buy-gear]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiBuyGear(btn.dataset.buyGear);
        character = result.character;
        logTo(milosLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  document.getElementById('btnResignGood').addEventListener('click', async () => {
    if (!confirm('Resign? You will lose all skill progress at this job.')) return;
    try {
      const result = await apiResignGoodJob();
      character = result.character;
      logTo(milosLog, result.message, result.cls);
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });
}

function buildWrestlingGearStoreHtml() {
  return `
    <hr class="hustle-divider">
    <h4 class="gunclub-section-title">&#127942; Wrestling Gear Store</h4>
    <p>Exclusive gear for wrestlers only &mdash; equip it from Character &gt; Equipment.</p>
    <div class="hustle-grid">
      ${WRESTLING_GEAR_ITEMS.map((item) => {
        const owned = inventoryQty(item.id) > 0;
        return `
          <div class="hustle-card">
            <h3>${item.name}</h3>
            <p>${item.desc}</p>
            <button data-buy-gear="${item.id}">${owned ? 'Buy Another' : 'Buy'} ($${item.cost.toLocaleString()})</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function tickGoodJobsUI() {
  document.querySelectorAll('#goodJobsContainer [data-work-good]').forEach((btn) => {
    const cooldownKey = btn.dataset.cooldown;
    const remaining = getRemainingCooldown(cooldownKey, goodJobRank().cooldownMs);
    btn.disabled = character.jail.inJail || remaining > 0;
    btn.textContent = remaining > 0 ? `Work (${Math.ceil(remaining / 1000)}s)` : 'Work';
  });
}

// ---------- Bad Jobs ----------
function meetsBadJobAlliance() {
  return character.alliance >= GUZMAN_MIN_ALLIANCE;
}

function badJobSkillAvg() {
  const s = character.badJobs.skills;
  return (s.skill1 + s.skill2 + s.skill3 + s.skill4) / 4;
}

function badJobRank() {
  return rankFor(BAD_JOB_RANKS, badJobSkillAvg());
}

function badJobSkillTrainMult() {
  return looksTrainMult();
}

function badJobBustChance() {
  const avg = badJobSkillAvg();
  const base = Math.max(BAD_JOB_BUST_MIN, BAD_JOB_BUST_BASE - (avg / 100) * (BAD_JOB_BUST_BASE - BAD_JOB_BUST_MIN));
  const evasion = (character.stats.speed / 100) * 0.02 + (character.stats.defense / 100) * 0.01;
  const perkReduction = jobPerkActive('getaway', true) ? 0.03 : 0;
  return Math.max(BAD_JOB_BUST_MIN, base - evasion - perkReduction);
}

function buildBadJobsUI() {
  if (!badJobsContainer) return;
  if (!meetsBadJobAlliance()) {
    badJobsContainer.innerHTML = '<p class="equip-picker-empty">Requires Bad Alliance or Worse.</p>';
    return;
  }

  const currentId = character.badJobs.currentJob;
  if (!currentId) {
    badJobsContainer.innerHTML = BAD_JOBS.map((job) => `
      <div class="hustle-card">
        <h3>${job.name}</h3>
        <p>${job.desc}</p>
        <button data-apply-bad="${job.id}" ${character.jail.inJail ? 'disabled' : ''}>Apply</button>
      </div>
    `).join('');
    badJobsContainer.querySelectorAll('[data-apply-bad]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await apiApplyBadJob(btn.dataset.applyBad);
          character = result.character;
          logTo(milosLog, result.message, result.cls);
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
    return;
  }

  const job = BAD_JOBS.find((j) => j.id === currentId);
  const s = character.badJobs.skills;
  const avg = badJobSkillAvg();
  const rank = badJobRank();
  const next = nextRankFor(BAD_JOB_RANKS, avg);
  const nextLine = next
    ? `Next promotion: <b>${next.title}</b> at ${next.minAvg} average skill ($${next.payMin.toFixed(2)}&ndash;$${next.payMax.toFixed(2)} per click, ${(next.cooldownMs / 1000).toFixed(1)}s cooldown).`
    : 'You run this crew now &mdash; top of the ladder.';
  const perk = JOB_PERKS[job.id];
  const perkLine = perk
    ? `<p class="job-payout-line">${jobPerkActive(job.id, true) ? '✓' : '\u{1F512}'} <b>${perk.name}</b> (unlocks at Lieutenant): ${perk.desc}</p>`
    : '';
  badJobsContainer.innerHTML = `
    <div class="hustle-card job-card">
      <h3>${job.name} &mdash; <span class="job-rank-title">${rank.title}</span></h3>
      <p>Pay per click: <b>$${rank.payMin.toFixed(2)}&ndash;$${rank.payMax.toFixed(2)}</b>, cooldown <b>${(rank.cooldownMs / 1000).toFixed(1)}s</b>. Bust chance: <b>${Math.round(badJobBustChance() * 100)}%</b> per job. ${nextLine}</p>
      <p class="job-payout-line">Looks Training Bonus: +${Math.round((badJobSkillTrainMult() - 1) * 100)}% skill gain per click (from ${round1(character.stats.looks)} Looks).</p>
      ${perkLine}
      <p>Each button below pays out and trains that skill. Better skills pay more AND get you caught less &mdash; Speed and Defense also help you dodge a bust, and high Looks trains skills faster.</p>
      ${job.skills.map((sk, i) => `
        <div class="job-skill-row">
          <span>${sk.label}: <b>${s[sk.key].toFixed(2)}</b>/100</span>
          <button data-work-bad="${sk.key}" data-cooldown="badJobSkill${i + 1}">Work</button>
        </div>
      `).join('')}
      <hr class="hustle-divider">
      <button id="btnResignBad" class="secondary-btn">Resign</button>
    </div>
  `;

  badJobsContainer.querySelectorAll('[data-work-bad]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cooldownKey = btn.dataset.cooldown;
      if (getRemainingCooldown(cooldownKey, badJobRank().cooldownMs) > 0) return;
      attemptMilosAction(async () => {
        try {
          const result = await apiBadJobWork(btn.dataset.workBad);
          character = result.character;
          logTo(milosLog, result.message, result.cls);
          save();
          if (result.jailed) {
            goToJail(true);
            return;
          }
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  });

  document.getElementById('btnResignBad').addEventListener('click', async () => {
    if (!confirm('Resign? You will lose all skill progress at this job.')) return;
    try {
      const result = await apiResignBadJob();
      character = result.character;
      logTo(milosLog, result.message, result.cls);
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });
}

function tickBadJobsUI() {
  document.querySelectorAll('#badJobsContainer [data-work-bad]').forEach((btn) => {
    const cooldownKey = btn.dataset.cooldown;
    const remaining2 = getRemainingCooldown(cooldownKey, badJobRank().cooldownMs);
    btn.disabled = character.jail.inJail || remaining2 > 0;
    btn.textContent = remaining2 > 0 ? `Work (${Math.ceil(remaining2 / 1000)}s)` : 'Work';
  });
}

// ---------- Drug dealer chain ----------
function unlockedDealers() {
  return DEALER_TIERS.filter((d) => character.drugDealer.unitsSold >= d.unlockUnits);
}

function nextLockedDealer() {
  return DEALER_TIERS.find((d) => character.drugDealer.unitsSold < d.unlockUnits) || null;
}

function buildDealerUI() {
  if (!dealerContainer) return;
  const unlocked = unlockedDealers();
  const locked = nextLockedDealer();
  const unitsSold = character.drugDealer.unitsSold;

  drugRankStatus.textContent = locked
    ? `Units sold: ${unitsSold}. Sell ${locked.unlockUnits - unitsSold} more to meet ${locked.name}.`
    : `Units sold: ${unitsSold}. You've met every dealer in town.`;

  if (!meetsBadJobAlliance()) {
    dealerContainer.innerHTML = '<p class="equip-picker-empty">Requires Bad Alliance or Worse.</p>';
    return;
  }

  dealerContainer.innerHTML = unlocked.map((dealer) => {
    const drug = DRUG_ITEMS_BY_ID[dealer.drugId];
    return `
      <div class="hustle-card">
        <h3>${dealer.name}</h3>
        <p>Street-level ${drug.name} at $${drug.wholesaleCost}/unit. Marginal, but it adds up.</p>
        <button data-dealer-quick="${dealer.id}">Quick Deal</button>
        <hr class="hustle-divider">
        <input type="number" data-dealer-qty="${dealer.id}" min="1" value="1">
        <button data-dealer-buy="${dealer.id}">Buy Wholesale</button>
      </div>
    `;
  }).join('');

  dealerContainer.querySelectorAll('[data-dealer-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dealerId = btn.dataset.dealerQuick;
      if (getRemainingCooldown(`dealer_${dealerId}`, DEALER_QUICK_COOLDOWN_MS) > 0) return;
      attemptMilosAction(async () => {
        try {
          const result = await apiDealerQuickDeal(dealerId);
          character = result.character;
          logTo(milosLog, result.message, result.cls);
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  });

  dealerContainer.querySelectorAll('[data-dealer-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dealerId = btn.dataset.dealerBuy;
      attemptMilosAction(async () => {
        const qtyInput = dealerContainer.querySelector(`[data-dealer-qty="${dealerId}"]`);
        const qty = Math.max(1, Math.floor(+qtyInput.value) || 1);
        try {
          const result = await apiBuyFromDealer(dealerId, qty);
          character = result.character;
          logTo(milosLog, result.message, result.cls);
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  });
}

function tickDealerUI() {
  dealerContainer.querySelectorAll('[data-dealer-quick]').forEach((btn) => {
    const dealerId = btn.dataset.dealerQuick;
    const remaining = getRemainingCooldown(`dealer_${dealerId}`, DEALER_QUICK_COOLDOWN_MS);
    btn.disabled = character.jail.inJail || remaining > 0;
    btn.textContent = remaining > 0 ? `Quick Deal (${Math.ceil(remaining / 1000)}s)` : 'Quick Deal';
  });
}

// ---------- Bad Hustles: drugs ----------
function buildDrugSellSelect() {
  if (!drugSellSelect) return;
  const prevValue = drugSellSelect.value;
  const ownedDrugs = character.inventory.filter((stack) => DRUG_ITEMS_BY_ID[stack.id]);
  drugSellSelect.innerHTML = ownedDrugs.length
    ? ownedDrugs.map((stack) => `<option value="${stack.id}">${DRUG_ITEMS_BY_ID[stack.id].name} (x${stack.qty} owned)</option>`).join('')
    : '<option value="">No drugs owned</option>';
  if (ownedDrugs.some((s) => s.id === prevValue)) drugSellSelect.value = prevValue;
}

// Mirrors the server's doSellDrugs() risk formula exactly, same as crimeFailChance()/
// badJobBustChance() are already mirrored for their own odds displays -- Speed+Attack reduce the
// base risk, same stat-mitigation shape crimeFailChance() already uses.
const DRUG_SELL_RISK_MIN = 0.03;
const DRUG_SELL_STAT_MITIGATION = 0.5;

function sellDrugsRiskChance(drug, qty) {
  const baseRisk = Math.min(0.9, drug.riskBase + (qty - 1) * drug.riskPerUnit);
  const statScore = (character.stats.speed + character.stats.attack) / (2 * STAT_CAP);
  const reduction = Math.min(DRUG_SELL_STAT_MITIGATION, statScore * DRUG_SELL_STAT_MITIGATION);
  return Math.max(DRUG_SELL_RISK_MIN, baseRisk - reduction);
}

// Looks gives a smooth-talking revenue bonus, same as the server's drugSellRevenueMultiplier().
const DRUG_SELL_LOOKS_BONUS_MAX = 0.25;

function sellDrugsRevenueMultiplier() {
  const looksScore = Math.min(character.stats.looks, STAT_CAP) / STAT_CAP;
  return 1 + looksScore * DRUG_SELL_LOOKS_BONUS_MAX;
}

function renderDrugSellOdds() {
  if (!drugSellOddsLine) return;
  const drug = DRUG_ITEMS_BY_ID[drugSellSelect.value];
  if (!drug) { drugSellOddsLine.textContent = ''; return; }
  const qty = Math.max(1, Math.floor(+drugSellQty.value) || 1);
  const risk = sellDrugsRiskChance(drug, qty);
  const bonusPct = Math.round((sellDrugsRevenueMultiplier() - 1) * 100);
  const bonusNote = bonusPct > 0 ? ` &mdash; Looks revenue bonus: <b>+${bonusPct}%</b>` : '';
  drugSellOddsLine.innerHTML = `Odds of getting caught: <b>${Math.round(risk * 100)}%</b> (Speed/Attack lower this)${bonusNote}.`;
}

drugSellSelect.addEventListener('change', () => { renderMilos(); renderDrugSellOdds(); });
drugSellQty.addEventListener('input', renderDrugSellOdds);

btnSellDrugs.addEventListener('click', () => {
  if (character.alliance < GUZMAN_MIN_ALLIANCE) return;
  const drugId = drugSellSelect.value;
  if (!drugId) return;
  const owned = inventoryQty(drugId);
  const qty = Math.min(owned, Math.max(1, Math.floor(+drugSellQty.value) || 1));
  if (qty < 1) return;

  attemptMilosAction(async () => {
    const unlockedBefore = unlockedDealers().length;
    try {
      const result = await apiSellDrugs(drugId, qty);
      character = result.character;
      logTo(milosLog, result.message, result.cls);
      if (!result.jailed && unlockedDealers().length > unlockedBefore) {
        const newDealer = unlockedDealers()[unlockedDealers().length - 1];
        logTo(milosLog, `Word's out on the street &mdash; ${newDealer.name} is willing to talk to you now.`, 'gain');
      }
      save();
      if (result.jailed) {
        goToJail(true);
        return;
      }
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });
});

// ---------- Bad Hustles: robbery ----------
btnRobbery.addEventListener('click', () => {
  if (character.alliance < GUZMAN_MIN_ALLIANCE) return;
  if (getRemainingCooldown('robbery', ROBBERY_COOLDOWN_MS) > 0) return;

  attemptMilosAction(async () => {
    try {
      const result = await apiRobbery();
      character = result.character;
      logTo(milosLog, result.message, result.cls);
      save();
      if (result.jailed) {
        goToJail(true);
        return;
      }
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });
});

// ---------- Crime tab: fixed-payout crimes with a real criminal record ----------
const crimeContainer = document.getElementById('crimeContainer');
const crimeLog = document.getElementById('crimeLog');
const crimeRecordStatus = document.getElementById('crimeRecordStatus');
const btnCommunityService = document.getElementById('btnCommunityService');

function renderCrimeRecordStatus() {
  if (!crimeRecordStatus) return;
  const streak = character.crimeRecord.streak;
  crimeRecordStatus.textContent = streak > 0
    ? `Criminal record: ${streak} strike(s). Every future sentence is +${streak} year(s) until you clean it up.`
    : 'Criminal record: clean. First offense on any crime gets the base sentence.';
}

function buildCrimeUI() {
  if (!crimeContainer) return;
  renderCrimeRecordStatus();

  if (!meetsBadJobAlliance()) {
    crimeContainer.innerHTML = '<p class="equip-picker-empty">Requires Bad Alliance or Worse.</p>';
    return;
  }

  crimeContainer.innerHTML = CRIME_TIERS.map((tier) => `
    <div class="hustle-card">
      <h3>${tier.name}</h3>
      <p>${tier.desc}</p>
      <p class="job-payout-line">Payout: <b>$${tier.minReward.toLocaleString()}&ndash;$${tier.maxReward.toLocaleString()}</b>. If caught: <b>${tier.jailYears}+ year(s)</b>. Odds of getting caught: <b>${Math.round(crimeFailChance(tier) * 100)}%</b> (Attack &amp; Speed lower this).</p>
      <button data-crime="${tier.id}" ${character.jail.inJail ? 'disabled' : ''}>Attempt</button>
    </div>
  `).join('');

  crimeContainer.querySelectorAll('[data-crime]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tierId = btn.dataset.crime;
      if (getRemainingCooldown(`crime_${tierId}`, CRIME_COOLDOWN_MS) > 0) return;
      attemptMilosAction(async () => {
        try {
          const result = await apiAttemptCrime(tierId);
          character = result.character;
          logTo(crimeLog, result.message, result.cls);
          save();
          if (result.jailed) {
            goToJail(true);
            return;
          }
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  });
}

function tickCrimeUI() {
  if (!crimeContainer) return;
  crimeContainer.querySelectorAll('[data-crime]').forEach((btn) => {
    const tierId = btn.dataset.crime;
    const remaining = getRemainingCooldown(`crime_${tierId}`, CRIME_COOLDOWN_MS);
    btn.disabled = character.jail.inJail || remaining > 0;
    btn.textContent = remaining > 0 ? `Attempt (${Math.ceil(remaining / 1000)}s)` : 'Attempt';
  });

  if (!btnCommunityService) return;
  const remaining = getRemainingCooldown('communityService', COMMUNITY_SERVICE_COOLDOWN_MS);
  const cost = COMMUNITY_SERVICE_BASE_COST * (1 + character.crimeRecord.streak);
  btnCommunityService.disabled = character.jail.inJail || character.crimeRecord.streak <= 0 || remaining > 0;
  btnCommunityService.textContent = remaining > 0
    ? `Community Service (${Math.ceil(remaining / 1000)}s)`
    : `Community Service ($${cost.toLocaleString()})`;
}

btnCommunityService.addEventListener('click', async () => {
  if (getRemainingCooldown('communityService', COMMUNITY_SERVICE_COOLDOWN_MS) > 0) return;
  try {
    const result = await apiCommunityService();
    character = result.character;
    logTo(crimeLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

// ---------- Morals Center of NMC ----------
const moralsCenterStatus = document.getElementById('moralsCenterStatus');
const moralsCenterGrid = document.getElementById('moralsCenterGrid');
const moralsCenterLog = document.getElementById('moralsCenterLog');

// Advances one tick and applies its effect. No DOM access -- safe to run headless/while catching up.
function doMoralsCenterTick() {
  const mc = character.moralsCenter;
  mc.lastTickTs += MORALS_TICK_MS;
  if (!mc.choice) return { ticked: false };

  if (mc.choice === 'acceptRicardo') {
    character.alliance = clampStat(character.alliance - MORALS_GOOD_STEP);
  } else if (mc.choice === 'renounceRicardo') {
    character.alliance = clampStat(character.alliance + MORALS_BAD_STEP);
  } else if (mc.choice === 'invokeNeutrality') {
    const diff = 50 - character.alliance;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), MORALS_NEUTRAL_STEP);
    character.alliance = clampStat(character.alliance + step);
  }
  return { ticked: true };
}

function processMoralsCenter() {
  const mc = character.moralsCenter;
  if (character.jail.inJail) return;
  let anyTicked = false;
  while (Date.now() - mc.lastTickTs >= MORALS_TICK_MS) {
    const result = doMoralsCenterTick();
    if (result.ticked) anyTicked = true;
  }
  if (anyTicked) save();
}

function doSetMoralsChoice(choiceId) {
  character.moralsCenter.choice = choiceId;
  character.moralsCenter.lastTickTs = Date.now();
}

function buildMoralsCenterUI() {
  if (!moralsCenterGrid) return;
  const mc = character.moralsCenter;
  moralsCenterStatus.textContent = mc.choice
    ? `Active stance: ${MORALS_CHOICES[mc.choice].name}. Current Alliance: ${allianceLabel(character.alliance)} (${round1(character.alliance)}).`
    : `No stance chosen. Current Alliance: ${allianceLabel(character.alliance)} (${round1(character.alliance)}).`;

  moralsCenterGrid.innerHTML = Object.entries(MORALS_CHOICES).map(([id, choice]) => `
    <div class="hustle-card">
      <h3>${choice.name}</h3>
      <p>${choice.desc}</p>
      <button data-morals-choice="${id}" class="${mc.choice === id ? 'active-hustle' : ''}">${mc.choice === id ? 'Active' : 'Choose'}</button>
    </div>
  `).join('') + `
    <div class="hustle-card">
      <h3>Step Back</h3>
      <p>Stop taking a stance. Your Alliance stays where it is.</p>
      <button data-morals-choice="none" class="${!mc.choice ? 'active-hustle' : ''}">${!mc.choice ? 'Active' : 'Choose'}</button>
    </div>
  `;

  moralsCenterGrid.querySelectorAll('[data-morals-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choiceId = btn.dataset.moralsChoice === 'none' ? null : btn.dataset.moralsChoice;
      doSetMoralsChoice(choiceId);
      logTo(moralsCenterLog, choiceId ? `You side with ${MORALS_CHOICES[choiceId].name}.` : 'You step back from the Morals Center.', '');
      save();
      renderAll();
    });
  });
}

// ---------- milos sub-tabs ----------
const milosTabBtns = document.querySelectorAll('.milos-tab-btn');
const milosSubpages = {
  hustles: document.getElementById('milos-hustles'),
  combat: document.getElementById('milos-combat'),
  crime: document.getElementById('milos-crime'),
  cityhall: document.getElementById('milos-cityhall'),
  gunclub: document.getElementById('milos-gunclub'),
  bank: document.getElementById('milos-bank'),
  moralscenter: document.getElementById('milos-moralscenter'),
  mtn: document.getElementById('milos-mtn'),
  penitentiary: document.getElementById('milos-penitentiary'),
  coinflip: document.getElementById('milos-coinflip'),
  farms: document.getElementById('milos-farms'),
  crypto: document.getElementById('milos-crypto'),
  altcoins: document.getElementById('milos-altcoins'),
  stocks: document.getElementById('milos-stocks'),
};

milosTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    milosTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(milosSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.milos));
    if (btn.dataset.milos === 'mtn') refreshMtnListings();
    if (btn.dataset.milos === 'penitentiary') refreshPenitentiaryRecords();
    if (typeof setCoinflipTabVisible === 'function') setCoinflipTabVisible(btn.dataset.milos === 'coinflip');
    if (btn.dataset.milos === 'farms' && typeof refreshFarms === 'function') refreshFarms();
    if (btn.dataset.milos === 'crypto' && typeof refreshCrypto === 'function') refreshCrypto();
    if (btn.dataset.milos === 'altcoins' && typeof refreshAltcoins === 'function') refreshAltcoins();
    if (typeof setStockMarketTabVisible === 'function') setStockMarketTabVisible(btn.dataset.milos === 'stocks');
    // Investors Center has its own InvestorsChat -- showing the main New Milos City chat there too
    // would just be a redundant second chat box, so it's the one sub-tab that hides it.
    document.querySelector('.milos-chat-row').classList.toggle('hidden', btn.dataset.milos === 'stocks');
  });
});

// ---------- inventory sub-tabs ----------
const invTabBtns = document.querySelectorAll('.inv-tab-btn');
const invSubpages = {
  items: document.getElementById('inv-items'),
  equipment: document.getElementById('inv-equipment'),
  skills: document.getElementById('inv-skills'),
  alignment: document.getElementById('inv-alignment'),
};

invTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    invTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(invSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.inv));
    if (btn.dataset.inv === 'skills') renderSkillsTab();
    if (btn.dataset.inv === 'alignment') renderAlignmentTab();
  });
});

// ---------- inventory category sub-tabs ----------
const invcatTabBtns = document.querySelectorAll('.invcat-tab-btn');
const invcatSubpages = {
  licenses: document.getElementById('invcat-licenses'),
  items: document.getElementById('invcat-items'),
  cosmetics: document.getElementById('invcat-cosmetics'),
};

invcatTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    invcatTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(invcatSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.invcat));
  });
});

// ---------- hustle sub-tabs ----------
const hustleTabBtns = document.querySelectorAll('.hustle-tab-btn');
const hustleSubpages = {
  good: document.getElementById('hustles-good'),
  bad: document.getElementById('hustles-bad'),
};

hustleTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    hustleTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(hustleSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.hustle));
  });
});

// ---------- gun club sub-tabs ----------
const gunclubTabBtns = document.querySelectorAll('.gunclub-tab-btn');
const gunclubSubpages = {
  weapons: document.getElementById('gunclub-weapons'),
  ammo: document.getElementById('gunclub-ammo'),
  range: document.getElementById('gunclub-range'),
  licenses: document.getElementById('gunclub-licenses'),
};

gunclubTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    gunclubTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(gunclubSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.gunclub));
  });
});

// ---------- combat ----------
const btnFindFight = document.getElementById('btnFindFight');
const combatIdleEl = document.getElementById('combatIdle');
const combatArenaEl = document.getElementById('combatArena');
const enemyNameEl = document.getElementById('enemyName');
const playerHpBar = document.getElementById('playerHpBar');
const enemyHpBar = document.getElementById('enemyHpBar');
const playerHpText = document.getElementById('playerHpText');
const enemyHpText = document.getElementById('enemyHpText');
const btnCombatPunch = document.getElementById('btnCombatPunch');
const btnCombatHeavy = document.getElementById('btnCombatHeavy');
const btnCombatGuard = document.getElementById('btnCombatGuard');
const btnCombatWeapon = document.getElementById('btnCombatWeapon');
const combatActionBtns = [btnCombatPunch, btnCombatHeavy, btnCombatGuard, btnCombatWeapon];
const btnFlee = document.getElementById('btnFlee');
const combatLog = document.getElementById('combatLog');

// Combat is server-authoritative. `character.combat` (synced from the server on every action)
// replaces the old local-only combatState.
function renderCombat() {
  if (!btnFindFight) return;
  const combat = character.combat;
  combatIdleEl.classList.toggle('hidden', combat.active);
  combatArenaEl.classList.toggle('hidden', !combat.active);

  if (combat.active) {
    const npc = NPC_TYPES[combat.enemyKey];
    enemyNameEl.textContent = npc.name;
    playerHpText.textContent = `${round1(combat.playerHp)}/${round1(combat.playerMaxHp)}`;
    enemyHpText.textContent = `${round1(combat.enemyHp)}/${round1(combat.enemyMaxHp)}`;
    playerHpBar.style.width = `${(combat.playerHp / combat.playerMaxHp) * 100}%`;
    enemyHpBar.style.width = `${(combat.enemyHp / combat.enemyMaxHp) * 100}%`;
    const isPlayerTurn = combat.turn === 'player';
    btnCombatPunch.disabled = !isPlayerTurn;
    btnCombatHeavy.disabled = !isPlayerTurn;
    btnCombatGuard.disabled = !isPlayerTurn;
    btnCombatWeapon.disabled = !isPlayerTurn || equippedWeaponAtkBonus() <= 0;
  }

  const remaining = getRemainingCooldown('combat', COMBAT_COOLDOWN_MS);
  btnFindFight.disabled = combat.active || character.jail.inJail || remaining > 0;
  btnFindFight.textContent = !combat.active && remaining > 0
    ? `🥊 Find a Fight (${Math.ceil(remaining / 1000)}s)`
    : '🥊 Find a Fight';
}

// Equipped guns and melee weapons add flat Attack in a fight; melee is the cost-effective option.
function equippedWeaponAtkBonus() {
  const ids = [character.equipment.holsterL, character.equipment.holsterR, character.equipment.openCarry, character.equipment.melee].filter(Boolean);
  return ids.reduce((sum, id) => {
    const item = getItemDef(id);
    return sum + (item && item.atkBonus ? item.atkBonus : 0);
  }, 0);
}

// Wrestling gear (helmet/chest/pants/feet) adds flat combat stat bonuses on top of the above.
function gearStatBonus(stat) {
  const ids = [character.equipment.helmet, character.equipment.chest, character.equipment.pants, character.equipment.feet].filter(Boolean);
  return ids.reduce((sum, id) => {
    const item = getItemDef(id);
    return sum + (item && item.statBonuses && item.statBonuses[stat] ? item.statBonuses[stat] : 0);
  }, 0);
}

btnFindFight.addEventListener('click', () => {
  if (character.combat.active || character.jail.inJail) return;
  if (getRemainingCooldown('combat', COMBAT_COOLDOWN_MS) > 0) return;

  attemptMilosAction(async () => {
    try {
      const result = await apiStartFight();
      character = result.character;
      logTo(combatLog, result.message, result.cls);
      save();
      renderCombat();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });
});

// Formats the player-action half of a /combat/action response into a log line.
function combatActionLogMessage(result) {
  const name = result.npc.name;
  if (result.action === 'guard') {
    return result.riposted
      ? `You raise your guard and riposte the ${name} for ${result.dmg}!`
      : 'You raise your guard, bracing for the hit.';
  }
  if (result.action === 'heavy') {
    return result.missed ? `Your Heavy Strike whiffs completely!` : `Heavy Strike connects on the ${name} for ${result.dmg}!`;
  }
  if (result.action === 'weapon') {
    if (result.jammed) return 'Your weapon jams!';
    return result.missed ? 'No weapon equipped.' : `You open up on the ${name} with your weapon for ${result.dmg}!`;
  }
  return `You punch the ${name} for ${result.dmg}.`;
}

// Formats the enemy-action half of a /combat/action response into a log line.
function enemyActionLogMessage(result) {
  if (result.dodged) return `You dodge the ${result.npc.name}'s attack!`;
  if (result.guarded) return `Your guard soaks most of it -- the ${result.npc.name} only hits you for ${result.dmg}.`;
  return `The ${result.npc.name} hits you for ${result.dmg}.`;
}

const COMBAT_STAT_LABELS = { attack: 'Attack', health: 'HP' };

async function handleCombatAction(action) {
  if (!character.combat.active || character.combat.turn !== 'player') return;
  try {
    const result = await apiCombatAction(action);
    character = result.character;
    logTo(combatLog, combatActionLogMessage(result.playerResult), result.playerResult.missed ? 'loss' : 'gain');

    if (result.resolved === 'won') {
      const npc = result.playerResult.npc;
      logTo(combatLog, `You knocked out the ${npc.name}! +${result.winResult.reward} Floydbucks.`, 'gain');
      if (result.winResult.statGain) {
        logTo(combatLog, `Combat experience: +${result.winResult.statGain.amount.toFixed(2)} ${COMBAT_STAT_LABELS[result.winResult.statGain.stat]}.`, 'gain');
      }
      save();
      renderAll();
      renderCombat();
      return;
    }

    logTo(combatLog, enemyActionLogMessage(result.enemyResult), result.enemyResult.dodged || result.enemyResult.guarded ? 'gain' : 'loss');

    if (result.resolved === 'lost') {
      logTo(combatLog, `The ${result.enemyResult.npc.name} beat you down and took ${result.loseResult.lost} Floydbucks.`, 'loss');
      save();
      renderAll();
      renderCombat();
      return;
    }

    save();
    renderCombat();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

combatActionBtns.forEach((btn) => {
  btn.addEventListener('click', () => handleCombatAction(btn.dataset.combatAction));
});

btnFlee.addEventListener('click', async () => {
  if (!character.combat.active) return;
  try {
    const result = await apiFlee();
    character = result.character;
    logTo(combatLog, 'You fled the fight.', '');
    save();
    renderCombat();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

// New Milos City chat is server-backed and shared -- poll for new messages while the game is
// open, and render each as "[TITLE] Name: message", where TITLE is the same graphic shown in the
// status bar (equipped title, or your rank as a fallback).
let chatMessagesCache = [];
let lastRenderedChatId = null;

function currentDisplayTitleText() {
  const display = getDisplayTitle();
  return display ? display.name : computeRank();
}

// Resolves to the real badge graphic when possible -- getItemDef works for any static catalog
// title (crate titles, achievement titles like HIGHEST NET WORTH, etc.) regardless of whose
// message it is, since those defs don't depend on the sender's own character data. It only fails
// for another player's CUSTOM (Title Maker) title, since that def lives solely in their own save --
// falls back to the old bracketed text in that one case.
function chatTitleMarkup(msg) {
  if (msg.titleId) {
    const title = getItemDef(msg.titleId);
    if (title && title.type === 'title') return titleBadgeMarkup(title);
  }
  return `<span class="chat-title-fallback">${escapeHtml(msg.titleText)}</span>`;
}

function renderChatMessages() {
  const lastId = chatMessagesCache.length ? chatMessagesCache[chatMessagesCache.length - 1].id : null;
  if (lastId === lastRenderedChatId) return;
  lastRenderedChatId = lastId;

  chatMessagesEl.innerHTML = chatMessagesCache.map((msg) => `
    <div class="chat-message-row">
      ${chatTitleMarkup(msg)}
      <span class="chat-message-body">
        <span class="chat-message-name">${styledNameHtmlById(msg.titleId, msg.senderName)}</span><span class="chat-message-sep">:</span>
        <span class="chat-message-text">${escapeHtml(msg.message)}</span>
      </span>
    </div>
  `).join('');
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function refreshChatMessages() {
  if (!getAuthToken || !getAuthToken()) return;
  try {
    chatMessagesCache = (await apiChatMessages()).messages;
  } catch {
    // Best-effort -- keep showing the last known messages if the poll fails.
  }
  renderChatMessages();
}

const CHAT_POLL_MS = 4000;
setInterval(refreshChatMessages, CHAT_POLL_MS);

async function sendChatMessage() {
  const text = chatInputEl.value.trim();
  if (!text) return;
  chatInputEl.value = '';
  try {
    const result = await apiChatSend(currentDisplayTitleText(), text, character.titles.equipped);
    chatMessagesCache = result.messages;
    renderChatMessages();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

btnChatSend.addEventListener('click', sendChatMessage);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

function doSetHideMilosWarning() {
  character.settings.hideMilosWarning = true;
}

btnMilosWarningOk.addEventListener('click', () => {
  if (milosWarningDontShow.checked) {
    doSetHideMilosWarning();
    save();
  }
  milosWarningModal.classList.add('hidden');
});

// ---------- legal carry enforcement ----------
const milosLawBanner = document.getElementById('milosLawBanner');
const milosConcealedBanner = document.getElementById('milosConcealedBanner');

function getIllegalGearStatus() {
  const holsterItems = [character.equipment.holsterL, character.equipment.holsterR].filter(Boolean);
  const holsterIllegal = holsterItems.length > 0 && !character.licenses.concealedPermit;
  const holsterLegal = holsterItems.length > 0 && character.licenses.concealedPermit;
  const openCarryIllegal = !!character.equipment.openCarry;
  return { holsterItems, holsterIllegal, holsterLegal, openCarryIllegal, any: holsterIllegal || openCarryIllegal };
}

function renderLawBanner() {
  if (!milosLawBanner) return;
  const status = getIllegalGearStatus();
  if (!status.any) {
    milosLawBanner.classList.add('hidden');
    milosLawBanner.innerHTML = '';
  } else {
    const lines = [];
    if (status.holsterIllegal) lines.push('You are <b>concealing a weapon without a Concealed Carry Permit</b>.');
    if (status.openCarryIllegal) lines.push('You are <b>open carrying</b>, which is 100% illegal here under any circumstance.');
    milosLawBanner.innerHTML = `&#9888; <b>Illegally armed:</b> ${lines.join(' ')} There is a 50% chance of arrest every time you take an action while equipped like this &mdash; if caught, you forfeit the weapon and get ${JAIL_YEARS_WEAPON} years.`;
    milosLawBanner.classList.remove('hidden');
  }

  if (!milosConcealedBanner) return;
  if (status.holsterLegal) {
    const weaponNames = status.holsterItems.map((id) => getItemDef(id)?.name || id).join(' and ');
    milosConcealedBanner.innerHTML = `&#128737; <b>LEGALLY CONCEALED:</b> You are concealing your ${weaponNames}.`;
    milosConcealedBanner.classList.remove('hidden');
  } else {
    milosConcealedBanner.classList.add('hidden');
    milosConcealedBanner.innerHTML = '';
  }
}

function doIllegalGearCheck() {
  const status = getIllegalGearStatus();
  if (!status.any || isRiotActive() || Math.random() >= 0.5) return { caught: false };

  const forfeited = [];
  if (status.holsterIllegal) {
    if (character.equipment.holsterL) {
      forfeited.push(getItemDef(character.equipment.holsterL)?.name || character.equipment.holsterL);
      removeFromInventory(character.equipment.holsterL, 1);
      character.equipment.holsterL = null;
    }
    if (character.equipment.holsterR) {
      forfeited.push(getItemDef(character.equipment.holsterR)?.name || character.equipment.holsterR);
      removeFromInventory(character.equipment.holsterR, 1);
      character.equipment.holsterR = null;
    }
  }
  if (status.openCarryIllegal) {
    forfeited.push(getItemDef(character.equipment.openCarry)?.name || character.equipment.openCarry);
    removeFromInventory(character.equipment.openCarry, 1);
    character.equipment.openCarry = null;
  }
  allianceForceBad();
  character.jail.inJail = true;
  character.jail.crime = 'Illegal Firearm Possession';
  character.jail.yearsRemaining = JAIL_YEARS_WEAPON;
  character.jail.serving = false;
  character.combat.active = false;
  return { caught: true, message: `Caught illegally armed! Forfeited: ${forfeited.join(', ')}. Sentenced to ${JAIL_YEARS_WEAPON} years.`, cls: 'loss' };
}

function attemptMilosAction(actionFn, logEl) {
  const targetLog = logEl || milosLog;
  const result = doIllegalGearCheck();
  if (result.caught) {
    logTo(targetLog, result.message, result.cls);
    save();
    goToJail(true);
    return;
  }
  actionFn();
}

// ---------- City Hall ----------
const cityHallFirstNameInput = document.getElementById('cityHallFirstName');
const cityHallLastNameInput = document.getElementById('cityHallLastName');
const btnCityHallRename = document.getElementById('btnCityHallRename');
const cityHallMarriageStatus = document.getElementById('cityHallMarriageStatus');
const marriageProposeInput = document.getElementById('marriageProposeInput');
const btnMarriagePropose = document.getElementById('btnMarriagePropose');
const gunSafetyStatus = document.getElementById('gunSafetyStatus');
const btnStartGunSafety = document.getElementById('btnStartGunSafety');
const cityHallLog = document.getElementById('cityHallLog');

function renderCityHall() {
  if (!cityHallMarriageStatus) return;
  if (character.marriage.spouseName) {
    cityHallMarriageStatus.textContent = `Married to ${character.marriage.spouseName}.`;
  } else if (character.marriage.proposedTo) {
    cityHallMarriageStatus.textContent = `Proposal pending with ${character.marriage.proposedTo}.`;
  } else {
    cityHallMarriageStatus.textContent = 'You are not married.';
  }
  gunSafetyStatus.textContent = character.licenses.gunSafety
    ? 'Gun Safety License: earned.'
    : 'Required for a Concealed Carry Permit. 10 questions, 70% to pass.';
}

btnCityHallRename.addEventListener('click', () => {
  attemptMilosAction(async () => {
    try {
      const result = await apiCityHallRename(cityHallFirstNameInput.value.trim(), cityHallLastNameInput.value.trim());
      character = result.character;
      logTo(cityHallLog, result.message, result.cls);
      cityHallFirstNameInput.value = '';
      cityHallLastNameInput.value = '';
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, cityHallLog);
});

btnMarriagePropose.addEventListener('click', () => {
  attemptMilosAction(async () => {
    const name = marriageProposeInput.value.trim();
    if (!name) return;
    try {
      const result = await apiMarriagePropose(name);
      character = result.character;
      logTo(cityHallLog, result.message, result.cls);
      marriageProposeInput.value = '';
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, cityHallLog);
});

// Real marriage handshake -- mirrors the duel challenge modal exactly (see js/duels.js).
const marriageProposalModal = document.getElementById('marriageProposalModal');
const marriageProposalText = document.getElementById('marriageProposalText');
const btnMarriageProposalAccept = document.getElementById('btnMarriageProposalAccept');
const btnMarriageProposalDecline = document.getElementById('btnMarriageProposalDecline');
let pendingMarriageProposalSeenId = null;

function handlePendingMarriageProposal(pending) {
  if (!pending) {
    pendingMarriageProposalSeenId = null;
    return;
  }
  if (pending.id === pendingMarriageProposalSeenId) return;
  pendingMarriageProposalSeenId = pending.id;
  marriageProposalText.textContent = `${pending.proposerName} has proposed marriage to you.`;
  marriageProposalModal.classList.remove('hidden');
  marriageProposalModal.dataset.proposalId = pending.id;
}

btnMarriageProposalAccept.addEventListener('click', async () => {
  const proposalId = Number(marriageProposalModal.dataset.proposalId);
  marriageProposalModal.classList.add('hidden');
  try {
    const result = await apiMarriageRespond(proposalId, true);
    if (result.character) character = result.character;
    logTo(cityHallLog, 'Marriage proposal accepted!', 'gain');
    save();
    renderAll();
  } catch (err) {
    logTo(cityHallLog, err.reason || 'Could not accept proposal.', 'loss');
  }
});

btnMarriageProposalDecline.addEventListener('click', async () => {
  const proposalId = Number(marriageProposalModal.dataset.proposalId);
  marriageProposalModal.classList.add('hidden');
  try {
    await apiMarriageRespond(proposalId, false);
  } catch {
    // Best-effort -- the proposal will simply expire/no-op on the proposer's side.
  }
});

btnStartGunSafety.addEventListener('click', () => {
  attemptMilosAction(() => {
    openQuiz('Gun Safety Course', GUN_SAFETY_QUESTIONS, 0.7, async (passed) => {
      try {
        const result = await apiGunSafetyResult(passed);
        character = result.character;
        logTo(cityHallLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  }, cityHallLog);
});

// ---------- NMC Gun Club ----------
const pistolGrid = document.getElementById('pistolGrid');
const rifleGrid = document.getElementById('rifleGrid');
const gunClubLog = document.getElementById('gunClubLog');
const concealedStatus = document.getElementById('concealedStatus');
const btnConcealedFreeWait = document.getElementById('btnConcealedFreeWait');

function buildGunClubGrids() {
  if (!pistolGrid) return;
  const hasLicense = character.licenses.gunSafety;
  const lockedNote = hasLicense ? '' : '<p class="gun-license-note">Requires the Gun Safety License from City Hall.</p>';
  const discountNote = isRiotActive() ? ' – Riotlandia' : (jobPerkActive('fence', true) ? ' – Inside Contacts' : '');
  pistolGrid.innerHTML = PISTOL_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.caliber} pistol. Can be holstered (concealed) or open carried.</p>
      ${lockedNote}
      <button data-gun="${item.id}" ${hasLicense ? '' : 'disabled'}>Buy ($${round2(item.cost * gunPriceFactor()).toFixed(2)})${discountNote}</button>
    </div>
  `).join('');
  rifleGrid.innerHTML = RIFLE_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.caliber} rifle. Cannot be holstered &mdash; open carry only.</p>
      ${lockedNote}
      <button data-gun="${item.id}" ${hasLicense ? '' : 'disabled'}>Buy ($${round2(item.cost * gunPriceFactor()).toFixed(2)})${discountNote}</button>
    </div>
  `).join('');

  [...pistolGrid.querySelectorAll('button[data-gun]'), ...rifleGrid.querySelectorAll('button[data-gun]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!character.licenses.gunSafety) return;
      attemptMilosAction(async () => {
        try {
          const result = await apiBuyGun(btn.dataset.gun);
          character = result.character;
          logTo(gunClubLog, result.message, result.cls);
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      }, gunClubLog);
    });
  });

  buildAmmoGrid();
  buildMeleeGrid();
  buildArmorGrid();
}

function fenceDiscountFactor() {
  return jobPerkActive('fence', true) ? 0.85 : 1;
}

// Guns (and ammo) go to $0 during Riotlandia; melee keeps the normal Fence-only discount.
function gunPriceFactor() {
  return isRiotActive() ? 0 : fenceDiscountFactor();
}

const meleeGrid = document.getElementById('meleeGrid');

function buildMeleeGrid() {
  if (!meleeGrid) return;
  const meleeDiscountNote = jobPerkActive('fence', true) ? ' – Inside Contacts' : '';
  meleeGrid.innerHTML = MELEE_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>+${item.atkBonus} Attack in a fight. No license needed &mdash; legal to carry, cheaper than a gun.</p>
      <button data-melee="${item.id}">Buy ($${round2(item.cost * fenceDiscountFactor()).toFixed(2)})${meleeDiscountNote}</button>
    </div>
  `).join('');

  meleeGrid.querySelectorAll('button[data-melee]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiBuyMelee(btn.dataset.melee);
        character = result.character;
        logTo(gunClubLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

const armorGrid = document.getElementById('armorGrid');

function buildArmorGrid() {
  if (!armorGrid) return;
  armorGrid.innerHTML = ARMOR_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.desc}</p>
      <button data-armor="${item.id}">Buy ($${item.cost.toLocaleString()})</button>
    </div>
  `).join('');

  armorGrid.querySelectorAll('button[data-armor]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiBuyArmor(btn.dataset.armor);
        character = result.character;
        logTo(gunClubLog, result.message, result.cls);
        save();
        renderAll();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
}

const ammoGrid = document.getElementById('ammoGrid');

function buildAmmoGrid() {
  if (!ammoGrid) return;
  const ammoDiscountNote = isRiotActive() ? ' – Riotlandia' : (jobPerkActive('fence', true) ? ' – Inside Contacts' : '');
  ammoGrid.innerHTML = AMMO_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.caliber} ammo.</p>
      <button data-ammo="${item.id}">Buy ($${round2(item.cost * gunPriceFactor()).toFixed(2)})${ammoDiscountNote}</button>
    </div>
  `).join('');

  ammoGrid.querySelectorAll('button[data-ammo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      attemptMilosAction(async () => {
        try {
          const result = await apiBuyAmmo(btn.dataset.ammo);
          character = result.character;
          logTo(gunClubLog, result.message, result.cls);
          save();
          renderAll();
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      }, gunClubLog);
    });
  });
}

function renderGunClub() {
  if (!concealedStatus) return;
  if (character.licenses.concealedPermit) {
    concealedStatus.textContent = 'Concealed Carry Permit: granted.';
    btnConcealedFreeWait.disabled = true;
  } else if (character.licenses.concealedPendingUntil > Date.now()) {
    const remaining = Math.ceil((character.licenses.concealedPendingUntil - Date.now()) / 1000 / 60);
    concealedStatus.textContent = `Application pending: approved in about ${remaining} minute(s).`;
    btnConcealedFreeWait.disabled = true;
  } else {
    concealedStatus.textContent = `Apply for $${CONCEALED_APPLY_COST.toLocaleString()} and wait 10 minutes. Requires the Gun Safety License first.`;
    btnConcealedFreeWait.disabled = false;
  }
}

btnConcealedFreeWait.addEventListener('click', () => {
  attemptMilosAction(async () => {
    try {
      const result = await apiApplyConcealedPermit();
      character = result.character;
      logTo(gunClubLog, result.message, result.cls);
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, gunClubLog);
});

// ---------- Gun Range ----------
const rangeWeaponSelect = document.getElementById('rangeWeaponSelect');
const btnRangeShoot = document.getElementById('btnRangeShoot');
const btnRangeDraw = document.getElementById('btnRangeDraw');
const btnRangeReload = document.getElementById('btnRangeReload');
const rangeLog = document.getElementById('rangeLog');

rangeWeaponSelect.addEventListener('change', renderGunRange);

function buildRangeWeaponSelect() {
  if (!rangeWeaponSelect) return;
  const prevValue = rangeWeaponSelect.value;
  const ownedGuns = character.inventory.filter((stack) => {
    const item = getItemDef(stack.id);
    return item && (item.type === 'pistol' || item.type === 'rifle');
  });
  rangeWeaponSelect.innerHTML = ownedGuns.length
    ? ownedGuns.map((stack) => {
      const item = getItemDef(stack.id);
      return `<option value="${stack.id}">${item.name}</option>`;
    }).join('')
    : '<option value="">No weapons owned &mdash; buy one first</option>';
  if (ownedGuns.some((s) => s.id === prevValue)) rangeWeaponSelect.value = prevValue;
}

function renderGunRange() {
  if (!btnRangeShoot) return;
  const hasWeapon = !!rangeWeaponSelect.value;
  const shootRemaining = getRemainingCooldown('rangeShoot', RANGE_COOLDOWN_MS);
  const drawRemaining = getRemainingCooldown('rangeDraw', RANGE_COOLDOWN_MS);
  const reloadRemaining = getRemainingCooldown('rangeReload', RANGE_COOLDOWN_MS);

  btnRangeShoot.disabled = !hasWeapon || character.jail.inJail || shootRemaining > 0;
  btnRangeShoot.textContent = shootRemaining > 0 ? `Shoot (${Math.ceil(shootRemaining / 1000)}s)` : 'Shoot';

  btnRangeDraw.disabled = !hasWeapon || character.jail.inJail || drawRemaining > 0;
  btnRangeDraw.textContent = drawRemaining > 0 ? `Draw (${Math.ceil(drawRemaining / 1000)}s)` : 'Draw';

  btnRangeReload.disabled = !hasWeapon || character.jail.inJail || reloadRemaining > 0;
  btnRangeReload.textContent = reloadRemaining > 0 ? `Reload Mag (${Math.ceil(reloadRemaining / 1000)}s)` : 'Reload Mag';
}

btnRangeShoot.addEventListener('click', () => {
  if (!rangeWeaponSelect.value) return;
  if (getRemainingCooldown('rangeShoot', RANGE_COOLDOWN_MS) > 0) return;

  attemptMilosAction(async () => {
    try {
      const result = await apiRangeShoot(rangeWeaponSelect.value);
      character = result.character;
      logTo(rangeLog, result.message, result.cls);
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, rangeLog);
});

btnRangeDraw.addEventListener('click', () => {
  if (!rangeWeaponSelect.value) return;
  if (getRemainingCooldown('rangeDraw', RANGE_COOLDOWN_MS) > 0) return;

  attemptMilosAction(async () => {
    try {
      const result = await apiRangeDraw();
      character = result.character;
      logTo(rangeLog, result.message, result.cls);
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, rangeLog);
});

btnRangeReload.addEventListener('click', () => {
  if (!rangeWeaponSelect.value) return;
  if (getRemainingCooldown('rangeReload', RANGE_COOLDOWN_MS) > 0) return;

  attemptMilosAction(async () => {
    try {
      const result = await apiRangeReload();
      character = result.character;
      logTo(rangeLog, result.message, result.cls);
      save();
      renderAll();
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, rangeLog);
});

