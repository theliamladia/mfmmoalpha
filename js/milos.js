// ---------- New Milos City ----------
const drugSellSelect = document.getElementById('drugSellSelect');
const drugSellQty = document.getElementById('drugSellQty');
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

function renderPlayerList() {
  const display = getDisplayTitle();
  const badgeMarkup = display
    ? titleHoverMarkup(display)
    : `<span class="badge rank-badge">${computeRank()}</span>`;
  const fullName = `${character.firstName} ${character.lastName}`;
  playerListEl.innerHTML = `
    <li class="player-row">
      ${badgeMarkup}
      <span class="player-name">${fullName} (you)</span>
      <div class="player-hover-card">
        <p><b>${fullName}</b></p>
        <p>Height: ${formatHeight(character.height)}</p>
        <p>Weight: ${round1(150 + character.weightGained)} lbs</p>
      </div>
    </li>
  `;
}

function renderMilos() {
  if (!goodJobsContainer) return;
  const meetsGuzman = character.alliance >= GUZMAN_MIN_ALLIANCE;

  btnSellDrugs.disabled = character.jail.inJail || !meetsGuzman || !drugSellSelect.value;
  btnRobbery.disabled = character.jail.inJail || !meetsGuzman || getRemainingCooldown('robbery', ROBBERY_COOLDOWN_MS) > 0;

  buildGoodJobsUI();
  buildBadJobsUI();
  buildDealerUI();
  buildDrugSellSelect();
  buildCrimeUI();
  renderCombat();
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

function goodJobWageFactor() {
  return goodJobRank().wageMult;
}

function goodJobSkillTrainMult() {
  return 1 + (character.stats.looks / 100) * LOOKS_TRAIN_BONUS_MAX;
}

function doApplyGoodJob(jobId) {
  if (character.jobs.currentJob) return { ok: false, reason: 'Resign from your current job first.' };
  const job = GOOD_JOBS.find((j) => j.id === jobId);
  if (!job) return { ok: false };
  character.jobs.currentJob = jobId;
  character.jobs.skills = { skill1: 0, skill2: 0, skill3: 0, skill4: 0 };
  return { ok: true, message: `Hired at ${job.name}. Starting at base rank.`, cls: 'gain' };
}

function doResignGoodJob() {
  const job = GOOD_JOBS.find((j) => j.id === character.jobs.currentJob);
  character.jobs.currentJob = null;
  character.jobs.skills = { skill1: 0, skill2: 0, skill3: 0, skill4: 0 };
  return { message: job ? `Resigned from ${job.name}.` : 'Resigned.', cls: '' };
}

function doGoodJobWork(skillKey, cooldownKey) {
  const job = GOOD_JOBS.find((j) => j.id === character.jobs.currentJob);
  const gain = round2(randFloat(GOOD_HUSTLE_MIN, GOOD_HUSTLE_MAX) * goodJobWageFactor());
  character.cash = round2(character.cash + gain);
  const skillGain = round2(randFloat(JOB_SKILL_TRAIN_MIN, JOB_SKILL_TRAIN_MAX) * goodJobSkillTrainMult());
  character.jobs.skills[skillKey] = clampStat(character.jobs.skills[skillKey] + skillGain);
  character.cooldowns[cooldownKey] = Date.now();
  allianceBuff();
  return { gain, skillGain, jobName: job.name };
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
      btn.addEventListener('click', () => {
        const result = doApplyGoodJob(btn.dataset.applyGood);
        if (!result.ok) { alert(result.reason); return; }
        logTo(milosLog, result.message, result.cls);
        save();
        renderAll();
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
    ? `Next promotion: <b>${next.title}</b> at ${next.minAvg} average skill (${(next.wageMult).toFixed(1)}x wage, ${(next.cooldownMs / 1000).toFixed(1)}s cooldown).`
    : 'You\'ve hit the top of the ladder &mdash; nowhere to go but stay sharp.';
  goodJobsContainer.innerHTML = `
    <div class="hustle-card job-card">
      <h3>${job.name} &mdash; <span class="job-rank-title">${rank.title}</span></h3>
      <p>Wage multiplier: <b>${goodJobWageFactor().toFixed(2)}x</b> base ($${GOOD_HUSTLE_MIN.toFixed(2)}&ndash;$${GOOD_HUSTLE_MAX.toFixed(2)}), cooldown <b>${(rank.cooldownMs / 1000).toFixed(1)}s</b>. ${nextLine}</p>
      <p>Each button below pays out and trains that skill. Higher Looks trains skills faster. Promotions raise both your pay and your cooldown speed &mdash; the grind gets a lot better at the top.</p>
      ${job.skills.map((sk, i) => `
        <div class="job-skill-row">
          <span>${sk.label}: <b>${s[sk.key].toFixed(2)}</b>/100</span>
          <button data-work-good="${sk.key}" data-cooldown="jobSkill${i + 1}">Work</button>
        </div>
      `).join('')}
      <hr class="hustle-divider">
      <button id="btnResignGood" class="secondary-btn">Resign</button>
    </div>
  `;

  goodJobsContainer.querySelectorAll('[data-work-good]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cooldownKey = btn.dataset.cooldown;
      if (getRemainingCooldown(cooldownKey, goodJobRank().cooldownMs) > 0) return;
      attemptMilosAction(() => {
        const result = doGoodJobWork(btn.dataset.workGood, cooldownKey);
        logTo(milosLog, `${result.jobName}: +$${result.gain.toFixed(2)}.`, 'gain');
        save();
        renderAll();
      });
    });
  });

  document.getElementById('btnResignGood').addEventListener('click', () => {
    if (!confirm('Resign? You will lose all skill progress at this job.')) return;
    const result = doResignGoodJob();
    logTo(milosLog, result.message, result.cls);
    save();
    renderAll();
  });
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

function badJobWageFactor() {
  return badJobRank().wageMult;
}

function badJobSkillTrainMult() {
  return 1 + (character.stats.looks / 100) * LOOKS_TRAIN_BONUS_MAX;
}

function badJobBustChance() {
  const avg = badJobSkillAvg();
  const base = Math.max(BAD_JOB_BUST_MIN, BAD_JOB_BUST_BASE - (avg / 100) * (BAD_JOB_BUST_BASE - BAD_JOB_BUST_MIN));
  const evasion = (character.stats.speed / 100) * 0.02 + (character.stats.defense / 100) * 0.01;
  return Math.max(BAD_JOB_BUST_MIN, base - evasion);
}

function doApplyBadJob(jobId) {
  if (character.badJobs.currentJob) return { ok: false, reason: 'Resign from your current job first.' };
  const job = BAD_JOBS.find((j) => j.id === jobId);
  if (!job) return { ok: false };
  character.badJobs.currentJob = jobId;
  character.badJobs.skills = { skill1: 0, skill2: 0, skill3: 0, skill4: 0 };
  return { ok: true, message: `You're in with ${job.name}. Starting at base rank.`, cls: 'gain' };
}

function doResignBadJob() {
  const job = BAD_JOBS.find((j) => j.id === character.badJobs.currentJob);
  character.badJobs.currentJob = null;
  character.badJobs.skills = { skill1: 0, skill2: 0, skill3: 0, skill4: 0 };
  return { message: job ? `Cut ties with ${job.name}.` : 'Resigned.', cls: '' };
}

function doBadJobWork(skillKey, cooldownKey) {
  const job = BAD_JOBS.find((j) => j.id === character.badJobs.currentJob);
  character.cooldowns[cooldownKey] = Date.now();
  if (Math.random() < badJobBustChance()) {
    allianceDebuff();
    character.jail.inJail = true;
    character.jail.crime = job.name;
    character.jail.yearsRemaining = BAD_JOB_JAIL_YEARS;
    character.jail.serving = false;
    return { jailed: true, message: `Busted working for ${job.name}! Sentenced to ${BAD_JOB_JAIL_YEARS} year.`, cls: 'loss' };
  }
  const gain = round2(randFloat(BAD_JOB_MIN, BAD_JOB_MAX) * badJobWageFactor());
  character.cash = round2(character.cash + gain);
  const skillGain = round2(randFloat(JOB_SKILL_TRAIN_MIN, JOB_SKILL_TRAIN_MAX) * badJobSkillTrainMult());
  character.badJobs.skills[skillKey] = clampStat(character.badJobs.skills[skillKey] + skillGain);
  allianceDebuff();
  return { jailed: false, gain, skillGain, jobName: job.name };
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
      btn.addEventListener('click', () => {
        const result = doApplyBadJob(btn.dataset.applyBad);
        if (!result.ok) { alert(result.reason); return; }
        logTo(milosLog, result.message, result.cls);
        save();
        renderAll();
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
    ? `Next promotion: <b>${next.title}</b> at ${next.minAvg} average skill (${(next.wageMult).toFixed(1)}x wage, ${(next.cooldownMs / 1000).toFixed(1)}s cooldown).`
    : 'You run this crew now &mdash; top of the ladder.';
  badJobsContainer.innerHTML = `
    <div class="hustle-card job-card">
      <h3>${job.name} &mdash; <span class="job-rank-title">${rank.title}</span></h3>
      <p>Wage multiplier: <b>${badJobWageFactor().toFixed(2)}x</b> base ($${BAD_JOB_MIN}&ndash;$${BAD_JOB_MAX}), cooldown <b>${(rank.cooldownMs / 1000).toFixed(1)}s</b>. Bust chance: <b>${Math.round(badJobBustChance() * 100)}%</b> per job. ${nextLine}</p>
      <p class="job-payout-line">Payout per Work: <b>$${(BAD_JOB_MIN * badJobWageFactor()).toFixed(2)}&ndash;$${(BAD_JOB_MAX * badJobWageFactor()).toFixed(2)}</b></p>
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
      attemptMilosAction(() => {
        const result = doBadJobWork(btn.dataset.workBad, cooldownKey);
        if (result.jailed) {
          logTo(milosLog, result.message, result.cls);
          save();
          goToJail(true);
          return;
        }
        logTo(milosLog, `${result.jobName}: +$${result.gain.toFixed(2)}.`, 'gain');
        save();
        renderAll();
      });
    });
  });

  document.getElementById('btnResignBad').addEventListener('click', () => {
    if (!confirm('Resign? You will lose all skill progress at this job.')) return;
    const result = doResignBadJob();
    logTo(milosLog, result.message, result.cls);
    save();
    renderAll();
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

function doDealerQuickDeal(dealerId) {
  const dealer = DEALER_TIERS.find((d) => d.id === dealerId);
  if (!dealer) return { ok: false };
  character.cooldowns[`dealer_${dealerId}`] = Date.now();
  if (Math.random() < DEALER_QUICK_SUCCESS_CHANCE) {
    const gain = round2(randFloat(DEALER_QUICK_MIN, DEALER_QUICK_MAX));
    character.cash = round2(character.cash + gain);
    return { ok: true, message: `Quick deal with ${dealer.name}: +$${gain.toFixed(2)}.`, cls: 'gain' };
  }
  allianceDebuff();
  return { ok: true, message: `${dealer.name} stiffed you. No payout.`, cls: 'loss' };
}

function doBuyFromDealer(dealerId, qty) {
  const dealer = DEALER_TIERS.find((d) => d.id === dealerId);
  if (!dealer) return { ok: false };
  const drug = DRUG_ITEMS_BY_ID[dealer.drugId];
  const cost = drug.wholesaleCost * qty;
  if (character.cash < cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash = round2(character.cash - cost);
  addToInventory(drug.id, qty);
  return { ok: true, message: `Bought ${qty}x ${drug.name} from ${dealer.name} for $${cost.toLocaleString()}.`, cls: 'gain' };
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
      attemptMilosAction(() => {
        const result = doDealerQuickDeal(dealerId);
        logTo(milosLog, result.message, result.cls);
        save();
        renderAll();
      });
    });
  });

  dealerContainer.querySelectorAll('[data-dealer-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dealerId = btn.dataset.dealerBuy;
      attemptMilosAction(() => {
        const qtyInput = dealerContainer.querySelector(`[data-dealer-qty="${dealerId}"]`);
        const qty = Math.max(1, Math.floor(+qtyInput.value) || 1);
        const result = doBuyFromDealer(dealerId, qty);
        if (!result.ok) { alert(result.reason); return; }
        logTo(milosLog, result.message, result.cls);
        save();
        renderAll();
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

drugSellSelect.addEventListener('change', renderMilos);

function doSellDrugs(drugId, qty) {
  const drug = DRUG_ITEMS_BY_ID[drugId];
  if (!drug) return { ok: false };
  const riskChance = Math.min(0.9, drug.riskBase + (qty - 1) * drug.riskPerUnit);
  if (Math.random() < riskChance) {
    const years = Math.max(1, Math.round(drug.jailYearsPerUnit * qty));
    removeFromInventory(drugId, qty);
    allianceDebuff();
    character.jail.inJail = true;
    character.jail.crime = `Selling ${drug.name}`;
    character.jail.yearsRemaining = years;
    character.jail.serving = false;
    return { ok: true, jailed: true, message: `Busted selling ${qty}x ${drug.name}! Sentenced to ${years} year(s).`, cls: 'loss' };
  }
  const unitPrice = randFloat(drug.sellMin, drug.sellMax);
  const total = round2(unitPrice * qty);
  character.cash = round2(character.cash + total);
  removeFromInventory(drugId, qty);
  character.drugDealer.unitsSold += qty;
  return { ok: true, jailed: false, message: `Sold ${qty}x ${drug.name} for $${total.toFixed(2)}.`, cls: 'gain' };
}

btnSellDrugs.addEventListener('click', () => {
  if (character.alliance < GUZMAN_MIN_ALLIANCE) return;
  const drugId = drugSellSelect.value;
  if (!drugId) return;
  const owned = inventoryQty(drugId);
  const qty = Math.min(owned, Math.max(1, Math.floor(+drugSellQty.value) || 1));
  if (qty < 1) return;

  attemptMilosAction(() => {
    const unlockedBefore = unlockedDealers().length;
    const result = doSellDrugs(drugId, qty);
    if (!result.ok) return;
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
  });
});

// ---------- Bad Hustles: robbery ----------
function doRobbery() {
  character.cooldowns.robbery = Date.now();
  const speed = character.stats.speed;
  const looks = character.stats.looks;
  const findOutChance = Math.max(0.1, Math.min(0.55, 0.55 - (speed / 100) * 0.35 - (looks / 100) * 0.10));

  if (Math.random() >= findOutChance) {
    const gain = round2(randFloat(ROBBERY_MIN, ROBBERY_MAX));
    character.cash = round2(character.cash + gain);
    allianceDebuff();
    return { jailed: false, message: `Robbed a stranger for $${gain.toFixed(2)} and got away clean.`, cls: 'gain' };
  }

  const citizen = NPC_TYPES.citizen;
  const winChance = Math.max(0.15, Math.min(0.85, 0.5 + (character.stats.attack - citizen.attack) * 0.015));
  if (Math.random() < winChance) {
    const gain = round2(randFloat(ROBBERY_MIN, ROBBERY_MAX) * 0.5);
    character.cash = round2(character.cash + gain);
    allianceDebuff();
    return { jailed: false, message: `They noticed and fought back! You won the scuffle and got away with $${gain.toFixed(2)}.`, cls: 'gain' };
  }

  allianceDebuff();
  character.jail.inJail = true;
  character.jail.crime = 'Attempted Robbery';
  character.jail.yearsRemaining = ROBBERY_JAIL_YEARS;
  character.jail.serving = false;
  return { jailed: true, message: `They noticed, fought back, and beat you! Sentenced to ${ROBBERY_JAIL_YEARS} year.`, cls: 'loss' };
}

btnRobbery.addEventListener('click', () => {
  if (character.alliance < GUZMAN_MIN_ALLIANCE) return;
  if (getRemainingCooldown('robbery', ROBBERY_COOLDOWN_MS) > 0) return;

  attemptMilosAction(() => {
    const result = doRobbery();
    logTo(milosLog, result.message, result.cls);
    save();
    if (result.jailed) {
      goToJail(true);
      return;
    }
    renderAll();
  });
});

// ---------- Crime tab: fixed-payout crimes with a real criminal record ----------
const crimeContainer = document.getElementById('crimeContainer');
const crimeLog = document.getElementById('crimeLog');
const crimeRecordStatus = document.getElementById('crimeRecordStatus');
const btnCommunityService = document.getElementById('btnCommunityService');

function doAttemptCrime(tierId) {
  const tier = CRIME_TIERS.find((t) => t.id === tierId);
  if (!tier) return { ok: false };
  character.cooldowns[`crime_${tier.id}`] = Date.now();
  const risk = crimeFailChance(tier);
  if (Math.random() < risk) {
    const years = tier.jailYears + crimeStreakYears();
    bumpCrimeStreak();
    allianceDebuff();
    character.jail.inJail = true;
    character.jail.crime = tier.name;
    character.jail.yearsRemaining = years;
    character.jail.serving = false;
    const streakNote = years > tier.jailYears ? ` (${tier.jailYears} base + ${years - tier.jailYears} repeat-offender)` : '';
    return { ok: true, jailed: true, message: `Busted committing ${tier.name}! Sentenced to ${years} year(s)${streakNote}.`, cls: 'loss' };
  }
  const gain = round2(randFloat(tier.minReward, tier.maxReward));
  character.cash = round2(character.cash + gain);
  allianceDebuff();
  return { ok: true, jailed: false, message: `Pulled off ${tier.name}: +$${gain.toFixed(2)}.`, cls: 'gain' };
}

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
      attemptMilosAction(() => {
        const result = doAttemptCrime(tierId);
        if (!result.ok) return;
        logTo(crimeLog, result.message, result.cls);
        save();
        if (result.jailed) {
          goToJail(true);
          return;
        }
        renderAll();
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

btnCommunityService.addEventListener('click', () => {
  if (getRemainingCooldown('communityService', COMMUNITY_SERVICE_COOLDOWN_MS) > 0) return;
  const result = doCommunityService();
  if (!result.ok) { alert(result.reason); return; }
  logTo(crimeLog, result.message, result.cls);
  save();
  renderAll();
});

// ---------- milos sub-tabs ----------
const milosTabBtns = document.querySelectorAll('.milos-tab-btn');
const milosSubpages = {
  hustles: document.getElementById('milos-hustles'),
  combat: document.getElementById('milos-combat'),
  crime: document.getElementById('milos-crime'),
  cityhall: document.getElementById('milos-cityhall'),
  gunclub: document.getElementById('milos-gunclub'),
  bank: document.getElementById('milos-bank'),
};

milosTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    milosTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(milosSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.milos));
  });
});

// ---------- inventory sub-tabs ----------
const invTabBtns = document.querySelectorAll('.inv-tab-btn');
const invSubpages = {
  items: document.getElementById('inv-items'),
  equipment: document.getElementById('inv-equipment'),
};

invTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    invTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(invSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.inv));
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
const btnAttack = document.getElementById('btnAttack');
const btnFlee = document.getElementById('btnFlee');
const combatLog = document.getElementById('combatLog');

let combatState = { active: false, enemyKey: null, enemyHp: 0, enemyMaxHp: 0, playerHp: 0, playerMaxHp: 0, turn: null };

function pickOpponentPool() {
  if (character.alliance <= COMBAT_GOOD_MAX_ALLIANCE) return ['gangster', 'thug'];
  if (character.alliance >= GUZMAN_MIN_ALLIANCE) return ['citizen', 'cop'];
  return ['citizen', 'cop', 'thug', 'gangster'];
}

function renderCombat() {
  if (!btnFindFight) return;
  combatIdleEl.classList.toggle('hidden', combatState.active);
  combatArenaEl.classList.toggle('hidden', !combatState.active);

  if (combatState.active) {
    const npc = NPC_TYPES[combatState.enemyKey];
    enemyNameEl.textContent = npc.name;
    playerHpText.textContent = `${combatState.playerHp}/${combatState.playerMaxHp}`;
    enemyHpText.textContent = `${combatState.enemyHp}/${combatState.enemyMaxHp}`;
    playerHpBar.style.width = `${(combatState.playerHp / combatState.playerMaxHp) * 100}%`;
    enemyHpBar.style.width = `${(combatState.enemyHp / combatState.enemyMaxHp) * 100}%`;
    btnAttack.disabled = combatState.turn !== 'player';
  }

  const remaining = getRemainingCooldown('combat', COMBAT_COOLDOWN_MS);
  btnFindFight.disabled = combatState.active || character.jail.inJail || remaining > 0;
  btnFindFight.textContent = !combatState.active && remaining > 0
    ? `Find a Fight (${Math.ceil(remaining / 1000)}s)`
    : 'Find a Fight';
}

// Height gives a reach/frame advantage in a fight: extra max HP and a small attack bonus.
function heightHpBonus() {
  return Math.round(Math.max(0, character.height - 65) * 0.4);
}

function heightAtkBonus() {
  return Math.round(Math.max(0, character.height - 65) * 0.05 * 10) / 10;
}

// Equipped guns and melee weapons add flat Attack in a fight; melee is the cost-effective option.
function equippedWeaponAtkBonus() {
  const ids = [character.equipment.holsterL, character.equipment.holsterR, character.equipment.openCarry, character.equipment.melee].filter(Boolean);
  return ids.reduce((sum, id) => {
    const item = getItemDef(id);
    return sum + (item && item.atkBonus ? item.atkBonus : 0);
  }, 0);
}

// Speed gives a chance to dodge an enemy attack outright.
function speedDodgeChance() {
  return Math.min(0.35, (character.stats.speed / 100) * 0.35);
}

function doStartFight() {
  const pool = pickOpponentPool();
  const key = pool[randInt(0, pool.length - 1)];
  const npc = NPC_TYPES[key];
  const maxHp = character.stats.health + heightHpBonus();
  combatState = {
    active: true,
    enemyKey: key,
    enemyHp: npc.hp,
    enemyMaxHp: npc.hp,
    playerHp: maxHp,
    playerMaxHp: maxHp,
    turn: 'player',
  };
  return { npc };
}

btnFindFight.addEventListener('click', () => {
  if (combatState.active || character.jail.inJail) return;
  if (getRemainingCooldown('combat', COMBAT_COOLDOWN_MS) > 0) return;

  attemptMilosAction(() => {
    const { npc } = doStartFight();
    logTo(combatLog, `A ${npc.name} steps out of the shadows.`, '');
    renderCombat();
  });
});

function doPlayerAttack() {
  const npc = NPC_TYPES[combatState.enemyKey];
  const effectiveAttack = character.stats.attack + heightAtkBonus() + equippedWeaponAtkBonus();
  const dmg = Math.max(1, Math.round(effectiveAttack - npc.defense * 0.4 + randInt(-3, 3)));
  combatState.enemyHp = Math.max(0, combatState.enemyHp - dmg);
  return { dmg, npc, enemyDefeated: combatState.enemyHp <= 0 };
}

btnAttack.addEventListener('click', () => {
  if (!combatState.active || combatState.turn !== 'player') return;
  const result = doPlayerAttack();
  logTo(combatLog, `You hit the ${result.npc.name} for ${result.dmg}.`, 'gain');

  if (result.enemyDefeated) {
    winCombat(result.npc);
    return;
  }
  combatState.turn = 'enemy';
  renderCombat();
  setTimeout(enemyTurn, 600);
});

function doEnemyAttack() {
  const npc = NPC_TYPES[combatState.enemyKey];
  if (Math.random() < speedDodgeChance()) {
    return { dmg: 0, npc, dodged: true, playerDefeated: false };
  }
  const dmg = Math.max(1, Math.round(npc.attack - character.stats.defense * 0.4 + randInt(-3, 3)));
  combatState.playerHp = Math.max(0, combatState.playerHp - dmg);
  return { dmg, npc, dodged: false, playerDefeated: combatState.playerHp <= 0 };
}

function enemyTurn() {
  if (!combatState.active) return;
  const result = doEnemyAttack();
  if (result.dodged) {
    logTo(combatLog, `You dodge the ${result.npc.name}'s attack!`, 'gain');
  } else {
    logTo(combatLog, `The ${result.npc.name} hits you for ${result.dmg}.`, 'loss');
  }

  if (result.playerDefeated) {
    loseCombat(result.npc);
    return;
  }
  combatState.turn = 'player';
  renderCombat();
}

function doWinCombat(npc) {
  const reward = randInt(npc.minReward, npc.maxReward);
  character.cash += reward;
  const wasGoodFight = combatState.enemyKey === 'gangster' || combatState.enemyKey === 'thug';
  if (wasGoodFight) allianceBuff(); else allianceDebuff();
  combatState.active = false;
  combatState.turn = null;
  character.cooldowns.combat = Date.now();
  return { reward };
}

function winCombat(npc) {
  const result = doWinCombat(npc);
  logTo(combatLog, `You knocked out the ${npc.name}! +${result.reward} Floydbucks.`, 'gain');
  save();
  renderAll();
  renderCombat();
}

function doLoseCombat() {
  const toughness = Math.min(0.5, character.stats.health / 200); // high HP means you protect more of your cash
  const lost = Math.min(character.cash, Math.round(randInt(10, 40) * (1 - toughness)));
  character.cash -= lost;
  combatState.active = false;
  combatState.turn = null;
  character.cooldowns.combat = Date.now();
  return { lost };
}

function loseCombat(npc) {
  const result = doLoseCombat();
  logTo(combatLog, `The ${npc.name} beat you down and took ${result.lost} Floydbucks.`, 'loss');
  save();
  renderAll();
  renderCombat();
}

function doFlee() {
  combatState.active = false;
  combatState.turn = null;
  character.cooldowns.combat = Date.now();
}

btnFlee.addEventListener('click', () => {
  if (!combatState.active) return;
  doFlee();
  logTo(combatLog, 'You fled the fight.', '');
  renderCombat();
});

btnChatSend.addEventListener('click', sendChatMessage);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const text = chatInputEl.value.trim();
  if (!text) return;
  const p = document.createElement('p');
  const fullName = `${character.firstName} ${character.lastName}`;
  const label = `${fullName}(You) ${allianceLabel(character.alliance)}, Lv. ${computeLevel()}`;
  p.textContent = `${label}: ${text}`;
  chatMessagesEl.appendChild(p);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  chatInputEl.value = '';
}

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
  if (!status.any || Math.random() >= 0.5) return { caught: false };

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
  character.jail.inJail = true;
  character.jail.crime = 'Illegal Firearm Possession';
  character.jail.yearsRemaining = JAIL_YEARS_WEAPON;
  character.jail.serving = false;
  combatState.active = false;
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

function doCityHallRename(first, last) {
  if (!first || !last) return { ok: false, reason: 'Enter both a first and last name.' };
  if (first.length > 10 || last.length > 10) return { ok: false, reason: 'Names must be 10 characters or fewer.' };
  if (character.cash < RENAME_COST) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= RENAME_COST;
  character.firstName = first;
  character.lastName = last;
  return { ok: true, message: `Name legally changed to ${first} ${last}.`, cls: 'gain' };
}

btnCityHallRename.addEventListener('click', () => {
  attemptMilosAction(() => {
    const result = doCityHallRename(cityHallFirstNameInput.value.trim(), cityHallLastNameInput.value.trim());
    if (!result.ok) { alert(result.reason); return; }
    logTo(cityHallLog, result.message, result.cls);
    cityHallFirstNameInput.value = '';
    cityHallLastNameInput.value = '';
    save();
    renderAll();
  }, cityHallLog);
});

function doMarriagePropose(name) {
  if (!name) return { ok: false };
  character.marriage.proposedTo = name;
  return { ok: true, message: `Proposal sent to ${name}. They'll see it in their City Hall once multiplayer is live.`, cls: 'gain' };
}

btnMarriagePropose.addEventListener('click', () => {
  attemptMilosAction(() => {
    const result = doMarriagePropose(marriageProposeInput.value.trim());
    if (!result.ok) return;
    logTo(cityHallLog, result.message, result.cls);
    marriageProposeInput.value = '';
    save();
    renderAll();
  }, cityHallLog);
});

function doGunSafetyResult(passed) {
  if (passed) {
    character.licenses.gunSafety = true;
    return { message: 'Gun Safety Course passed! License granted.', cls: 'gain' };
  }
  return { message: 'Gun Safety Course failed. You can try again anytime.', cls: 'loss' };
}

btnStartGunSafety.addEventListener('click', () => {
  attemptMilosAction(() => {
    openQuiz('Gun Safety Course', GUN_SAFETY_QUESTIONS, 0.7, (passed) => {
      const result = doGunSafetyResult(passed);
      logTo(cityHallLog, result.message, result.cls);
      save();
      renderAll();
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
  pistolGrid.innerHTML = PISTOL_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.caliber} pistol. Can be holstered (concealed) or open carried.</p>
      ${lockedNote}
      <button data-gun="${item.id}" ${hasLicense ? '' : 'disabled'}>Buy ($${item.cost.toLocaleString()})</button>
    </div>
  `).join('');
  rifleGrid.innerHTML = RIFLE_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.caliber} rifle. Cannot be holstered &mdash; open carry only.</p>
      ${lockedNote}
      <button data-gun="${item.id}" ${hasLicense ? '' : 'disabled'}>Buy ($${item.cost.toLocaleString()})</button>
    </div>
  `).join('');

  [...pistolGrid.querySelectorAll('button[data-gun]'), ...rifleGrid.querySelectorAll('button[data-gun]')].forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!character.licenses.gunSafety) return;
      const item = GUN_ITEMS_BY_ID[btn.dataset.gun];
      attemptMilosAction(() => {
        const result = doBuyGun(item.id);
        if (!result.ok) { alert(result.reason); return; }
        logTo(gunClubLog, result.message, result.cls);
        save();
        renderAll();
      }, gunClubLog);
    });
  });

  buildAmmoGrid();
  buildMeleeGrid();
}

function doBuyGun(itemId) {
  const item = GUN_ITEMS_BY_ID[itemId];
  if (!item) return { ok: false };
  if (character.cash < item.cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= item.cost;
  addToInventory(item.id, 1);
  return { ok: true, message: `Purchased a ${item.name}. It's in your Inventory &mdash; equip it to carry it.`, cls: 'gain' };
}

const meleeGrid = document.getElementById('meleeGrid');

function buildMeleeGrid() {
  if (!meleeGrid) return;
  meleeGrid.innerHTML = MELEE_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>+${item.atkBonus} Attack in a fight. No license needed &mdash; legal to carry, cheaper than a gun.</p>
      <button data-melee="${item.id}">Buy ($${item.cost.toLocaleString()})</button>
    </div>
  `).join('');

  meleeGrid.querySelectorAll('button[data-melee]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = doBuyMelee(btn.dataset.melee);
      if (!result.ok) { alert(result.reason); return; }
      logTo(gunClubLog, result.message, result.cls);
      save();
      renderAll();
    });
  });
}

function doBuyMelee(itemId) {
  const item = MELEE_ITEMS_BY_ID[itemId];
  if (!item) return { ok: false };
  if (character.cash < item.cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= item.cost;
  addToInventory(item.id, 1);
  return { ok: true, message: `Purchased a ${item.name}. It's in your Inventory &mdash; equip it to carry it.`, cls: 'gain' };
}

const ammoGrid = document.getElementById('ammoGrid');

function buildAmmoGrid() {
  if (!ammoGrid) return;
  ammoGrid.innerHTML = AMMO_ITEMS.map((item) => `
    <div class="hustle-card">
      <h3>${item.name}</h3>
      <p>${item.caliber} ammo.</p>
      <button data-ammo="${item.id}">Buy ($${item.cost.toLocaleString()})</button>
    </div>
  `).join('');

  ammoGrid.querySelectorAll('button[data-ammo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      attemptMilosAction(() => {
        const result = doBuyAmmo(btn.dataset.ammo);
        if (!result.ok) { alert(result.reason); return; }
        logTo(gunClubLog, result.message, result.cls);
        save();
        renderAll();
      }, gunClubLog);
    });
  });
}

function doBuyAmmo(itemId) {
  const item = AMMO_ITEMS_BY_ID[itemId];
  if (!item) return { ok: false };
  if (character.cash < item.cost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= item.cost;
  addToInventory(item.id, 1);
  return { ok: true, message: `Purchased a ${item.name}.`, cls: 'gain' };
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

function doApplyConcealedPermit() {
  if (!character.licenses.gunSafety) return { ok: false, reason: 'Take the Gun Safety Course at City Hall first.' };
  if (character.licenses.concealedPermit) return { ok: false };
  if (character.licenses.concealedPendingUntil > Date.now()) return { ok: false };
  if (character.cash < CONCEALED_APPLY_COST) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= CONCEALED_APPLY_COST;
  character.licenses.concealedPendingUntil = Date.now() + CONCEALED_WAIT_MS;
  return { ok: true, message: `Applied for a Concealed Carry Permit for $${CONCEALED_APPLY_COST.toLocaleString()}. Approval in 10 minutes.`, cls: 'gain' };
}

btnConcealedFreeWait.addEventListener('click', () => {
  attemptMilosAction(() => {
    const result = doApplyConcealedPermit();
    if (!result.ok) { if (result.reason) alert(result.reason); return; }
    logTo(gunClubLog, result.message, result.cls);
    save();
    renderAll();
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

function doRangeShoot(weaponId) {
  const weaponName = getItemDef(weaponId)?.name || 'weapon';
  const score = Math.round((Math.random() * 0.09 + 0.01) * 100) / 100;
  character.weaponSkills.shooting = clampStat(character.weaponSkills.shooting + score);
  character.cooldowns.rangeShoot = Date.now();
  const flavor = score >= 0.09 ? 'Bullseye!' : score >= 0.05 ? 'Solid hit.' : 'Grazed it.';
  return { message: `Fired the ${weaponName}: +${score.toFixed(2)} SHOOTING. ${flavor}`, cls: 'gain' };
}

btnRangeShoot.addEventListener('click', () => {
  if (!rangeWeaponSelect.value) return;
  if (getRemainingCooldown('rangeShoot', RANGE_COOLDOWN_MS) > 0) return;

  attemptMilosAction(() => {
    const result = doRangeShoot(rangeWeaponSelect.value);
    logTo(rangeLog, result.message, result.cls);
    save();
    renderAll();
  }, rangeLog);
});

function doRangeDraw() {
  character.weaponSkills.draw = clampStat(character.weaponSkills.draw + 0.01);
  character.cooldowns.rangeDraw = Date.now();
}

btnRangeDraw.addEventListener('click', () => {
  if (!rangeWeaponSelect.value) return;
  if (getRemainingCooldown('rangeDraw', RANGE_COOLDOWN_MS) > 0) return;

  attemptMilosAction(() => {
    doRangeDraw();
    logTo(rangeLog, '+0.01 DRAW.', 'gain');
    save();
    renderAll();
  }, rangeLog);
});

function doRangeReload() {
  character.weaponSkills.magReload = clampStat(character.weaponSkills.magReload + 0.01);
  character.cooldowns.rangeReload = Date.now();
}

btnRangeReload.addEventListener('click', () => {
  if (!rangeWeaponSelect.value) return;
  if (getRemainingCooldown('rangeReload', RANGE_COOLDOWN_MS) > 0) return;

  attemptMilosAction(() => {
    doRangeReload();
    logTo(rangeLog, '+0.01 MAG RELOAD.', 'gain');
    save();
    renderAll();
  }, rangeLog);
});

