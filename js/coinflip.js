// ---------- Coinflip lobbies ----------
// Server-authoritative: create/join deduct or credit cash and return the updated character; the
// flip animation here is purely cosmetic since the result is already decided by the time it plays.
const coinflipWagerInput = document.getElementById('coinflipWagerInput');
const coinflipSideBtns = document.querySelectorAll('.coinflip-side-btn');
const btnCoinflipCreate = document.getElementById('btnCoinflipCreate');
const coinflipLobbiesGrid = document.getElementById('coinflipLobbiesGrid');
const coinflipLog = document.getElementById('coinflipLog');
const coinflipAnimation = document.getElementById('coinflipAnimation');
const coinflipCoin = document.getElementById('coinflipCoin');
const coinflipResultText = document.getElementById('coinflipResultText');

let selectedCoinflipSide = 'heads';
let coinflipLobbiesCache = [];
let coinflipPollInterval = null;
const COINFLIP_POLL_MS = 10000;

coinflipSideBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    coinflipSideBtns.forEach((b) => b.classList.toggle('active', b === btn));
    selectedCoinflipSide = btn.dataset.side;
  });
});

function renderCoinflipLobbies() {
  if (!coinflipLobbiesGrid) return;
  const myName = `${character.firstName} ${character.lastName}`;
  if (coinflipLobbiesCache.length === 0) {
    coinflipLobbiesGrid.innerHTML = '<p>No open lobbies right now.</p>';
    return;
  }
  coinflipLobbiesGrid.innerHTML = coinflipLobbiesCache.map((lobby) => {
    const isMine = lobby.creatorName === myName;
    return `
      <div class="hustle-card" data-lobby-id="${lobby.id}">
        <h3>🪙 ${lobby.creatorName}</h3>
        <p>Wager: $${lobby.wager.toFixed(2)} &mdash; Called <b>${lobby.creatorSide}</b></p>
        ${isMine
          ? `<button class="coinflip-cancel-btn" data-lobby-id="${lobby.id}">Cancel</button>`
          : `<button class="coinflip-join-btn" data-lobby-id="${lobby.id}">Join &amp; Flip</button>`}
      </div>
    `;
  }).join('');

  coinflipLobbiesGrid.querySelectorAll('.coinflip-join-btn').forEach((btn) => {
    btn.addEventListener('click', () => joinCoinflipLobby(Number(btn.dataset.lobbyId)));
  });
  coinflipLobbiesGrid.querySelectorAll('.coinflip-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => cancelCoinflipLobby(Number(btn.dataset.lobbyId)));
  });
}

async function refreshCoinflipLobbies() {
  if (!getAuthToken()) return;
  try {
    const result = await apiCoinflipLobbies();
    coinflipLobbiesCache = result.lobbies;
  } catch {
    // Best-effort, same as the other polled lists.
  }
  renderCoinflipLobbies();
}

function setCoinflipTabVisible(visible) {
  if (visible) {
    refreshCoinflipLobbies();
    if (!coinflipPollInterval) coinflipPollInterval = setInterval(refreshCoinflipLobbies, COINFLIP_POLL_MS);
  } else if (coinflipPollInterval) {
    clearInterval(coinflipPollInterval);
    coinflipPollInterval = null;
  }
}

btnCoinflipCreate.addEventListener('click', async () => {
  const wager = Number(coinflipWagerInput.value);
  if (!(wager > 0)) {
    logTo(coinflipLog, 'Enter a valid wager.', 'loss');
    return;
  }
  try {
    const result = await apiCoinflipCreate(wager, selectedCoinflipSide);
    character = result.character;
    save();
    renderAll();
    coinflipLobbiesCache = result.lobbies;
    renderCoinflipLobbies();
    logTo(coinflipLog, `Created a coinflip lobby for $${wager.toFixed(2)} on ${selectedCoinflipSide}.`, 'gain');
  } catch (err) {
    logTo(coinflipLog, err.reason || 'Something went wrong.', 'loss');
  }
});

function playCoinflipAnimation(resultSide, won, message) {
  coinflipAnimation.classList.remove('hidden');
  coinflipCoin.classList.remove('coinflip-spin');
  // Force reflow so the animation class can be re-added on repeat flips.
  void coinflipCoin.offsetWidth;
  coinflipCoin.classList.add('coinflip-spin');
  coinflipResultText.textContent = '';
  setTimeout(() => {
    coinflipCoin.textContent = resultSide === 'heads' ? '🪙 HEADS' : '🪙 TAILS';
    coinflipResultText.textContent = message;
    coinflipResultText.className = won ? 'gain' : 'loss';
  }, 900);
}

async function joinCoinflipLobby(lobbyId) {
  try {
    const result = await apiCoinflipJoin(lobbyId);
    character = result.character;
    save();
    renderAll();
    coinflipLobbiesCache = result.lobbies;
    renderCoinflipLobbies();
    // The joiner always takes the side opposite the creator (a flip only has two outcomes), so
    // the joiner wins exactly when the result differs from the creator's called side.
    const won = result.lobby.resultSide !== result.lobby.creatorSide;
    playCoinflipAnimation(result.lobby.resultSide, won, won ? 'You won the flip!' : 'You lost the flip.');
    logTo(coinflipLog, `Flip landed on ${result.lobby.resultSide}. ${won ? 'You won!' : 'You lost.'}`, won ? 'gain' : 'loss');
  } catch (err) {
    logTo(coinflipLog, err.reason || 'Something went wrong.', 'loss');
    if (err.character) {
      character = err.character;
      save();
      renderAll();
    }
    refreshCoinflipLobbies();
  }
}

async function cancelCoinflipLobby(lobbyId) {
  try {
    const result = await apiCoinflipCancel(lobbyId);
    character = result.character;
    save();
    renderAll();
    coinflipLobbiesCache = result.lobbies;
    renderCoinflipLobbies();
    logTo(coinflipLog, 'Lobby cancelled and wager refunded.', 'gain');
  } catch (err) {
    logTo(coinflipLog, err.reason || 'Something went wrong.', 'loss');
  }
}
