// ---------- Multiplayer casino tables (Blackjack + Roulette) ----------
// Server-authoritative, same style as casino.js: call the api wrapper, render whatever table
// state comes back. Polls only while seated at a table and this tab is visible.
const tableGamePicker = document.getElementById('tableGamePicker');
const btnJoinBjTable = document.getElementById('btnJoinBjTable');
const btnJoinRouletteTable = document.getElementById('btnJoinRouletteTable');
const tableRoom = document.getElementById('tableRoom');
const tableCountdownEl = document.getElementById('tableCountdown');
const tableSeatsEl = document.getElementById('tableSeats');
const tableBjArea = document.getElementById('tableBjArea');
const tableBjDealerCardsEl = document.getElementById('tableBjDealerCards');
const tableBjPlayerCardsEl = document.getElementById('tableBjPlayerCards');
const tableBjDealerTotalEl = document.getElementById('tableBjDealerTotal');
const tableBjPlayerTotalEl = document.getElementById('tableBjPlayerTotal');
const tableBjBetInput = document.getElementById('tableBjBetInput');
const btnTableBjBet = document.getElementById('btnTableBjBet');
const btnTableBjHit = document.getElementById('btnTableBjHit');
const btnTableBjStand = document.getElementById('btnTableBjStand');
const tableRouletteArea = document.getElementById('tableRouletteArea');
const rouletteWheelEl = document.getElementById('rouletteWheel');
const rouletteResultTextEl = document.getElementById('rouletteResultText');
const rouletteBetGridEl = document.getElementById('rouletteBetGrid');
const rouletteBetAmountInput = document.getElementById('rouletteBetAmountInput');
const btnTableRouletteBet = document.getElementById('btnTableRouletteBet');
const btnLeaveTable = document.getElementById('btnLeaveTable');
const tableLog = document.getElementById('tableLog');

const TABLE_POLL_MS = 2000;
let currentTableId = null;
let currentTableGame = null;
let tablePollInterval = null;
let tablesTabVisible = false;
let lastTablePhase = null;
const selectedRouletteBets = [];

const ROULETTE_OUTSIDE_BETS = [
  { type: 'redblack', value: 'red', label: 'Red' },
  { type: 'redblack', value: 'black', label: 'Black' },
  { type: 'evenodd', value: 'even', label: 'Even' },
  { type: 'evenodd', value: 'odd', label: 'Odd' },
  { type: 'highlow', value: 'low', label: 'Low (1-18)' },
  { type: 'highlow', value: 'high', label: 'High (19-36)' },
];

function renderRouletteBetGrid() {
  rouletteBetGridEl.innerHTML = ROULETTE_OUTSIDE_BETS.map((b, i) => `
    <button class="roulette-bet-btn" data-bet-index="${i}">${b.label}</button>
  `).join('') + `
    <input type="number" id="rouletteStraightInput" min="0" max="36" placeholder="Straight # (0-36)" style="width:160px">
  `;

  rouletteBetGridEl.querySelectorAll('.roulette-bet-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.betIndex);
      const existingIdx = selectedRouletteBets.indexOf(idx);
      if (existingIdx >= 0) {
        selectedRouletteBets.splice(existingIdx, 1);
        btn.classList.remove('selected');
      } else {
        selectedRouletteBets.push(idx);
        btn.classList.add('selected');
      }
    });
  });
}
renderRouletteBetGrid();

function setCasinoTablesTabVisible(visible) {
  tablesTabVisible = visible;
  if (visible && currentTableId) {
    pollTable();
    if (!tablePollInterval) tablePollInterval = setInterval(pollTable, TABLE_POLL_MS);
  } else if (tablePollInterval) {
    clearInterval(tablePollInterval);
    tablePollInterval = null;
  }
}

function renderTableSeats(seats) {
  const myUserId = getMyUserId();
  const slots = [];
  for (let i = 0; i < 5; i += 1) {
    const seat = seats.find((s) => s.seatIndex === i);
    if (!seat) {
      slots.push('<div class="table-seat table-seat-empty">Empty</div>');
    } else {
      const you = seat.userId === myUserId;
      slots.push(`<div class="table-seat${you ? ' table-seat-you' : ''}">${seat.playerName}${you ? ' (you)' : ''}${seat.bet > 0 ? `<br>Bet: ${seat.bet}` : ''}</div>`);
    }
  }
  tableSeatsEl.innerHTML = slots.join('');
}

function renderBlackjackTable(result) {
  tableBjArea.classList.remove('hidden');
  tableRouletteArea.classList.add('hidden');
  const myUserId = getMyUserId();
  const mySeat = result.seats.find((s) => s.userId === myUserId);
  const myPhase = mySeat ? mySeat.bjPhase : null;
  const hideDealer = result.phase === 'in_round' && myPhase === 'playerTurn';

  renderCardRow(tableBjDealerCardsEl, result.dealerCards, hideDealer);
  tableBjDealerTotalEl.textContent = hideDealer ? '?' : (result.dealerCards.length ? handTotal(result.dealerCards) : '');

  const myCards = mySeat ? mySeat.bjCards : [];
  renderCardRow(tableBjPlayerCardsEl, myCards, false);
  tableBjPlayerTotalEl.textContent = myCards.length ? handTotal(myCards) : '';

  const canBet = result.phase === 'countdown' && mySeat && mySeat.bet === 0;
  const canPlay = result.phase === 'in_round' && myPhase === 'playerTurn';
  btnTableBjBet.disabled = !canBet;
  tableBjBetInput.disabled = !canBet;
  btnTableBjHit.disabled = !canPlay;
  btnTableBjStand.disabled = !canPlay;
}

function renderRouletteTable(result) {
  tableRouletteArea.classList.remove('hidden');
  tableBjArea.classList.add('hidden');
  rouletteResultTextEl.textContent = result.rouletteResult !== null && result.rouletteResult !== undefined
    ? `Last result: ${result.rouletteResult}`
    : '';

  const myUserId = getMyUserId();
  const mySeat = result.seats.find((s) => s.userId === myUserId);
  const canBet = result.phase === 'countdown' && mySeat && mySeat.rouletteBets.length === 0;
  btnTableRouletteBet.disabled = !canBet;
}

function renderTableState(result) {
  renderTableSeats(result.seats);
  const secondsLeft = result.roundEndsAt ? Math.max(0, Math.round((result.roundEndsAt - Date.now()) / 1000)) : 0;
  tableCountdownEl.textContent = result.phase === 'countdown'
    ? `Next round in ${secondsLeft}s`
    : result.phase === 'in_round'
      ? 'Round in progress...'
      : '';

  if (result.game === 'blackjack') renderBlackjackTable(result);
  else renderRouletteTable(result);

  if (result.lastRoundResult) {
    const myUserId = getMyUserId();
    if (result.lastRoundResult.blackjack) {
      const mine = result.lastRoundResult.blackjack.outcomes.find((o) => o.userId === myUserId);
      if (mine) logTo(tableLog, mine.message, mine.payout > 0 ? 'gain' : 'loss');
    }
    if (result.lastRoundResult.roulette) {
      const mine = result.lastRoundResult.roulette.outcomes.find((o) => o.userId === myUserId);
      if (mine) logTo(tableLog, `Landed on ${result.lastRoundResult.roulette.resultNumber}. ${mine.payout > 0 ? `Won ${mine.payout}!` : 'No win.'}`, mine.payout > 0 ? 'gain' : 'loss');
    }
  }
  lastTablePhase = result.phase;
}

async function pollTable() {
  if (!currentTableId) return;
  try {
    const result = await apiCasinoTableGet(currentTableId);
    renderTableState(result);
  } catch {
    // Best-effort, same as the other polled views.
  }
}

async function joinCasinoTable(game) {
  try {
    const result = await apiCasinoTableJoin(game);
    currentTableId = result.id;
    currentTableGame = game;
    tableGamePicker.classList.add('hidden');
    tableRoom.classList.remove('hidden');
    renderTableState(result);
    if (tablesTabVisible && !tablePollInterval) tablePollInterval = setInterval(pollTable, TABLE_POLL_MS);
  } catch (err) {
    logTo(tableLog, err.reason || 'Could not join table.', 'loss');
  }
}

btnJoinBjTable.addEventListener('click', () => joinCasinoTable('blackjack'));
btnJoinRouletteTable.addEventListener('click', () => joinCasinoTable('roulette'));

btnLeaveTable.addEventListener('click', async () => {
  if (!currentTableId) return;
  try {
    await apiCasinoTableLeave(currentTableId);
  } catch {
    // Best-effort -- still leave the UI even if the request fails.
  }
  currentTableId = null;
  currentTableGame = null;
  if (tablePollInterval) {
    clearInterval(tablePollInterval);
    tablePollInterval = null;
  }
  tableRoom.classList.add('hidden');
  tableGamePicker.classList.remove('hidden');
});

btnTableBjBet.addEventListener('click', async () => {
  const bet = Math.floor(Number(tableBjBetInput.value));
  if (!(bet > 0)) return;
  try {
    const result = await apiTableBjBet(currentTableId, bet);
    character = result.character;
    save();
    renderAll();
    renderTableState(result);
  } catch (err) {
    logTo(tableLog, err.reason || 'Could not place bet.', 'loss');
  }
});

btnTableBjHit.addEventListener('click', async () => {
  try {
    const result = await apiTableBjHit(currentTableId);
    renderTableState(result);
  } catch (err) {
    logTo(tableLog, err.reason || 'Could not hit.', 'loss');
  }
});

btnTableBjStand.addEventListener('click', async () => {
  try {
    const result = await apiTableBjStand(currentTableId);
    renderTableState(result);
  } catch (err) {
    logTo(tableLog, err.reason || 'Could not stand.', 'loss');
  }
});

btnTableRouletteBet.addEventListener('click', async () => {
  const amount = Math.floor(Number(rouletteBetAmountInput.value));
  if (!(amount > 0)) {
    logTo(tableLog, 'Enter a valid bet amount.', 'loss');
    return;
  }
  const bets = selectedRouletteBets.map((idx) => {
    const b = ROULETTE_OUTSIDE_BETS[idx];
    return { type: b.type, value: b.value, amount };
  });
  const straightInput = document.getElementById('rouletteStraightInput');
  if (straightInput && straightInput.value !== '') {
    bets.push({ type: 'straight', value: Number(straightInput.value), amount });
  }
  if (bets.length === 0) {
    logTo(tableLog, 'Select at least one bet.', 'loss');
    return;
  }
  try {
    const result = await apiTableRouletteBet(currentTableId, bets);
    character = result.character;
    save();
    renderAll();
    renderTableState(result);
    selectedRouletteBets.length = 0;
    rouletteBetGridEl.querySelectorAll('.roulette-bet-btn.selected').forEach((b) => b.classList.remove('selected'));
    if (straightInput) straightInput.value = '';
  } catch (err) {
    logTo(tableLog, err.reason || 'Could not place bets.', 'loss');
  }
});
