// ---------- admin ----------
const ADMIN_PASSWORD = 'fishdoc15!';

const btnAdmin = document.getElementById('btnAdmin');
const adminPasswordModal = document.getElementById('adminPasswordModal');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminPasswordError = document.getElementById('adminPasswordError');
const btnAdminPasswordSubmit = document.getElementById('btnAdminPasswordSubmit');
const btnAdminPasswordCancel = document.getElementById('btnAdminPasswordCancel');

const adminMenuModal = document.getElementById('adminMenuModal');
const btnAdminClose = document.getElementById('btnAdminClose');
const adminCashInput = document.getElementById('adminCashInput');
const adminChipsInput = document.getElementById('adminChipsInput');
const adminWeightInput = document.getElementById('adminWeightInput');
const adminStatInput = document.getElementById('adminStatInput');
const btnAdminAddCash = document.getElementById('btnAdminAddCash');
const btnAdminAddChips = document.getElementById('btnAdminAddChips');
const btnAdminAddWeight = document.getElementById('btnAdminAddWeight');
const btnAdminAddStats = document.getElementById('btnAdminAddStats');
const adminAllianceButtons = document.querySelectorAll('.admin-alliance-buttons button');
const btnAdminMaxStats = document.getElementById('btnAdminMaxStats');
const btnAdminReleaseJail = document.getElementById('btnAdminReleaseJail');
const btnAdminGiveAdminTitle = document.getElementById('btnAdminGiveAdminTitle');

btnAdmin.addEventListener('click', () => {
  adminPasswordInput.value = '';
  adminPasswordError.textContent = '';
  adminPasswordModal.classList.remove('hidden');
  adminPasswordInput.focus();
});

btnAdminPasswordCancel.addEventListener('click', () => {
  adminPasswordModal.classList.add('hidden');
});

function submitAdminPassword() {
  if (adminPasswordInput.value === ADMIN_PASSWORD) {
    adminPasswordModal.classList.add('hidden');
    adminMenuModal.classList.remove('hidden');
  } else {
    adminPasswordError.textContent = 'Incorrect password.';
    adminPasswordInput.value = '';
  }
}

btnAdminPasswordSubmit.addEventListener('click', submitAdminPassword);
adminPasswordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitAdminPassword();
});

btnAdminClose.addEventListener('click', () => {
  adminMenuModal.classList.add('hidden');
});

btnAdminAddCash.addEventListener('click', () => {
  character.cash += Math.floor(+adminCashInput.value) || 0;
  save();
  renderAll();
});

btnAdminAddChips.addEventListener('click', () => {
  character.chips += Math.floor(+adminChipsInput.value) || 0;
  save();
  renderAll();
});

btnAdminAddWeight.addEventListener('click', () => {
  character.weightGained = Math.max(0, character.weightGained + (+adminWeightInput.value || 0));
  save();
  renderAll();
});

btnAdminAddStats.addEventListener('click', () => {
  const amount = +adminStatInput.value || 0;
  const s = character.stats;
  s.health = clampStat(s.health + amount);
  s.attack = clampStat(s.attack + amount);
  s.speed = clampStat(s.speed + amount);
  s.defense = clampStat(s.defense + amount);
  s.looks = clampStat(s.looks + amount);
  save();
  renderAll();
});

adminAllianceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    character.alliance = clampStat(+btn.dataset.alliance);
    save();
    renderAll();
  });
});

btnAdminMaxStats.addEventListener('click', () => {
  const s = character.stats;
  s.health = STAT_CAP;
  s.attack = STAT_CAP;
  s.speed = STAT_CAP;
  s.defense = STAT_CAP;
  s.looks = STAT_CAP;
  save();
  renderAll();
});

btnAdminReleaseJail.addEventListener('click', () => {
  if (!character.jail.inJail) return;
  releaseFromJail();
});

function doGiveAdminTitle() {
  addToInventory(ADMIN_TITLE.id, 1);
}

btnAdminGiveAdminTitle.addEventListener('click', () => {
  doGiveAdminTitle();
  save();
  renderAll();
  alert('ADMIN title added to your Inventory (Cosmetics). Multiplayer gifting to another player will work the same way once trading is live.');
});

// ---------- init ----------
(function init() {
  character = load();
  if (character) {
    showGame();
  }
})();
