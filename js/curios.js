// ---------- Curios George ----------
// Auction system itself isn't built yet -- this just shows a countdown to the next drop so the
// page isn't empty. Next Friday, local midnight (start of day), same "nearest Friday" cadence the
// design doc describes ("every week... 5 days").
const curiosCountdownEl = document.getElementById('curiosCountdown');

function nextFridayMidnight(now) {
  const target = new Date(now);
  target.setHours(0, 0, 0, 0);
  const daysUntilFriday = (5 - target.getDay() + 7) % 7 || 7;
  target.setDate(target.getDate() + daysUntilFriday);
  return target.getTime();
}

function tickCuriosCountdownUI() {
  if (!curiosCountdownEl) return;
  const now = Date.now();
  const remaining = Math.max(0, nextFridayMidnight(now) - now);
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  curiosCountdownEl.textContent = `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}
