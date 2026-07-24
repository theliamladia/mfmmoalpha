// ---------- casino: roulette ----------
// Single-player roulette: bets accumulate client-side as chip markers, nothing is deducted from
// character.chips until the 10s timer (started by the first bet) expires and the whole bets array
// is submitted in one apiRouletteSpin() call, same "resolve everything atomically" shape as
// doBjDeal/doSlotSpin.
const ROULETTE_COUNTDOWN_SECONDS = 10;
const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const rouletteTimerEl = document.getElementById('rouletteTimer');
const roulettePendingTotalEl = document.getElementById('roulettePendingTotal');
const btnRouletteClearBets = document.getElementById('btnRouletteClearBets');
const rouletteWheelEl = document.getElementById('rouletteWheel');
const rouletteResultTextEl = document.getElementById('rouletteResultText');
const rouletteNumberGridEl = document.getElementById('rouletteNumberGrid');
const rouletteOutsideGridEl = document.getElementById('rouletteOutsideGrid');
const rouletteChipInput = document.getElementById('rouletteChipInput');
const rouletteMessageEl = document.getElementById('rouletteMessage');
const rouletteLog = document.getElementById('rouletteLog');

let rouletteBets = new Map(); // key `${type}:${value}` -> { type, value, amount }
let rouletteTimerHandle = null;
let rouletteSecondsLeft = ROULETTE_COUNTDOWN_SECONDS;
let rouletteLocked = false;

function rouletteNumberColor(n) {
  if (n === 0) return 'green';
  return ROULETTE_RED_NUMBERS.has(n) ? 'red' : 'black';
}

function buildRouletteNumberGrid() {
  const zeroBtn = document.createElement('div');
  zeroBtn.className = 'roulette-number-btn roulette-green';
  zeroBtn.textContent = '0';
  zeroBtn.dataset.key = 'straight:0';
  rouletteNumberGridEl.appendChild(zeroBtn);

  for (let n = 1; n <= 36; n += 1) {
    const btn = document.createElement('div');
    btn.className = `roulette-number-btn roulette-${rouletteNumberColor(n)}`;
    btn.textContent = String(n);
    btn.dataset.key = `straight:${n}`;
    rouletteNumberGridEl.appendChild(btn);
  }

  rouletteNumberGridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.roulette-number-btn');
    if (!btn) return;
    const n = Number(btn.textContent);
    placeRouletteBet('straight', n, btn);
  });
}

const ROULETTE_OUTSIDE_BETS = [
  { label: 'Red', type: 'redblack', value: 'red' },
  { label: 'Black', type: 'redblack', value: 'black' },
  { label: 'Even', type: 'evenodd', value: 'even' },
  { label: 'Odd', type: 'evenodd', value: 'odd' },
  { label: '1-18', type: 'highlow', value: 'low' },
  { label: '19-36', type: 'highlow', value: 'high' },
  { label: '1st 12', type: 'dozen', value: '1' },
  { label: '2nd 12', type: 'dozen', value: '2' },
  { label: '3rd 12', type: 'dozen', value: '3' },
  { label: 'Col 1', type: 'column', value: '1' },
  { label: 'Col 2', type: 'column', value: '2' },
  { label: 'Col 3', type: 'column', value: '3' },
];

function buildRouletteOutsideGrid() {
  ROULETTE_OUTSIDE_BETS.forEach((bet) => {
    const btn = document.createElement('div');
    btn.className = 'roulette-bet-btn';
    btn.textContent = bet.label;
    btn.dataset.key = `${bet.type}:${bet.value}`;
    btn.addEventListener('click', () => placeRouletteBet(bet.type, bet.value, btn));
    rouletteOutsideGridEl.appendChild(btn);
  });
}

function placeRouletteBet(type, value, el) {
  if (rouletteLocked) return;
  const chipValue = Math.floor(+rouletteChipInput.value);
  if (!(chipValue > 0)) {
    rouletteMessageEl.textContent = 'Enter a valid chip value.';
    return;
  }

  const pendingTotal = Array.from(rouletteBets.values()).reduce((sum, b) => sum + b.amount, 0);
  const available = Math.floor(character.chips) - pendingTotal;
  if (available <= 0) {
    rouletteMessageEl.textContent = 'Not enough Chips.';
    return;
  }
  const amountToAdd = Math.min(chipValue, available);
  if (amountToAdd < chipValue) {
    rouletteMessageEl.textContent = `Only ${amountToAdd} Chips left to bet — clamped.`;
  }

  const key = `${type}:${value}`;
  const existing = rouletteBets.get(key);
  rouletteBets.set(key, { type, value, amount: (existing ? existing.amount : 0) + amountToAdd });
  el.classList.add('selected');
  if (amountToAdd === chipValue) rouletteMessageEl.textContent = '';
  renderRoulettePending();
  startRouletteCountdownIfNeeded();
}

function renderRoulettePending() {
  const total = Array.from(rouletteBets.values()).reduce((sum, b) => sum + b.amount, 0);
  roulettePendingTotalEl.textContent = total;
}

function clearRouletteBets() {
  rouletteBets = new Map();
  document.querySelectorAll('.roulette-number-btn.selected, .roulette-bet-btn.selected').forEach((el) => el.classList.remove('selected'));
  renderRoulettePending();
}

btnRouletteClearBets.addEventListener('click', () => {
  if (rouletteLocked) return;
  clearRouletteBets();
  stopRouletteCountdown();
});

function startRouletteCountdownIfNeeded() {
  if (rouletteTimerHandle) return;
  rouletteSecondsLeft = ROULETTE_COUNTDOWN_SECONDS;
  rouletteTimerEl.textContent = `${rouletteSecondsLeft}s`;
  rouletteTimerHandle = setInterval(() => {
    rouletteSecondsLeft -= 1;
    if (rouletteSecondsLeft <= 0) {
      stopRouletteCountdown();
      resolveRouletteRound();
      return;
    }
    rouletteTimerEl.textContent = `${rouletteSecondsLeft}s`;
  }, 1000);
}

function stopRouletteCountdown() {
  if (rouletteTimerHandle) {
    clearInterval(rouletteTimerHandle);
    rouletteTimerHandle = null;
  }
  rouletteTimerEl.textContent = '--';
}

async function resolveRouletteRound() {
  const bets = Array.from(rouletteBets.values());
  if (!bets.length) return;

  rouletteLocked = true;
  rouletteWheelEl.classList.add('roulette-spin');
  rouletteResultTextEl.textContent = '';

  try {
    const result = await apiRouletteSpin(bets);
    character = result.character;
    setTimeout(() => {
      rouletteWheelEl.classList.remove('roulette-spin');
      rouletteResultTextEl.textContent = `${result.resultNumber} (${result.color})`;
      rouletteMessageEl.textContent = result.message;
      logTo(rouletteLog, result.message, result.cls);
      save();
      renderAll();
      clearRouletteBets();
      rouletteLocked = false;
    }, 1200);
  } catch (err) {
    rouletteWheelEl.classList.remove('roulette-spin');
    rouletteMessageEl.textContent = err.reason || 'Something went wrong.';
    clearRouletteBets();
    rouletteLocked = false;
  }
}

buildRouletteNumberGrid();
buildRouletteOutsideGrid();
