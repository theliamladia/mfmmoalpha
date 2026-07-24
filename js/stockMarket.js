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
  refreshStockChart();
});

// ---------- Price chart ----------
// Line/area chart only -- no candlesticks, per an explicit ask. Canvas is hand-drawn (no charting
// library) to match how everything else visual in this app (roulette wheel, progress bars) is
// built from scratch. Points come from the server's price-history table (see recordStockPricePoint
// in mfmmoserver/server.js) -- the server ticks price forward lazily, so history only has an entry
// for every tick that actually happened, not a fixed grid.
const stockChartCanvas = document.getElementById('stockChartCanvas');
const stockChartEmpty = document.getElementById('stockChartEmpty');
const stockChartTimeframesEl = document.getElementById('stockChartTimeframes');
let currentChartRange = '1d';

let lastChartPoints = null;
const STOCK_CHART_PADDING = { left: 58, right: 12, top: 14, bottom: 22 };

function formatChartTimeLabel(ts) {
  const d = new Date(ts);
  if (currentChartRange === '1h' || currentChartRange === '1d') {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Shared by both the base draw and the hover handler so the mouse math always lines up with
// whatever was actually drawn.
function computeChartGeometry(points, cssWidth, cssHeight) {
  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = (maxPrice - minPrice) || Math.abs(minPrice) * 0.01 || 1;
  const pad = STOCK_CHART_PADDING;
  const chartW = cssWidth - pad.left - pad.right;
  const chartH = cssHeight - pad.top - pad.bottom;
  return {
    prices,
    minPrice,
    maxPrice,
    xForIndex: (i) => pad.left + (i / (prices.length - 1)) * chartW,
    yForPrice: (p) => pad.top + chartH - ((p - minPrice) / priceRange) * chartH,
    pad,
    chartW,
    chartH,
  };
}

// hoverIndex is null when nothing's being hovered -- draws the plain line/area/legend. Called
// directly (no hover) after every data refresh, and again on every mousemove over the canvas.
function renderStockChart(hoverIndex) {
  if (!stockChartCanvas || !lastChartPoints) return;
  const points = lastChartPoints;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = stockChartCanvas.clientWidth || 400;
  const cssHeight = stockChartCanvas.clientHeight || 260;
  stockChartCanvas.width = cssWidth * dpr;
  stockChartCanvas.height = cssHeight * dpr;
  const ctx = stockChartCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const { prices, minPrice, maxPrice, xForIndex, yForPrice, pad, chartW, chartH } = computeChartGeometry(points, cssWidth, cssHeight);
  const isUp = prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? '#6fcf97' : '#e05c5c';
  const fillColor = isUp ? 'rgba(111, 207, 151, 0.15)' : 'rgba(224, 92, 92, 0.15)';

  // Legend: horizontal gridlines + $ price labels at max/mid/min, and start/mid/end time labels
  // along the bottom -- the axis context the plain line was missing.
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#6f7178';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  [maxPrice, (maxPrice + minPrice) / 2, minPrice].forEach((price) => {
    const y = yForPrice(price);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, pad.left - 8, y);
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach((i) => {
    ctx.fillText(formatChartTimeLabel(points[i].ts), xForIndex(i), pad.top + chartH + 6);
  });

  // Area fill
  ctx.beginPath();
  ctx.moveTo(xForIndex(0), yForPrice(prices[0]));
  prices.forEach((p, i) => ctx.lineTo(xForIndex(i), yForPrice(p)));
  ctx.lineTo(xForIndex(prices.length - 1), pad.top + chartH);
  ctx.lineTo(xForIndex(0), pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Line
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = xForIndex(i);
    const y = yForPrice(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (hoverIndex === null || hoverIndex === undefined) return;
  const i = Math.max(0, Math.min(points.length - 1, hoverIndex));
  const x = xForIndex(i);
  const y = yForPrice(prices[i]);

  // Vertical guide line under the cursor
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(x, pad.top);
  ctx.lineTo(x, pad.top + chartH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Dot on the line
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.strokeStyle = '#1b1d22';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tooltip box with the exact price + timestamp at that point
  const priceText = `$${prices[i].toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const timeText = new Date(points[i].ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  ctx.font = 'bold 12px sans-serif';
  const textW = Math.max(ctx.measureText(priceText).width, ctx.measureText(timeText).width);
  const boxW = textW + 18;
  const boxH = 40;
  let boxX = x + 10;
  if (boxX + boxW > cssWidth - 4) boxX = x - boxW - 10;
  let boxY = y - boxH - 10;
  if (boxY < 0) boxY = y + 10;

  ctx.fillStyle = '#1b1d22';
  ctx.strokeStyle = '#35373f';
  ctx.lineWidth = 1;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f2c94c';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(priceText, boxX + 9, boxY + 17);
  ctx.fillStyle = '#9a9ca6';
  ctx.font = '11px sans-serif';
  ctx.fillText(timeText, boxX + 9, boxY + 31);
}

function drawStockChart(points) {
  if (!stockChartCanvas) return;
  if (!points || points.length < 2) {
    lastChartPoints = null;
    stockChartCanvas.classList.add('hidden');
    stockChartEmpty.classList.remove('hidden');
    return;
  }
  lastChartPoints = points;
  stockChartCanvas.classList.remove('hidden');
  stockChartEmpty.classList.add('hidden');
  renderStockChart(null);
}

stockChartCanvas && stockChartCanvas.addEventListener('mousemove', (e) => {
  if (!lastChartPoints) return;
  const rect = stockChartCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const cssWidth = stockChartCanvas.clientWidth || 400;
  const cssHeight = stockChartCanvas.clientHeight || 260;
  const { pad, chartW } = computeChartGeometry(lastChartPoints, cssWidth, cssHeight);
  const ratio = Math.min(1, Math.max(0, (mouseX - pad.left) / chartW));
  const index = Math.round(ratio * (lastChartPoints.length - 1));
  renderStockChart(index);
});

stockChartCanvas && stockChartCanvas.addEventListener('mouseleave', () => {
  renderStockChart(null);
});

async function refreshStockChart() {
  if (!selectedStockSymbol || !getAuthToken()) return;
  try {
    const result = await apiStockHistory(selectedStockSymbol, currentChartRange);
    drawStockChart(result.points);
  } catch {
    // Best-effort, same as every other polled thing on this page.
  }
}

stockChartTimeframesEl && stockChartTimeframesEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.stock-timeframe-btn');
  if (!btn) return;
  stockChartTimeframesEl.querySelectorAll('.stock-timeframe-btn').forEach((b) => b.classList.toggle('active', b === btn));
  currentChartRange = btn.dataset.range;
  refreshStockChart();
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

  const spread = typeof s.spread === 'number' ? s.spread : 0.01;
  const spreadPct = Math.round(spread * 1000) / 10;

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
    <p class="stock-tax-note" id="stockBuyEstimate"></p>
    <div class="stock-trade-row">
      <input type="number" min="1" value="1" id="stockSellQtyInput" class="stock-qty-input">
      <button id="btnStockSell">Sell</button>
      <button id="btnStockSellMax" class="secondary-btn">Sell Max</button>
    </div>
    <p class="stock-tax-note" id="stockSellEstimate"></p>
  `;

  const stockQtyInput = document.getElementById('stockQtyInput');
  const stockSellQtyInput = document.getElementById('stockSellQtyInput');
  const stockBuyEstimate = document.getElementById('stockBuyEstimate');
  const stockSellEstimate = document.getElementById('stockSellEstimate');

  // Live preview of the stock tax (the buy/sell spread) as the player types a quantity, before
  // they commit to the trade -- same number the server will actually charge (doBuyStock/
  // doSellStock apply the identical spread), just previewed client-side off the same price/spread
  // the server just sent.
  function updateBuyEstimate() {
    const qty = Math.floor(+stockQtyInput.value);
    if (!qty || qty < 1) {
      stockBuyEstimate.textContent = '';
      return;
    }
    const buyPrice = s.price * (1 + spread);
    const total = round2(buyPrice * qty);
    const tax = round2(s.price * spread * qty);
    stockBuyEstimate.textContent = `Est. total: $${total.toLocaleString()} (includes ${spreadPct}% stock tax: $${tax.toLocaleString()})`;
  }

  function updateSellEstimate() {
    const qty = Math.floor(+stockSellQtyInput.value);
    if (!qty || qty < 1) {
      stockSellEstimate.textContent = '';
      return;
    }
    const sellPrice = s.price * (1 - spread);
    const proceeds = round2(sellPrice * qty);
    const tax = round2(s.price * spread * qty);
    stockSellEstimate.textContent = `Est. proceeds: $${proceeds.toLocaleString()} (after ${spreadPct}% stock tax: $${tax.toLocaleString()})`;
  }

  stockQtyInput.addEventListener('input', updateBuyEstimate);
  stockSellQtyInput.addEventListener('input', updateSellEstimate);
  updateBuyEstimate();
  updateSellEstimate();

  document.getElementById('btnStockBuy').addEventListener('click', () => {
    const qty = Math.floor(+stockQtyInput.value);
    buyStock(s.symbol, qty);
  });
  document.getElementById('btnStockBuyMax').addEventListener('click', () => {
    const buyPrice = s.price * (1 + spread);
    const maxQty = Math.floor(character.cash / buyPrice);
    buyStock(s.symbol, maxQty);
  });
  document.getElementById('btnStockSell').addEventListener('click', () => {
    const qty = Math.floor(+stockSellQtyInput.value);
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
  refreshStockChart();
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
