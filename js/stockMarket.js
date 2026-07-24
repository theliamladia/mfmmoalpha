// ---------- Stock Market (Investors Center) ----------
// Prices are server-authoritative and shared -- every player sees the exact same number at any
// instant (see advanceStockTicks in mfmmoserver/gameLogic.js). This file only polls and renders;
// it never computes a price itself. InvestorsChat below is a completely separate chat room from
// New Milos City's main chat (js/milos.js) -- its own cache, its own DOM, its own API routes,
// never merged with the other one.
const stockCashDisplay = document.getElementById('stockCashDisplay');
const stockPortfolioGrid = document.getElementById('stockPortfolioGrid');
const stockSelector = document.getElementById('stockSelector');
const stockDetailCard = document.getElementById('stockDetailCard');
const stockLog = document.getElementById('stockLog');
const investorChatMessagesEl = document.getElementById('investorChatMessages');
const investorChatInput = document.getElementById('investorChatInput');
const btnInvestorChatSend = document.getElementById('btnInvestorChatSend');

const STOCK_TIER_DISPLAY = {
  megabluechip: { label: '🏛️ Blue Chip+', cls: 'stock-tier-megabluechip' },
  bluechip: { label: '🏦 Blue Chip', cls: 'stock-tier-bluechip' },
  growth: { label: '📈 Growth', cls: 'stock-tier-growth' },
  volatile: { label: '⚡ Volatile', cls: 'stock-tier-volatile' },
  meme: { label: '🎲 Meme', cls: 'stock-tier-meme' },
};

let stocksCache = [];
let previousStockPrices = {};
let stockMarketPollInterval = null;
let selectedStockSymbol = null;
const STOCK_MARKET_POLL_MS = 30000;

function populateStockSelector() {
  if (!stockSelector) return;
  const prevValue = selectedStockSymbol;
  stockSelector.innerHTML = stocksCache.map((s) => `<option value="${s.symbol}">${s.symbol} — ${escapeHtml(s.name)}</option>`).join('');
  selectedStockSymbol = stocksCache.some((s) => s.symbol === prevValue) ? prevValue : (stocksCache[0] && stocksCache[0].symbol) || null;
  if (selectedStockSymbol) stockSelector.value = selectedStockSymbol;
}

stockSelector && stockSelector.addEventListener('change', () => {
  selectedStockSymbol = stockSelector.value;
  renderStockDetail();
});

function renderStockDetail() {
  if (!stockDetailCard) return;
  const s = stocksCache.find((x) => x.symbol === selectedStockSymbol);
  if (!s) {
    stockDetailCard.innerHTML = '<p class="equip-picker-empty">No stock data yet.</p>';
    return;
  }

  const tierInfo = STOCK_TIER_DISPLAY[s.tier] || { label: s.tier, cls: '' };
  const holding = character.stocks && character.stocks.holdings[s.symbol];
  const holdingNote = holding
    ? `You own ${holding.qty} @ avg $${holding.avgCost.toLocaleString()}`
    : 'No shares owned.';

  stockDetailCard.innerHTML = `
    <div class="stock-detail-header">
      <span class="stock-detail-symbol">${s.symbol}</span>
      <span class="stock-tier-badge ${tierInfo.cls}">${tierInfo.label}</span>
    </div>
    <p class="item-subheading">${escapeHtml(s.name)} &middot; ${escapeHtml(s.sector)}</p>
    <p class="stock-price" data-symbol-price="${s.symbol}">$${s.price.toLocaleString()}</p>
    <p class="stock-holding-note">${holdingNote}</p>
    <div class="stock-trade-row">
      <input type="number" min="1" value="1" id="stockQtyInput" class="stock-qty-input">
      <button id="btnStockBuy">Buy</button>
      <button id="btnStockBuyMax" class="secondary-btn">Buy Max</button>
    </div>
    <div class="stock-trade-row">
      <input type="number" min="1" value="1" id="stockSellQtyInput" class="stock-qty-input">
      <button id="btnStockSell">Sell</button>
      <button id="btnStockSellMax" class="secondary-btn">Sell Max</button>
    </div>
  `;

  document.getElementById('btnStockBuy').addEventListener('click', () => {
    const qty = Math.floor(+document.getElementById('stockQtyInput').value);
    buyStock(s.symbol, qty);
  });
  document.getElementById('btnStockBuyMax').addEventListener('click', () => {
    const buyPrice = s.price * 1.01;
    const maxQty = Math.floor(character.cash / buyPrice);
    buyStock(s.symbol, maxQty);
  });
  document.getElementById('btnStockSell').addEventListener('click', () => {
    const qty = Math.floor(+document.getElementById('stockSellQtyInput').value);
    sellStock(s.symbol, qty);
  });
  document.getElementById('btnStockSellMax').addEventListener('click', () => {
    const maxQty = holding ? holding.qty : 0;
    sellStock(s.symbol, maxQty);
  });

  // Brief green/red flash on the price whenever it changed since the last render -- the visual
  // cue that something just moved without the player having to refresh or compare.
  const prev = previousStockPrices[s.symbol];
  if (prev !== undefined && prev !== s.price) {
    const priceEl = stockDetailCard.querySelector(`[data-symbol-price="${s.symbol}"]`);
    if (priceEl) {
      priceEl.classList.add(s.price > prev ? 'stock-price-flash-up' : 'stock-price-flash-down');
      setTimeout(() => priceEl.classList.remove('stock-price-flash-up', 'stock-price-flash-down'), 1200);
    }
  }
  previousStockPrices = Object.fromEntries(stocksCache.map((x) => [x.symbol, x.price]));
}

function renderStockPortfolio() {
  if (!stockPortfolioGrid) return;
  stockCashDisplay.textContent = Math.floor(character.cash).toLocaleString();

  const holdings = (character.stocks && character.stocks.holdings) || {};
  const rows = Object.entries(holdings);
  if (!rows.length) {
    stockPortfolioGrid.innerHTML = '<p class="equip-picker-empty">No positions yet.</p>';
    return;
  }

  stockPortfolioGrid.innerHTML = rows.map(([symbol, holding]) => {
    const stock = stocksCache.find((s) => s.symbol === symbol);
    const currentPrice = stock ? stock.price : holding.avgCost;
    const value = round2(currentPrice * holding.qty);
    const costBasis = round2(holding.avgCost * holding.qty);
    const pl = round2(value - costBasis);
    const cls = pl > 0 ? 'gain' : pl < 0 ? 'loss' : '';
    const plSign = pl >= 0 ? '+' : '-';
    return `
      <div class="stock-portfolio-row">
        <span>${symbol} &times; ${holding.qty}</span>
        <span>Avg Cost $${holding.avgCost.toLocaleString()}</span>
        <span class="${cls}">Value $${value.toLocaleString()} (${plSign}$${Math.abs(pl).toLocaleString()})</span>
      </div>
    `;
  }).join('');
}

// ---------- Performance Log modal ----------
// Realized P/L accumulates server-side on every sell (character.stocks.realizedPl); unrealized
// P/L is just today's snapshot of open positions vs their avg cost, recomputed fresh each time the
// modal is opened since it depends on the live price cache.
const btnOpenStockPerformance = document.getElementById('btnOpenStockPerformance');
const stockPerformanceModal = document.getElementById('stockPerformanceModal');
const btnStockPerformanceClose = document.getElementById('btnStockPerformanceClose');
const btnStockPerformanceCloseX = document.getElementById('btnStockPerformanceCloseX');
const stockRealizedPlEl = document.getElementById('stockRealizedPl');
const stockUnrealizedPlEl = document.getElementById('stockUnrealizedPl');
const stockTotalPlEl = document.getElementById('stockTotalPl');
const stockTransactionListEl = document.getElementById('stockTransactionList');
const btnStockTxPrev = document.getElementById('btnStockTxPrev');
const btnStockTxNext = document.getElementById('btnStockTxNext');
const stockTxPageLabel = document.getElementById('stockTxPageLabel');

const STOCK_TX_PAGE_SIZE = 10;
let stockTxPage = 0;

function computeUnrealizedPl() {
  const holdings = (character.stocks && character.stocks.holdings) || {};
  return Object.entries(holdings).reduce((sum, [symbol, holding]) => {
    const stock = stocksCache.find((s) => s.symbol === symbol);
    const currentPrice = stock ? stock.price : holding.avgCost;
    return round2(sum + (currentPrice - holding.avgCost) * holding.qty);
  }, 0);
}

function formatPl(v) {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(round2(v)).toLocaleString()}`;
}

function plClass(v) {
  return v > 0 ? 'gain' : v < 0 ? 'loss' : '';
}

function renderStockPerformanceModal() {
  const transactions = (character.stocks && character.stocks.transactions) || [];
  const realizedPl = (character.stocks && character.stocks.realizedPl) || 0;
  const unrealizedPl = computeUnrealizedPl();
  const totalPl = round2(realizedPl + unrealizedPl);

  stockRealizedPlEl.textContent = formatPl(realizedPl);
  stockRealizedPlEl.className = plClass(realizedPl);
  stockUnrealizedPlEl.textContent = formatPl(unrealizedPl);
  stockUnrealizedPlEl.className = plClass(unrealizedPl);
  stockTotalPlEl.textContent = formatPl(totalPl);
  stockTotalPlEl.className = plClass(totalPl);

  const totalPages = Math.max(1, Math.ceil(transactions.length / STOCK_TX_PAGE_SIZE));
  stockTxPage = Math.min(stockTxPage, totalPages - 1);
  const pageItems = transactions.slice(stockTxPage * STOCK_TX_PAGE_SIZE, (stockTxPage + 1) * STOCK_TX_PAGE_SIZE);

  stockTransactionListEl.innerHTML = pageItems.length
    ? pageItems.map((tx) => {
      const verb = tx.type === 'buy' ? 'Bought' : 'Sold';
      const plText = tx.pl === null ? '' : ` (${formatPl(tx.pl)})`;
      return `
        <div class="stock-transaction-row">
          <span class="stock-tx-date">${new Date(tx.ts).toLocaleString()}</span>
          <span>${verb} ${tx.qty}x ${tx.symbol} @ $${tx.price.toLocaleString()}</span>
          <span class="${tx.pl === null ? '' : plClass(tx.pl)}">$${tx.total.toLocaleString()}${plText}</span>
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No trades yet.</p>';

  stockTxPageLabel.textContent = `Page ${stockTxPage + 1} of ${totalPages}`;
  btnStockTxPrev.disabled = stockTxPage <= 0;
  btnStockTxNext.disabled = stockTxPage >= totalPages - 1;
}

function openStockPerformanceModal() {
  stockTxPage = 0;
  renderStockPerformanceModal();
  stockPerformanceModal.classList.remove('hidden');
}

btnOpenStockPerformance.addEventListener('click', openStockPerformanceModal);
btnStockPerformanceClose.addEventListener('click', () => stockPerformanceModal.classList.add('hidden'));
btnStockPerformanceCloseX.addEventListener('click', () => stockPerformanceModal.classList.add('hidden'));
btnStockTxPrev.addEventListener('click', () => {
  stockTxPage = Math.max(0, stockTxPage - 1);
  renderStockPerformanceModal();
});
btnStockTxNext.addEventListener('click', () => {
  stockTxPage += 1;
  renderStockPerformanceModal();
});

async function refreshStocks() {
  if (!getAuthToken()) return;
  try {
    stocksCache = (await apiStocks()).stocks;
  } catch {
    // Best-effort, same as every other polled list in this app.
  }
  populateStockSelector();
  renderStockDetail();
  renderStockPortfolio();
}

async function buyStock(symbol, qty) {
  if (!qty || qty < 1) {
    alert('Enter a valid quantity.');
    return;
  }
  try {
    const result = await apiBuyStock(symbol, qty);
    character = result.character;
    save();
    renderAll();
    renderStockDetail();
    renderStockPortfolio();
    logTo(stockLog, result.message, result.cls);
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

async function sellStock(symbol, qty) {
  if (!qty || qty < 1) {
    alert('Enter a valid quantity.');
    return;
  }
  try {
    const result = await apiSellStock(symbol, qty);
    character = result.character;
    save();
    renderAll();
    renderStockDetail();
    renderStockPortfolio();
    logTo(stockLog, result.message, result.cls);
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

// ---------- InvestorsChat ----------
// Deliberately mirrors New Milos City's chat rendering (js/milos.js) so it looks and feels the
// same, but every piece of state below is its own -- never shares a cache, container, or route
// with the main chat. Bot posts (see mfmmoserver's generateInvestorBotPost) render exactly like a
// real player's message -- no badge, no styling difference -- since the whole point is you can't
// tell who's a real trader and who isn't just by reading.
let investorChatMessagesCache = [];
let lastRenderedInvestorChatId = null;

function investorChatTitleMarkup(msg) {
  if (!msg.titleText && !msg.titleId) return '';
  return chatTitleMarkup(msg);
}

function renderInvestorChatMessages() {
  if (!investorChatMessagesEl) return;
  const lastId = investorChatMessagesCache.length ? investorChatMessagesCache[investorChatMessagesCache.length - 1].id : null;
  if (lastId === lastRenderedInvestorChatId) return;
  lastRenderedInvestorChatId = lastId;

  investorChatMessagesEl.innerHTML = investorChatMessagesCache.map((msg) => {
    const nameMarkup = msg.isBot ? escapeHtml(msg.senderName) : styledNameHtmlById(msg.titleId, msg.senderName);
    return `
      <div class="chat-message-row">
        ${investorChatTitleMarkup(msg)}
        <span class="chat-message-body">
          <span class="chat-message-name">${nameMarkup}</span><span class="chat-message-sep">:</span>
          <span class="chat-message-text">${escapeHtml(msg.message)}</span>
        </span>
      </div>
    `;
  }).join('');
  investorChatMessagesEl.scrollTop = investorChatMessagesEl.scrollHeight;
}

async function refreshInvestorChatMessages() {
  if (!getAuthToken()) return;
  try {
    investorChatMessagesCache = (await apiInvestorChatMessages()).messages;
  } catch {
    // Best-effort -- keep showing the last known messages if the poll fails.
  }
  renderInvestorChatMessages();
}

async function sendInvestorChatMessage() {
  const text = investorChatInput.value.trim();
  if (!text) return;
  investorChatInput.value = '';
  try {
    const result = await apiInvestorChatSend(currentDisplayTitleText(), text, character.titles.equipped);
    investorChatMessagesCache = result.messages;
    renderInvestorChatMessages();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

btnInvestorChatSend.addEventListener('click', sendInvestorChatMessage);
investorChatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendInvestorChatMessage();
});

// Polling (both prices and InvestorsChat) only runs while the Investors Center tab is open --
// scoped the same way Coinflip's lobby poll is (see setCoinflipTabVisible in js/coinflip.js).
function setStockMarketTabVisible(visible) {
  if (visible) {
    refreshStocks();
    refreshInvestorChatMessages();
    if (!stockMarketPollInterval) {
      stockMarketPollInterval = setInterval(() => {
        refreshStocks();
        refreshInvestorChatMessages();
      }, STOCK_MARKET_POLL_MS);
    }
  } else if (stockMarketPollInterval) {
    clearInterval(stockMarketPollInterval);
    stockMarketPollInterval = null;
  }
}
