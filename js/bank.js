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

function doBankDeposit(amount) {
  const bank = character.bank;
  const tier = BANK_TIERS[bank.tier];
  if (amount <= 0) return { ok: false };
  if (amount > character.cash) return { ok: false, reason: 'Not enough Floydbucks on hand.' };
  const room = tier.maxBalance - bank.balance;
  if (room <= 0) return { ok: false, reason: 'Your account is already at its max balance. Upgrade to deposit more.' };
  const deposited = Math.min(amount, room);
  character.cash = round2(character.cash - deposited);
  bank.balance = round2(bank.balance + deposited);
  return { ok: true, message: `Deposited $${deposited.toFixed(2)}.`, cls: 'gain' };
}

btnBankDeposit.addEventListener('click', () => {
  const amount = Math.max(0, +bankDepositAmount.value || 0);
  const result = doBankDeposit(amount);
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  logTo(bankLog, result.message, result.cls);
  bankDepositAmount.value = '';
  save();
  renderAll();
});

function doBankWithdraw(amount) {
  const bank = character.bank;
  if (amount <= 0) return { ok: false };
  if (amount > bank.balance) return { ok: false, reason: 'Not enough in your bank balance.' };
  bank.balance = round2(bank.balance - amount);
  character.cash = round2(character.cash + amount);
  return { ok: true, message: `Withdrew $${amount.toFixed(2)}.`, cls: 'gain' };
}

btnBankWithdraw.addEventListener('click', () => {
  const amount = Math.max(0, +bankDepositAmount.value || 0);
  const result = doBankWithdraw(amount);
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  logTo(bankLog, result.message, result.cls);
  bankDepositAmount.value = '';
  save();
  renderAll();
});

function doBankUpgrade() {
  const bank = character.bank;
  const nextTier = BANK_TIERS[bank.tier + 1];
  if (!nextTier) return { ok: false };
  if (character.cash < nextTier.upgradeCost) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash = round2(character.cash - nextTier.upgradeCost);
  bank.tier += 1;
  const entries = [{ message: `Upgraded to ${nextTier.name}!`, cls: 'gain' }];
  if (nextTier === BANK_TIERS[BANK_TIERS.length - 1]) {
    addToInventory(CAESAR_TI_TITLE.id, 1);
    entries.push({ message: `${CAESAR_TI_TITLE.name} title added to your Inventory.`, cls: 'gain' });
  }
  return { ok: true, entries };
}

btnBankUpgrade.addEventListener('click', () => {
  const result = doBankUpgrade();
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  result.entries.forEach((e) => logTo(bankLog, e.message, e.cls));
  save();
  renderAll();
});

function doBankApplyCredit() {
  const bank = character.bank;
  if (bank.balance <= 0) return { ok: false, reason: 'You need a bank balance to qualify for a credit card.' };
  bank.hasCreditCard = true;
  return { ok: true, message: `Credit card approved with a $${bankCreditLimit().toLocaleString()} limit.`, cls: 'gain' };
}

btnBankApplyCredit.addEventListener('click', () => {
  const result = doBankApplyCredit();
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  logTo(bankLog, result.message, result.cls);
  save();
  renderAll();
});

function doBankCashAdvance(amount) {
  const bank = character.bank;
  const available = bankCreditLimit() - bank.creditBalance;
  const clamped = Math.max(0, Math.min(available, amount));
  if (clamped <= 0) return { ok: false };
  bank.creditBalance = round2(bank.creditBalance + clamped);
  character.cash = round2(character.cash + clamped);
  return { ok: true, message: `Cash advance: +$${clamped.toFixed(2)}. Owed $${bank.creditBalance.toFixed(2)}.`, cls: 'gain' };
}

btnBankCashAdvance.addEventListener('click', () => {
  const amount = Math.max(0, +bankAdvanceAmount.value || 0);
  const result = doBankCashAdvance(amount);
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  logTo(bankLog, result.message, result.cls);
  bankAdvanceAmount.value = '';
  save();
  renderAll();
});

function doBankPayCredit() {
  const bank = character.bank;
  const amount = Math.min(bank.creditBalance, character.cash);
  if (amount <= 0) return { ok: false, reason: 'Not enough Floydbucks on hand.' };
  character.cash = round2(character.cash - amount);
  bank.creditBalance = round2(bank.creditBalance - amount);
  return { ok: true, message: `Paid off $${amount.toFixed(2)} of your credit card balance.`, cls: 'gain' };
}

btnBankPayCredit.addEventListener('click', () => {
  const result = doBankPayCredit();
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  logTo(bankLog, result.message, result.cls);
  save();
  renderAll();
});

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

function renderTitleDropdown() {
  checkPeakTitleGrant();
  const owned = allTitleDefs().filter((t) => isTitleOwned(t.id));
  const noneItem = `<div class="title-dropdown-item ${!character.titles.equipped ? 'equipped' : ''}" data-equip="none">${computeRank()} (default)</div>`;
  const items = owned.map((t) => `
    <div class="title-dropdown-item ${character.titles.equipped === t.id ? 'equipped' : ''}" data-equip="${t.id}">
      ${titleHoverMarkup(t)}
    </div>
  `).join('');
  titleDropdown.innerHTML = noneItem + items;

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

