// ---------- Player interaction menu (Pay / Rob / Fight) ----------
// Clicking another player's row in the online list opens this modal. Follows the same
// server-authoritative pattern as casino.js: call the api wrapper, apply the returned character.
const playerActionModal = document.getElementById('playerActionModal');
const playerActionTitle = document.getElementById('playerActionTitle');
const playerActionMenu = document.getElementById('playerActionMenu');
const playerActionPaySub = document.getElementById('playerActionPaySub');
const playerActionPayAmount = document.getElementById('playerActionPayAmount');
const playerActionMessage = document.getElementById('playerActionMessage');
const btnPlayerActionPay = document.getElementById('btnPlayerActionPay');
const btnPlayerActionRob = document.getElementById('btnPlayerActionRob');
const btnPlayerActionFight = document.getElementById('btnPlayerActionFight');
const btnPlayerActionPayBack = document.getElementById('btnPlayerActionPayBack');
const btnPlayerActionPaySubmit = document.getElementById('btnPlayerActionPaySubmit');
const btnPlayerActionClose = document.getElementById('btnPlayerActionClose');

let currentActionTargetUsername = null;

function openPlayerActionModal(username) {
  currentActionTargetUsername = username;
  const target = onlinePlayersCache.find((p) => p.username === username);
  const label = target
    ? styledNameHtml(target.character, `${target.character.firstName} ${target.character.lastName}`)
    : escapeHtml(username);
  playerActionTitle.innerHTML = label;
  playerActionMessage.textContent = '';
  playerActionPaySub.classList.add('hidden');
  playerActionMenu.classList.remove('hidden');
  playerActionModal.classList.remove('hidden');
}

function closePlayerActionModal() {
  playerActionModal.classList.add('hidden');
  currentActionTargetUsername = null;
}

btnPlayerActionClose.addEventListener('click', closePlayerActionModal);

btnPlayerActionPay.addEventListener('click', () => {
  playerActionMenu.classList.add('hidden');
  playerActionPaySub.classList.remove('hidden');
  playerActionPayAmount.value = '';
});

btnPlayerActionPayBack.addEventListener('click', () => {
  playerActionPaySub.classList.add('hidden');
  playerActionMenu.classList.remove('hidden');
});

btnPlayerActionPaySubmit.addEventListener('click', async () => {
  const amount = Number(playerActionPayAmount.value);
  if (!(amount > 0)) {
    playerActionMessage.textContent = 'Enter a valid amount.';
    return;
  }
  try {
    const result = await apiPayPlayer(currentActionTargetUsername, amount);
    character = result.character;
    save();
    renderAll();
    logTo(milosLog, result.message, result.cls);
    closePlayerActionModal();
  } catch (err) {
    playerActionMessage.textContent = err.reason || 'Something went wrong.';
  }
});

btnPlayerActionRob.addEventListener('click', async () => {
  try {
    const result = await apiRobPlayer(currentActionTargetUsername);
    character = result.character;
    save();
    renderAll();
    logTo(milosLog, result.message, result.cls);
    closePlayerActionModal();
  } catch (err) {
    playerActionMessage.textContent = err.reason || 'Something went wrong.';
  }
});

btnPlayerActionFight.addEventListener('click', async () => {
  try {
    const result = await apiDuelChallenge(currentActionTargetUsername);
    logTo(milosLog, `Challenged ${playerActionTitle.textContent} to a duel.`, 'gain');
    if (typeof startWatchingDuel === 'function') startWatchingDuel(result.duelId, currentActionTargetUsername);
    closePlayerActionModal();
  } catch (err) {
    playerActionMessage.textContent = err.reason || 'Something went wrong.';
  }
});
