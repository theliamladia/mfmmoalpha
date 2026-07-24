// ---------- Stock Market (Investors Center) ----------
// Prices are server-authoritative and shared -- every player sees the exact same number at any
// instant (see advanceStockTicks in mfmmoserver/gameLogic.js). This file only polls and renders;
// it never computes a price itself. InvestorsChat below is a completely separate chat room from
// New Milos City's main chat (js/milos.js) -- its own cache, its own DOM, its own API routes,
// never merged with the other one.
const stockCashDisplay = document.getElementById('stockCashDisplay');
const stockPortfolioGrid = document.getElementById('stockPortfolioGrid');
const stockTickerGrid = document.getElementById('stockTickerGrid');
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
const STOCK_MARKET_POLL_MS = 30000;

function renderStockTickers() {
  if (!stockTickerGrid) return;
  stockTickerGrid.innerHTML = stocksCache.map((s) => {
    const tierInfo = STOCK_TIER_DISPLAY[s.tier] || { label: s.tier, cls: '' };
    const holding = character.stocks && character.stocks.holdings[s.symbol];
    const holdingNote = holding
      ? `You own ${holding.qty} @ avg $${holding.avgCost.toLocaleString()}`
      : 'No shares owned.';
    return `
      <div class="hustle-card stock-ticker-card">
        <h3>${s.symbol} <span class="stock-tier-badge ${tierInfo.cls}">${tierInfo.label}</span></h3>
        <p class="item-subheading">${escapeHtml(s.name)} &middot; ${escapeHtml(s.sector)}</p>
        <p class="stock-price" data-symbol-price="${s.symbol}">$${s.price.toLocaleString()}</p>
        <p class="stock-holding-note">${holdingNote}</p>
        <div class="stock-trade-row">
          <input type="number" min="1" value="1" class="stock-qty-input" data-symbol-qty="${s.symbol}">
          <button data-buy-symbol="${s.symbol}">Buy</button>
          <button data-sell-symbol="${s.symbol}" class="secondary-btn">Sell</button>
        </div>
      </div>
    `;
  }).join('');

  stockTickerGrid.querySelectorAll('[data-buy-symbol]').forEach((btn) => {
    btn.addEventListener('click', () => buyStock(btn.dataset.buySymbol));
  });
  stockTickerGrid.querySelectorAll('[data-sell-symbol]').forEach((btn) => {
    btn.addEventListener('click', () => sellStock(btn.dataset.sellSymbol));
  });

  // Brief green/red flash on any ticker whose price actually changed since the last render --
  // the visual cue that something just moved without the player having to refresh or compare.
  stocksCache.forEach((s) => {
    const prev = previousStockPrices[s.symbol];
    if (prev === undefined || prev === s.price) return;
    const priceEl = stockTickerGrid.querySelector(`[data-symbol-price="${s.symbol}"]`);
    if (!priceEl) return;
    priceEl.classList.add(s.price > prev ? 'stock-price-flash-up' : 'stock-price-flash-down');
    setTimeout(() => priceEl.classList.remove('stock-price-flash-up', 'stock-price-flash-down'), 1200);
  });
  previousStockPrices = Object.fromEntries(stocksCache.map((s) => [s.symbol, s.price]));
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
        <span>Avg $${holding.avgCost.toLocaleString()}</span>
        <span class="${cls}">Value $${value.toLocaleString()} (${plSign}$${Math.abs(pl).toLocaleString()})</span>
      </div>
    `;
  }).join('');
}

async function refreshStocks() {
  if (!getAuthToken()) return;
  try {
    stocksCache = (await apiStocks()).stocks;
  } catch {
    // Best-effort, same as every other polled list in this app.
  }
  renderStockTickers();
  renderStockPortfolio();
}

async function buyStock(symbol) {
  const input = stockTickerGrid.querySelector(`[data-symbol-qty="${symbol}"]`);
  const qty = Math.floor(+input.value);
  if (!qty || qty < 1) {
    alert('Enter a valid quantity.');
    return;
  }
  try {
    const result = await apiBuyStock(symbol, qty);
    character = result.character;
    save();
    renderAll();
    renderStockPortfolio();
    logTo(stockLog, result.message, result.cls);
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}

async function sellStock(symbol) {
  const input = stockTickerGrid.querySelector(`[data-symbol-qty="${symbol}"]`);
  const qty = Math.floor(+input.value);
  if (!qty || qty < 1) {
    alert('Enter a valid quantity.');
    return;
  }
  try {
    const result = await apiSellStock(symbol, qty);
    character = result.character;
    save();
    renderAll();
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
