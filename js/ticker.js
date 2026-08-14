// ---------- City Pulse ticker ----------
// A thin, always-scrolling marquee of recent server-wide flavor events (arrests, NMG grade
// reveals, CosmetixxMarket buys, marriages, duel results) -- see GET /city/events in server.js.
// Purely cosmetic/read-only: no character state involved, so this never touches save()/renderAll().
//
// Loaded right after js/api.js (see the <script> order in index.html) so apiRequest/getAuthToken
// are already defined; loaded before js/core.js and everything else, so this file must not assume
// any of that later state exists.

const CITY_TICKER_POLL_MS = 60000;
// How long a freshly-arrived event keeps its highlight treatment before fading back to normal.
const CITY_TICKER_HIGHLIGHT_MS = 8000;
// Roughly constant scroll speed regardless of how much text is queued up, so a slow news day
// doesn't look weirdly fast and a busy one doesn't blur past.
const CITY_TICKER_PX_PER_SEC = 60;

const cityTickerEl = document.getElementById('cityTicker');
const cityTickerTrackEl = document.getElementById('cityTickerTrack');

// Highest event id rendered so far -- anything newer than this on the next poll gets the brief
// highlight treatment. Starts at Infinity so the very first render (whatever was already sitting
// in the feed before this tab opened) never lights up as "new".
let cityTickerLastSeenMaxId = Infinity;

function cityTickerEscapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function cityTickerHide() {
  if (!cityTickerEl) return;
  cityTickerEl.classList.add('city-ticker-empty');
  cityTickerTrackEl.innerHTML = '';
}

function cityTickerRender(events) {
  if (!cityTickerEl || !cityTickerTrackEl) return;
  if (!events || !events.length) {
    cityTickerHide();
    return;
  }

  const maxId = events.reduce((m, e) => Math.max(m, e.id), -Infinity);
  const seenBefore = cityTickerLastSeenMaxId;

  const itemsHtml = events.map((e) => {
    const isNew = seenBefore !== Infinity && e.id > seenBefore;
    return `<span class="city-ticker-item${isNew ? ' city-ticker-item-new' : ''}">${cityTickerEscapeHtml(e.message)}</span>`;
  }).join('<span class="city-ticker-sep" aria-hidden="true">&bull;</span>');

  // Duplicated back-to-back so the CSS keyframe can loop translateX(0 -> -50%) seamlessly with no
  // visible seam or snap-back -- see ticker.css's @keyframes city-ticker-scroll.
  cityTickerTrackEl.innerHTML = `
    <div class="city-ticker-half">${itemsHtml}</div>
    <div class="city-ticker-half" aria-hidden="true">${itemsHtml}</div>
  `;

  cityTickerEl.classList.remove('city-ticker-empty');

  // Scroll speed proportional to content width so the pace reads the same whether there are 3
  // events or 30 -- measured after the duplicated content is in the DOM so scrollWidth is real.
  const halfWidth = cityTickerTrackEl.scrollWidth / 2;
  const duration = Math.max(12, halfWidth / CITY_TICKER_PX_PER_SEC);
  cityTickerTrackEl.style.setProperty('--city-ticker-duration', `${duration}s`);

  cityTickerLastSeenMaxId = maxId;

  if (seenBefore !== Infinity && maxId > seenBefore) {
    setTimeout(() => {
      cityTickerTrackEl.querySelectorAll('.city-ticker-item-new').forEach((el) => el.classList.remove('city-ticker-item-new'));
    }, CITY_TICKER_HIGHLIGHT_MS);
  }
}

async function refreshCityTicker() {
  if (!cityTickerEl) return;
  if (typeof getAuthToken !== 'function' || !getAuthToken()) return;
  try {
    const result = await apiRequest('/city/events');
    if (!result || !result.ok || !Array.isArray(result.events) || !result.events.length) {
      cityTickerHide();
      return;
    }
    cityTickerRender(result.events);
  } catch {
    // Never show a broken/empty ticker -- hide entirely on any fetch failure, same as an empty feed.
    cityTickerHide();
  }
}

if (cityTickerEl) {
  setInterval(refreshCityTicker, CITY_TICKER_POLL_MS);
  refreshCityTicker();
}
