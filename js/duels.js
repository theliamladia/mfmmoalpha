// ---------- PvP Duels ----------
// Turn-based, server-authoritative: duel state lives in a shared `duels` row, not character_json.
// Polls only while a duel is pending/active for this player -- not an always-on loop like chat.
const duelChallengeModal = document.getElementById('duelChallengeModal');
const duelChallengeText = document.getElementById('duelChallengeText');
const btnDuelChallengeAccept = document.getElementById('btnDuelChallengeAccept');
const btnDuelChallengeDecline = document.getElementById('btnDuelChallengeDecline');

const duelArenaModal = document.getElementById('duelArenaModal');
const duelOpponentName = document.getElementById('duelOpponentName');
const duelOpponentLabel = document.getElementById('duelOpponentLabel');
const duelYouHpBar = document.getElementById('duelYouHpBar');
const duelYouHpText = document.getElementById('duelYouHpText');
const duelOpponentHpBar = document.getElementById('duelOpponentHpBar');
const duelOpponentHpText = document.getElementById('duelOpponentHpText');
const duelControls = document.getElementById('duelControls');
const duelWaitingNote = document.getElementById('duelWaitingNote');
const duelLog = document.getElementById('duelLog');
const btnDuelForfeit = document.getElementById('btnDuelForfeit');
const btnDuelClose = document.getElementById('btnDuelClose');

const DUEL_POLL_MS = 2000;
let activeDuelId = null;
let duelPollInterval = null;
let pendingChallengeSeenId = null;
let lastDuelStatus = null;

function handlePendingDuelChallenge(pending) {
  if (activeDuelId) return; // already watching a duel of our own (as attacker or responder)
  if (!pending) {
    pendingChallengeSeenId = null;
    return;
  }
  if (pending.id === pendingChallengeSeenId) return;
  pendingChallengeSeenId = pending.id;
  duelChallengeText.textContent = `${pending.attackerName} has challenged you to a duel.`;
  duelChallengeModal.classList.remove('hidden');
  duelChallengeModal.dataset.duelId = pending.id;
}

btnDuelChallengeAccept.addEventListener('click', async () => {
  const duelId = Number(duelChallengeModal.dataset.duelId);
  duelChallengeModal.classList.add('hidden');
  try {
    await apiDuelRespond(duelId, true);
    startWatchingDuel(duelId);
  } catch (err) {
    logTo(milosLog, err.reason || 'Could not accept duel.', 'loss');
  }
});

btnDuelChallengeDecline.addEventListener('click', async () => {
  const duelId = Number(duelChallengeModal.dataset.duelId);
  duelChallengeModal.classList.add('hidden');
  try {
    await apiDuelRespond(duelId, false);
  } catch {
    // Best-effort -- the challenge will simply expire/no-op on the attacker's side.
  }
});

function startWatchingDuel(duelId) {
  activeDuelId = duelId;
  lastDuelStatus = null;
  duelLog.innerHTML = '';
  duelArenaModal.classList.remove('hidden');
  btnDuelClose.classList.add('hidden');
  pollActiveDuel();
  if (!duelPollInterval) duelPollInterval = setInterval(pollActiveDuel, DUEL_POLL_MS);
}

function stopWatchingDuel() {
  activeDuelId = null;
  if (duelPollInterval) {
    clearInterval(duelPollInterval);
    duelPollInterval = null;
  }
}

function renderDuel(duel) {
  const myUserId = getMyUserId();
  const iAmAttacker = duel.attackerUserId === myUserId;
  const myHp = iAmAttacker ? duel.attackerHp : duel.targetHp;
  const myMaxHp = iAmAttacker ? duel.attackerMaxHp : duel.targetMaxHp;
  const oppHp = iAmAttacker ? duel.targetHp : duel.attackerHp;
  const oppMaxHp = iAmAttacker ? duel.targetMaxHp : duel.attackerMaxHp;
  const oppName = iAmAttacker ? duel.targetName : duel.attackerName;

  duelOpponentName.textContent = oppName;
  duelOpponentLabel.textContent = oppName;
  duelYouHpText.textContent = Math.max(0, Math.round(myHp));
  duelYouHpBar.style.width = `${myMaxHp ? Math.max(0, (myHp / myMaxHp) * 100) : 0}%`;
  duelOpponentHpText.textContent = Math.max(0, Math.round(oppHp));
  duelOpponentHpBar.style.width = `${oppMaxHp ? Math.max(0, (oppHp / oppMaxHp) * 100) : 0}%`;

  const isMyTurn = duel.status === 'active' && duel.turnUserId === myUserId;
  duelControls.querySelectorAll('button[data-duel-action]').forEach((btn) => { btn.disabled = !isMyTurn; });
  btnDuelForfeit.disabled = duel.status !== 'active';
  duelWaitingNote.classList.toggle('hidden', duel.status !== 'active' || isMyTurn);

  if (duel.status !== lastDuelStatus) {
    lastDuelStatus = duel.status;
    if (duel.status === 'finished') {
      const won = duel.winnerUserId === myUserId;
      logTo(duelLog, won ? `You won the duel against ${oppName}!` : `You lost the duel against ${oppName}.`, won ? 'gain' : 'loss');
      logTo(milosLog, won ? `Won a duel against ${oppName}.` : `Lost a duel against ${oppName}.`, won ? 'gain' : 'loss');
      btnDuelClose.classList.remove('hidden');
      stopWatchingDuel();
    } else if (duel.status === 'declined') {
      logTo(duelLog, `${oppName} declined the duel.`, 'loss');
      btnDuelClose.classList.remove('hidden');
      stopWatchingDuel();
    }
  }
}

async function pollActiveDuel() {
  if (!activeDuelId) return;
  try {
    const result = await apiGetDuel(activeDuelId);
    renderDuel(result.duel);
  } catch {
    // Best-effort, same as the other polled views.
  }
}

duelControls.querySelectorAll('button[data-duel-action]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (!activeDuelId) return;
    try {
      const result = await apiDuelAction(activeDuelId, btn.dataset.duelAction);
      if (result.result) {
        const r = result.result;
        const text = r.dodged ? 'Dodged!' : r.missed ? 'Missed!' : r.jammed ? 'Weapon jammed!' : `${r.dmg} damage${r.riposted ? ' (riposte!)' : ''}`;
        logTo(duelLog, text, r.dmg > 0 ? 'gain' : '');
      }
      renderDuel(result.duel);
    } catch (err) {
      logTo(duelLog, err.reason || 'Something went wrong.', 'loss');
    }
  });
});

btnDuelForfeit.addEventListener('click', async () => {
  if (!activeDuelId) return;
  try {
    const result = await apiDuelForfeit(activeDuelId);
    renderDuel(result.duel);
  } catch (err) {
    logTo(duelLog, err.reason || 'Something went wrong.', 'loss');
  }
});

btnDuelClose.addEventListener('click', () => {
  duelArenaModal.classList.add('hidden');
});
