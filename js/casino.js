// ---------- casino: cashier ----------
// Casino (cashier, blackjack, slots) is server-authoritative -- the client sends the request and
// renders whatever character comes back, same shape as the hustles/gym/market.
const buyChipsInput = document.getElementById('buyChipsInput');
const cashOutInput = document.getElementById('cashOutInput');
const btnBuyChips = document.getElementById('btnBuyChips');
const btnBuyChipsMax = document.getElementById('btnBuyChipsMax');
const btnCashOut = document.getElementById('btnCashOut');
const btnCashOutMax = document.getElementById('btnCashOutMax');

btnBuyChips.addEventListener('click', async () => {
  try {
    const result = await apiBuyChips(Math.floor(+buyChipsInput.value));
    character = result.character;
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnBuyChipsMax.addEventListener('click', async () => {
  const amount = Math.floor(character.cash);
  if (!(amount > 0)) {
    alert('No Floydbucks to convert.');
    return;
  }
  try {
    const result = await apiBuyChips(amount);
    character = result.character;
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnCashOut.addEventListener('click', async () => {
  try {
    const result = await apiCashOut(Math.floor(+cashOutInput.value));
    character = result.character;
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnCashOutMax.addEventListener('click', async () => {
  const amount = Math.floor(character.chips);
  if (!(amount > 0)) {
    alert('No Chips to cash out.');
    return;
  }
  try {
    const result = await apiCashOut(amount);
    character = result.character;
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

// ---------- casino: blackjack ----------
const bjDealerCardsEl = document.getElementById('bjDealerCards');
const bjDealerTotalEl = document.getElementById('bjDealerTotal');
const bjHandsEl = document.getElementById('bjHands');
const bjBetInput = document.getElementById('bjBetInput');
const btnBjHalfBet = document.getElementById('btnBjHalfBet');
const btnBjMaxBet = document.getElementById('btnBjMaxBet');
const btnBjDeal = document.getElementById('btnBjDeal');
const btnBjHit = document.getElementById('btnBjHit');
const btnBjStand = document.getElementById('btnBjStand');
const btnBjDouble = document.getElementById('btnBjDouble');
const btnBjSplit = document.getElementById('btnBjSplit');
const bjMessageEl = document.getElementById('bjMessage');
const bjLog = document.getElementById('bjLog');

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

function handTotal(cards) {
  let total = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function renderCardRow(el, cards, hideFirst) {
  el.innerHTML = cards.map((c, i) => {
    if (hideFirst && i === 0) return '<span class="card back">??</span>';
    return `<span class="card">${c.rank}${c.suit}</span>`;
  }).join('');
}

function bjRender() {
  const bj = character.blackjack;
  if (!bj || !bj.hands) return;
  const hideDealer = bj.phase === 'playerTurn';
  renderCardRow(bjDealerCardsEl, bj.dealerCards, hideDealer);
  bjDealerTotalEl.textContent = hideDealer ? '?' : (bj.dealerCards.length ? handTotal(bj.dealerCards) : '');

  const multiHand = bj.hands.length > 1;
  bjHandsEl.innerHTML = bj.hands.map((hand, i) => {
    const active = bj.phase === 'playerTurn' && i === bj.activeHand;
    const total = hand.cards.length ? handTotal(hand.cards) : '';
    const cardsHtml = hand.cards.map((c) => `<span class="card">${c.rank}${c.suit}</span>`).join('');
    return `
      <div class="bj-player${active ? ' bj-hand-active' : ''}">
        <h4>🙂 ${multiHand ? `Hand ${i + 1} (bet ${hand.bet})` : 'You'} <span>${total}</span></h4>
        <div class="card-row">${cardsHtml}</div>
      </div>`;
  }).join('');

  const activeHand = bj.hands[bj.activeHand];
  const inPlayerTurn = bj.phase === 'playerTurn' && !!activeHand;
  const canActOnFirstTwo = inPlayerTurn && activeHand.cards.length === 2;

  btnBjDeal.disabled = bj.phase !== 'betting';
  btnBjHit.disabled = !inPlayerTurn;
  btnBjStand.disabled = !inPlayerTurn;
  btnBjDouble.disabled = !canActOnFirstTwo || activeHand.bet > character.chips;
  btnBjSplit.disabled = !canActOnFirstTwo || bj.hands.length > 1
    || cardValue(activeHand.cards[0].rank) !== cardValue(activeHand.cards[1].rank)
    || activeHand.bet > character.chips;
  bjBetInput.disabled = bj.phase !== 'betting';
  btnBjHalfBet.disabled = bj.phase !== 'betting';
  btnBjMaxBet.disabled = bj.phase !== 'betting';
}

btnBjHalfBet.addEventListener('click', () => {
  bjBetInput.value = Math.max(1, Math.floor((+bjBetInput.value || 0) / 2));
});

btnBjMaxBet.addEventListener('click', () => {
  bjBetInput.value = Math.max(1, Math.floor(character.chips));
});

btnBjDeal.addEventListener('click', async () => {
  try {
    const result = await apiBjDeal(Math.floor(+bjBetInput.value));
    character = result.character;
    bjMessageEl.textContent = '';
    if (result.resolved) {
      bjMessageEl.textContent = result.message;
      logTo(bjLog, result.message, result.cls);
    }
    save();
    renderAll();
    bjRender();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnBjHit.addEventListener('click', async () => {
  try {
    const result = await apiBjHit();
    character = result.character;
    if (result.resolved) {
      bjMessageEl.textContent = result.message;
      logTo(bjLog, result.message, result.cls);
      save();
      renderAll();
    } else {
      bjMessageEl.textContent = '';
    }
    bjRender();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnBjStand.addEventListener('click', async () => {
  try {
    const result = await apiBjStand();
    character = result.character;
    if (result.resolved) {
      bjMessageEl.textContent = result.message;
      logTo(bjLog, result.message, result.cls);
    } else {
      bjMessageEl.textContent = '';
    }
    save();
    renderAll();
    bjRender();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnBjDouble.addEventListener('click', async () => {
  try {
    const result = await apiBjDouble();
    character = result.character;
    if (result.resolved) {
      bjMessageEl.textContent = result.message;
      logTo(bjLog, result.message, result.cls);
    } else {
      bjMessageEl.textContent = '';
    }
    save();
    renderAll();
    bjRender();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnBjSplit.addEventListener('click', async () => {
  try {
    const result = await apiBjSplit();
    character = result.character;
    bjMessageEl.textContent = '';
    save();
    renderAll();
    bjRender();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

// ---------- casino: slots ----------
// Three machines, one shared spin flow -- reel count/min bet/description differ per machine, but
// the client only needs enough of that config to render reels and label the min bet; the server
// (SLOT_MACHINES in gameLogic.js) is authoritative on payouts.
const SLOT_MACHINE_CONFIG = {
  survivor: { label: 'Lone Slotvivor', minBet: 10, reelCount: 3, desc: 'The classic three-reel machine. Small bets, steady odds.' },
  zeus: { label: 'Zeus: King of Storms', minBet: 100, reelCount: 4, desc: 'Four reels, storm-themed symbols, and payouts that hit much harder.' },
  elite: { label: 'ELITE Slots', minBet: 10000, reelCount: 6, desc: 'High-roller only. Six reels and an insane jackpot if you land it.' },
};

let currentSlotMachine = 'survivor';

const slotMachineTabBtns = document.querySelectorAll('.slot-machine-tab-btn');
const slotMachineDescEl = document.getElementById('slotMachineDesc');
const slotMachineRuleEl = document.getElementById('slotMachineRule');
const slotReelsEl = document.getElementById('slotReels');
const slotBetInput = document.getElementById('slotBetInput');
const btnSlotSpin = document.getElementById('btnSlotSpin');
const slotMessageEl = document.getElementById('slotMessage');
const slotLog = document.getElementById('slotLog');

function renderSlotMachine() {
  const cfg = SLOT_MACHINE_CONFIG[currentSlotMachine];
  slotMachineDescEl.textContent = cfg.desc;
  slotMachineRuleEl.textContent = `Match all ${cfg.reelCount} symbols for the jackpot payout. A partial match on the lowest symbol refunds your bet.`;
  slotBetInput.min = cfg.minBet;
  slotBetInput.value = cfg.minBet;
  slotReelsEl.innerHTML = Array.from({ length: cfg.reelCount }, (_, i) => `<span class="reel" id="slotReel${i}">?</span>`).join('');
}

slotMachineTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    slotMachineTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    currentSlotMachine = btn.dataset.machine;
    slotMessageEl.textContent = '';
    renderSlotMachine();
  });
});

renderSlotMachine();

btnSlotSpin.addEventListener('click', async () => {
  try {
    const result = await apiSlotSpin(currentSlotMachine, Math.floor(+slotBetInput.value));
    character = result.character;
    result.reels.forEach((symbol, i) => {
      const reelEl = document.getElementById(`slotReel${i}`);
      if (reelEl) reelEl.textContent = symbol;
    });
    slotMessageEl.textContent = result.message;
    logTo(slotLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
