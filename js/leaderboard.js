// ---------- Leaderboard ----------
// Read-only view of server-computed rankings. The #1 title in each category is granted/revoked
// server-side once a day (see mfmmoserver's maybeRecomputeLeaderboard) -- this page just polls
// the current standings while it's open, same "gate on tab visible" idiom as the online list.
const leaderboardTabBtns = document.querySelectorAll('.leaderboard-tab-btn');
const leaderboardSubpages = {
  looks: document.getElementById('leaderboard-looks'),
  networth: document.getElementById('leaderboard-networth'),
  level: document.getElementById('leaderboard-level'),
  height: document.getElementById('leaderboard-height'),
};
const leaderboardListEls = {
  looks: document.getElementById('leaderboardLooksList'),
  networth: document.getElementById('leaderboardNetworthList'),
  level: document.getElementById('leaderboardLevelList'),
  height: document.getElementById('leaderboardHeightList'),
};
const leaderboardRefreshNote = document.getElementById('leaderboardRefreshNote');

leaderboardTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    leaderboardTabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(leaderboardSubpages).forEach(([key, el]) => el.classList.toggle('hidden', key !== btn.dataset.leaderboard));
  });
});

const LEADERBOARD_POLL_MS = 20000;
let leaderboardPollInterval = null;
let leaderboardTabVisible = false;

const LEADERBOARD_VALUE_FORMAT = {
  looks: (v) => round1(v),
  networth: (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  level: (v) => v,
  height: (v) => formatHeight(v),
};

function renderLeaderboardCategory(category, entries) {
  const el = leaderboardListEls[category];
  if (!entries.length) {
    el.innerHTML = '<p class="leaderboard-empty">No players yet.</p>';
    return;
  }
  const format = LEADERBOARD_VALUE_FORMAT[category];
  el.innerHTML = entries.map((entry, i) => `
    <div class="leaderboard-row${i === 0 ? ' leaderboard-row-first' : ''}">
      <span class="leaderboard-rank">${i === 0 ? '🥇' : `#${i + 1}`}</span>
      <span class="leaderboard-name">${entry.name}${entry.holdsTitle ? ' 👑' : ''}</span>
      <span class="leaderboard-value">${format(entry.value)}</span>
    </div>
  `).join('');
}

function formatCountdown(ms) {
  if (ms <= 0) return 'due any moment';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

async function refreshLeaderboard() {
  if (!getAuthToken()) return;
  try {
    const result = await apiLeaderboard();
    renderLeaderboardCategory('looks', result.looks);
    renderLeaderboardCategory('networth', result.networth);
    renderLeaderboardCategory('level', result.level);
    renderLeaderboardCategory('height', result.height);
    leaderboardRefreshNote.textContent = `Next title check in ${formatCountdown(result.nextRefreshAt - Date.now())}.`;
  } catch {
    // Best-effort, same as the other polled views.
  }
}

function setLeaderboardTabVisible(visible) {
  leaderboardTabVisible = visible;
  if (visible) {
    refreshLeaderboard();
    if (!leaderboardPollInterval) leaderboardPollInterval = setInterval(refreshLeaderboard, LEADERBOARD_POLL_MS);
  } else if (leaderboardPollInterval) {
    clearInterval(leaderboardPollInterval);
    leaderboardPollInterval = null;
  }
}
