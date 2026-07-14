// ---------- casino: cashier ----------
// Casino (cashier, blackjack, slots) is server-authoritative -- the client sends the request and
// renders whatever character comes back, same shape as the hustles/gym/market.
const buyChipsInput = document.getElementById('buyChipsInput');
const cashOutInput = document.getElementById('cashOutInput');
const btnBuyChips = document.getElementById('btnBuyChips');
const btnCashOut = document.getElementById('btnCashOut');

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

// ---------- casino: blackjack ----------
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
  const hideDealer = bj.phase === 'playerTurn';
  renderCardRow(bjPlayerCardsEl, bj.playerCards, false);
  renderCardRow(bjDealerCardsEl, bj.dealerCards, hideDealer);
  bjPlayerTotalEl.textContent = bj.playerCards.length ? handTotal(bj.playerCards) : '';
  bjDealerTotalEl.textContent = hideDealer ? '?' : (bj.dealerCards.length ? handTotal(bj.dealerCards) : '');

  btnBjDeal.disabled = bj.phase !== 'betting';
  btnBjHit.disabled = bj.phase !== 'playerTurn';
  btnBjStand.disabled = bj.phase !== 'playerTurn';
  bjBetInput.disabled = bj.phase !== 'betting';
}

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
    bjMessageEl.textContent = result.message;
    logTo(bjLog, result.message, result.cls);
    save();
    renderAll();
    bjRender();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

// ---------- casino: slots ----------
const reelEls = [document.getElementById('reel0'), document.getElementById('reel1'), document.getElementById('reel2')];
const slotBetInput = document.getElementById('slotBetInput');
const btnSlotSpin = document.getElementById('btnSlotSpin');
const slotMessageEl = document.getElementById('slotMessage');
const slotLog = document.getElementById('slotLog');

btnSlotSpin.addEventListener('click', async () => {
  try {
    const result = await apiSlotSpin(Math.floor(+slotBetInput.value));
    character = result.character;
    result.reels.forEach((symbol, i) => { reelEls[i].textContent = symbol; });
    slotMessageEl.textContent = result.message;
    logTo(slotLog, result.message, result.cls);
    save();
    renderAll();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});
