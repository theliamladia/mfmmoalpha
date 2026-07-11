// ---------- casino: cashier ----------
const buyChipsInput = document.getElementById('buyChipsInput');
const cashOutInput = document.getElementById('cashOutInput');
const btnBuyChips = document.getElementById('btnBuyChips');
const btnCashOut = document.getElementById('btnCashOut');

function doBuyChips(amount) {
  if (!amount || amount < 1) return { ok: false };
  if (character.cash < amount) return { ok: false, reason: 'Not enough Floydbucks.' };
  character.cash -= amount;
  character.chips += amount;
  return { ok: true };
}

btnBuyChips.addEventListener('click', () => {
  const result = doBuyChips(Math.floor(+buyChipsInput.value));
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  save();
  renderAll();
});

function doCashOut(amount) {
  if (!amount || amount < 1) return { ok: false };
  if (character.chips < amount) return { ok: false, reason: 'Not enough Chips.' };
  character.chips -= amount;
  character.cash += amount;
  return { ok: true };
}

btnCashOut.addEventListener('click', () => {
  const result = doCashOut(Math.floor(+cashOutInput.value));
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  save();
  renderAll();
});

// ---------- casino: blackjack ----------
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const bjDealerCardsEl = document.getElementById('bjDealerCards');
const bjPlayerCardsEl = document.getElementById('bjPlayerCards');
const bjDealerTotalEl = document.getElementById('bjDealerTotal');
const bjPlayerTotalEl = document.getElementById('bjPlayerTotal');
const bjBetInput = document.getElementById('bjBetInput');
const btnBjDeal = document.getElementById('btnBjDeal');
const btnBjHit = document.getElementById('btnBjHit');
const btnBjStand = document.getElementById('btnBjStand');
const bjMessageEl = document.getElementById('bjMessage');
const bjLog = document.getElementById('bjLog');

let bjState = { phase: 'betting', playerCards: [], dealerCards: [], bet: 0 };

function drawCard() {
  return { rank: RANKS[randInt(0, RANKS.length - 1)], suit: SUITS[randInt(0, SUITS.length - 1)] };
}

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

function isBlackjack(cards) {
  return cards.length === 2 && handTotal(cards) === 21;
}

function renderCardRow(el, cards, hideFirst) {
  el.innerHTML = cards.map((c, i) => {
    if (hideFirst && i === 0) return '<span class="card back">??</span>';
    return `<span class="card">${c.rank}${c.suit}</span>`;
  }).join('');
}

function bjRender() {
  const hideDealer = bjState.phase === 'playerTurn';
  renderCardRow(bjPlayerCardsEl, bjState.playerCards, false);
  renderCardRow(bjDealerCardsEl, bjState.dealerCards, hideDealer);
  bjPlayerTotalEl.textContent = bjState.playerCards.length ? handTotal(bjState.playerCards) : '';
  bjDealerTotalEl.textContent = hideDealer ? '?' : (bjState.dealerCards.length ? handTotal(bjState.dealerCards) : '');

  btnBjDeal.disabled = bjState.phase !== 'betting';
  btnBjHit.disabled = bjState.phase !== 'playerTurn';
  btnBjStand.disabled = bjState.phase !== 'playerTurn';
  bjBetInput.disabled = bjState.phase !== 'betting';
}

function doApplyBjPayout(payout) {
  character.chips += payout;
  bjState.phase = 'betting';
}

function finishBjRound(payout, msg, cls) {
  doApplyBjPayout(payout);
  bjMessageEl.textContent = msg;
  logTo(bjLog, `${msg} (bet ${bjState.bet}, payout ${payout})`, cls);
  save();
  renderAll();
  bjRender();
}

function doResolveBlackjack() {
  while (handTotal(bjState.dealerCards) < 17) {
    bjState.dealerCards.push(drawCard());
  }
  const playerTotal = handTotal(bjState.playerCards);
  const dealerTotal = handTotal(bjState.dealerCards);
  const playerBJ = isBlackjack(bjState.playerCards);
  const dealerBJ = isBlackjack(bjState.dealerCards);

  let payout = 0;
  let msg = '';
  if (playerBJ && dealerBJ) {
    payout = bjState.bet;
    msg = 'Both blackjack! Push.';
  } else if (playerBJ) {
    payout = Math.floor(bjState.bet * 2.5);
    msg = 'Blackjack! You win 3:2.';
  } else if (dealerBJ) {
    payout = 0;
    msg = 'Dealer blackjack. You lose.';
  } else if (dealerTotal > 21) {
    payout = bjState.bet * 2;
    msg = `Dealer busts with ${dealerTotal}. You win!`;
  } else if (playerTotal > dealerTotal) {
    payout = bjState.bet * 2;
    msg = `You win ${playerTotal} vs ${dealerTotal}.`;
  } else if (playerTotal === dealerTotal) {
    payout = bjState.bet;
    msg = `Push at ${playerTotal}.`;
  } else {
    payout = 0;
    msg = `Dealer wins ${dealerTotal} vs ${playerTotal}.`;
  }

  return { payout, msg, cls: payout > bjState.bet ? 'gain' : (payout === bjState.bet ? '' : 'loss') };
}

function resolveBlackjack() {
  const result = doResolveBlackjack();
  finishBjRound(result.payout, result.msg, result.cls);
}

function doBjDeal(bet) {
  if (!bet || bet < 1) return { ok: false };
  if (bet > character.chips) return { ok: false, reason: 'Not enough Chips.' };
  character.chips -= bet;
  bjState = { phase: 'playerTurn', playerCards: [drawCard(), drawCard()], dealerCards: [drawCard(), drawCard()], bet };
  return { ok: true, naturalBlackjack: isBlackjack(bjState.playerCards) || isBlackjack(bjState.dealerCards) };
}

btnBjDeal.addEventListener('click', () => {
  const result = doBjDeal(Math.floor(+bjBetInput.value));
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  bjMessageEl.textContent = '';
  save();
  renderAll();

  if (result.naturalBlackjack) {
    resolveBlackjack();
    return;
  }
  bjRender();
});

function doBjHit() {
  bjState.playerCards.push(drawCard());
  const total = handTotal(bjState.playerCards);
  return { busted: total > 21, total };
}

btnBjHit.addEventListener('click', () => {
  const result = doBjHit();
  if (result.busted) {
    finishBjRound(0, `Busted with ${result.total}! You lose.`, 'loss');
    return;
  }
  bjRender();
});

function doBjStand() {
  bjState.phase = 'dealerTurn';
}

btnBjStand.addEventListener('click', () => {
  doBjStand();
  resolveBlackjack();
});

// ---------- casino: slots ----------
const SLOT_SYMBOLS = [
  { symbol: '\u{1F352}', weight: 35, three: 2, twoPays: true }, // cherries
  { symbol: '\u{1F34B}', weight: 25, three: 3 }, // lemon
  { symbol: '\u{1F514}', weight: 20, three: 5 }, // bell
  { symbol: '⭐', weight: 12, three: 10 }, // star
  { symbol: '7️⃣', weight: 6, three: 20 }, // seven
  { symbol: '\u{1F48E}', weight: 2, three: 50 }, // diamond
];

const reelEls = [document.getElementById('reel0'), document.getElementById('reel1'), document.getElementById('reel2')];
const slotBetInput = document.getElementById('slotBetInput');
const btnSlotSpin = document.getElementById('btnSlotSpin');
const slotMessageEl = document.getElementById('slotMessage');
const slotLog = document.getElementById('slotLog');

function weightedSlotSymbol() {
  const totalWeight = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * totalWeight;
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[0];
}

function doSlotSpin(bet) {
  if (!bet || bet < 1) return { ok: false };
  if (bet > character.chips) return { ok: false, reason: 'Not enough Chips.' };
  character.chips -= bet;

  const reels = [weightedSlotSymbol(), weightedSlotSymbol(), weightedSlotSymbol()];

  let payout = 0;
  let msg = '';
  if (reels[0].symbol === reels[1].symbol && reels[1].symbol === reels[2].symbol) {
    payout = bet * reels[0].three;
    msg = `Triple ${reels[0].symbol}! +${payout} chips.`;
  } else {
    const cherryCount = reels.filter((s) => s.symbol === SLOT_SYMBOLS[0].symbol).length;
    if (cherryCount >= 2) {
      payout = bet;
      msg = 'Two cherries — bet refunded.';
    } else {
      msg = 'No match. Better luck next spin.';
    }
  }

  character.chips += payout;
  return { ok: true, reels, payout, msg, cls: payout > bet ? 'gain' : (payout === bet ? '' : 'loss'), bet };
}

btnSlotSpin.addEventListener('click', () => {
  const result = doSlotSpin(Math.floor(+slotBetInput.value));
  if (!result.ok) { if (result.reason) alert(result.reason); return; }
  result.reels.forEach((s, i) => { reelEls[i].textContent = s.symbol; });
  slotMessageEl.textContent = result.msg;
  logTo(slotLog, `${result.msg} (bet ${result.bet})`, result.cls);
  save();
  renderAll();
});

