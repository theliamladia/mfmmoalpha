// ---------- bank ----------
const bankTierName = document.getElementById('bankTierName');
const bankBalanceEl = document.getElementById('bankBalance');
const bankMaxEl = document.getElementById('bankMax');
const bankDepositAmount = document.getElementById('bankDepositAmount');
const btnBankDeposit = document.getElementById('btnBankDeposit');
const btnBankWithdraw = document.getElementById('btnBankWithdraw');
const bankUpgradeDesc = document.getElementById('bankUpgradeDesc');
const btnBankUpgrade = document.getElementById('btnBankUpgrade');
const bankCreditCardName = document.getElementById('bankCreditCardName');
const bankCreditDesc = document.getElementById('bankCreditDesc');
const btnBankApplyCredit = document.getElementById('btnBankApplyCredit');
const bankCreditStatus = document.getElementById('bankCreditStatus');
const bankCreditLimitEl = document.getElementById('bankCreditLimit');
const bankCreditOwedEl = document.getElementById('bankCreditOwed');
const bankAdvanceAmount = document.getElementById('bankAdvanceAmount');
const btnBankCashAdvance = document.getElementById('btnBankCashAdvance');
const btnBankPayCredit = document.getElementById('btnBankPayCredit');
const bankBillNote = document.getElementById('bankBillNote');
const bankLog = document.getElementById('bankLog');

function bankCreditLimit() {
  return Math.round(character.bank.balance * BANK_CREDIT_LIMIT_PCT);
}

// Advances one billing period and applies its draft. No DOM access — safe to run headless.
function doBankBillingCycle() {
  const bank = character.bank;
  bank.lastBillTs += BANK_BILLING_INTERVAL_MS;
  const owed = bank.creditBalance;
  if (owed <= 0) return { billed: false };

  if (bank.balance >= owed) {
    bank.balance = round2(bank.balance - owed);
    bank.creditBalance = 0;
    return { billed: true, jailed: false, message: `Credit card auto-paid: $${owed.toFixed(2)} drafted from your bank balance.`, cls: 'gain' };
  }

  bank.creditBalance = 0;
  character.cash = round2(Math.max(0, character.cash - owed));
  character.jail.inJail = true;
  character.jail.crime = 'Credit Default';
  character.jail.yearsRemaining = BANK_DEFAULT_JAIL_YEARS;
  character.jail.serving = false;
  return { billed: true, jailed: true, message: `Insufficient bank balance for your $${owed.toFixed(2)} credit card draft! Cash seized and you've been arrested.`, cls: 'loss' };
}

function processBankBilling() {
  const bank = character.bank;
  if (character.jail.inJail) return;
  while (Date.now() - bank.lastBillTs >= BANK_BILLING_INTERVAL_MS) {
    const result = doBankBillingCycle();
    if (!result.billed) continue;
    logTo(bankLog, result.message, result.cls);
    if (result.jailed) {
      save();
      goToJail(true);
      return;
    }
  }
  save();
}

function renderBank() {
  if (!bankTierName) return;
  const bank = character.bank;
  const tier = BANK_TIERS[bank.tier];
  const nextTier = BANK_TIERS[bank.tier + 1];

  bankTierName.textContent = tier.name;
  bankBalanceEl.textContent = bank.balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
  bankMaxEl.textContent = tier.maxBalance.toLocaleString();

  if (nextTier) {
    bankUpgradeDesc.textContent = `Upgrade to ${nextTier.name} (max $${nextTier.maxBalance.toLocaleString()}) for $${nextTier.upgradeCost.toLocaleString()}.`;
    btnBankUpgrade.textContent = `Upgrade ($${nextTier.upgradeCost.toLocaleString()})`;
    btnBankUpgrade.disabled = character.jail.inJail;
  } else {
    bankUpgradeDesc.textContent = 'You have the highest tier account available.';
    btnBankUpgrade.textContent = 'Maxed Out';
    btnBankUpgrade.disabled = true;
  }

  btnBankDeposit.disabled = character.jail.inJail;
  btnBankWithdraw.disabled = character.jail.inJail;

  bankCreditCardName.textContent = bank.hasCreditCard ? tier.cardName : 'Credit Card';

  if (bank.hasCreditCard) {
    btnBankApplyCredit.classList.add('hidden');
    bankCreditDesc.classList.add('hidden');
    bankCreditStatus.classList.remove('hidden');
    bankAdvanceAmount.classList.remove('hidden');
    btnBankCashAdvance.classList.remove('hidden');
    btnBankPayCredit.classList.remove('hidden');
    bankBillNote.classList.remove('hidden');
    bankCreditLimitEl.textContent = bankCreditLimit().toLocaleString();
    bankCreditOwedEl.textContent = bank.creditBalance.toFixed(2);
    btnBankCashAdvance.disabled = character.jail.inJail || bankCreditLimit() - bank.creditBalance <= 0;
    btnBankPayCredit.disabled = character.jail.inJail || bank.creditBalance <= 0;
  } else {
    btnBankApplyCredit.classList.remove('hidden');
    bankCreditDesc.classList.remove('hidden');
    bankCreditStatus.classList.add('hidden');
    bankAdvanceAmount.classList.add('hidden');
    btnBankCashAdvance.classList.add('hidden');
    btnBankPayCredit.classList.add('hidden');
    bankBillNote.classList.add('hidden');
    btnBankApplyCredit.disabled = character.jail.inJail || bank.balance <= 0;
  }
}

// Bank actions are server-authoritative -- same request/response shape as the hustles/gym/market.
async function runBankAction(apiFn, onSuccess) {
  try {
    const result = await apiFn();
    character = result.character;
    (result.messages || [{ message: result.message, cls: result.cls }]).forEach((e) => logTo(bankLog, e.message, e.cls));
    if (onSuccess) onSuccess();
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

btnBankDeposit.addEventListener('click', () => {
  const amount = Math.max(0, +bankDepositAmount.value || 0);
  runBankAction(() => apiBankDeposit(amount), () => { bankDepositAmount.value = ''; });
});

btnBankWithdraw.addEventListener('click', () => {
  const amount = Math.max(0, +bankDepositAmount.value || 0);
  runBankAction(() => apiBankWithdraw(amount), () => { bankDepositAmount.value = ''; });
});

btnBankUpgrade.addEventListener('click', () => runBankAction(apiBankUpgrade));

btnBankApplyCredit.addEventListener('click', () => runBankAction(apiBankApplyCredit));

btnBankCashAdvance.addEventListener('click', () => {
  const amount = Math.max(0, +bankAdvanceAmount.value || 0);
  runBankAction(() => apiBankCashAdvance(amount), () => { bankAdvanceAmount.value = ''; });
});

btnBankPayCredit.addEventListener('click', () => runBankAction(apiBankPayCredit));

function renderRankBadge() {
  const display = getDisplayTitle();
  rankBadgeEl.innerHTML = '';
  if (display) {
    rankBadgeEl.className = 'badge-slot';
    rankBadgeEl.innerHTML = titleHoverMarkup(display);
  } else {
    rankBadgeEl.className = 'badge badge-default-rank';
    rankBadgeEl.textContent = computeRank();
  }
}

// Which crate groups are currently expanded -- closed by default (see renderTitleDropdown), and
// this persists across re-renders so equipping a title or reopening the dropdown doesn't collapse
// whatever the player already had open.
const expandedTitleGroups = new Set();

function renderTitleDropdown() {
  checkPeakTitleGrant();
  const owned = ownedTitleDefs();
  const noneItem = `<div class="title-dropdown-item ${!character.titles.equipped ? 'equipped' : ''}" data-equip="none">${computeRank()} (default)</div>`;

  // Grouped by crate (Open Beta / GOOD Season 1 / Anima / Counterfinish), with everything else
  // (purchased, PEAK CIVILIAN, leaderboard/achievement, custom) bucketed under "Other Titles" --
  // insertion order within TITLE_CRATE_GROUPS, "Other Titles" last. Each group is a closed
  // dropdown of its own so a player with a lot of crate titles doesn't get a wall of badges.
  const groups = new Map();
  owned.forEach((t) => {
    const label = titleCrateGroupLabel(t);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  });
  // Within each crate group, highest rarity first then highest prestige first, instead of
  // whatever order they happened to be won/acquired in.
  groups.forEach((items) => items.sort(compareTitleStacksByRarityThenPrestige((t) => t.id, (t) => t)));
  const orderedLabels = [...TITLE_CRATE_GROUPS.map((g) => g.label), OTHER_TITLES_LABEL].filter((l) => groups.has(l));

  const groupsHtml = orderedLabels.map((label) => {
    const items = groups.get(label);
    const isExpanded = expandedTitleGroups.has(label);
    const equippedInGroup = items.some((t) => character.titles.equipped === t.id);
    const itemsHtml = items.map((t) => `
      <div class="title-dropdown-item ${character.titles.equipped === t.id ? 'equipped' : ''}" data-equip="${t.id}">
        ${titleHoverMarkup(t)}
      </div>
    `).join('');
    return `
      <div class="title-dropdown-group-header ${equippedInGroup ? 'has-equipped' : ''}" data-group-toggle="${escapeHtml(label)}">
        <span>${label}</span>
        <span class="title-dropdown-group-count">${items.length}</span>
        <span class="title-dropdown-group-chevron ${isExpanded ? 'open' : ''}">▾</span>
      </div>
      <div class="title-dropdown-group-items ${isExpanded ? '' : 'hidden'}">${itemsHtml}</div>
    `;
  }).join('');

  titleDropdown.innerHTML = noneItem + groupsHtml;

  titleDropdown.querySelectorAll('[data-group-toggle]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const label = el.dataset.groupToggle;
      if (expandedTitleGroups.has(label)) expandedTitleGroups.delete(label);
      else expandedTitleGroups.add(label);
      renderTitleDropdown();
    });
  });

  titleDropdown.querySelectorAll('[data-equip]').forEach((el) => {
    el.addEventListener('click', () => {
      doEquipTitle(el.dataset.equip);
      save();
      renderAll();
      titleDropdown.classList.add('hidden');
    });
  });
}

function doEquipTitle(id) {
  character.titles.equipped = id === 'none' ? null : id;
}

btnTitleChevron.addEventListener('click', (e) => {
  e.stopPropagation();
  const willShow = titleDropdown.classList.contains('hidden');
  titleDropdown.classList.add('hidden');
  if (willShow) {
    renderTitleDropdown();
    titleDropdown.classList.remove('hidden');
  }
});

document.addEventListener('click', (e) => {
  if (!titleDropdown.classList.contains('hidden') && !titleDropdown.contains(e.target) && e.target !== btnTitleChevron) {
    titleDropdown.classList.add('hidden');
  }
});

