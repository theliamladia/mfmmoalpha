// ---------- Notifications bell (payments received) ----------
// Polls globally, independent of page, since the bell lives in the header and a payment can
// arrive while the recipient is anywhere in the app -- same "always poll" idiom as chat.
const btnNotifBell = document.getElementById('btnNotifBell');
const notifBellBadge = document.getElementById('notifBellBadge');
const notifDropdown = document.getElementById('notifDropdown');
const notifList = document.getElementById('notifList');

const NOTIF_POLL_MS = 10000;
let notifDropdownOpen = false;

function renderNotifBadge(unseenCount) {
  notifBellBadge.classList.toggle('hidden', !(unseenCount > 0));
}

function renderNotifList(notifications) {
  if (!notifications.length) {
    notifList.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
    return;
  }
  notifList.innerHTML = notifications.map((n) => `
    <div class="notif-item${n.seen ? '' : ' notif-unseen'}">
      <p><b>${n.payerName}</b> paid you $${n.amount.toFixed(2)}</p>
      <span class="notif-time">${new Date(n.createdAt).toLocaleString()}</span>
    </div>
  `).join('');
}

async function refreshNotifications() {
  if (!getAuthToken()) return;
  try {
    const result = await apiPaymentNotifications();
    renderNotifBadge(result.unseenCount);
    if (notifDropdownOpen) renderNotifList(result.notifications);
  } catch {
    // Best-effort, same as the other polled views.
  }
}

btnNotifBell.addEventListener('click', async (e) => {
  e.stopPropagation();
  notifDropdownOpen = !notifDropdownOpen;
  notifDropdown.classList.toggle('hidden', !notifDropdownOpen);
  if (!notifDropdownOpen) return;
  try {
    const result = await apiMarkPaymentNotificationsSeen();
    renderNotifList(result.notifications);
    renderNotifBadge(result.unseenCount);
  } catch {
    // Best-effort -- dropdown still opens even if marking-seen fails.
  }
});

document.addEventListener('click', (e) => {
  if (notifDropdownOpen && !notifDropdown.contains(e.target) && e.target !== btnNotifBell) {
    notifDropdownOpen = false;
    notifDropdown.classList.add('hidden');
  }
});

setInterval(refreshNotifications, NOTIF_POLL_MS);
refreshNotifications();

// ---------- Robbery alert modal ----------
// Robberies pop an interrupting modal (unlike payments' quiet bell) since losing cash without
// knowing why is confusing -- polled on the same cadence/idiom as the notification bell above.
const robberyAlertModal = document.getElementById('robberyAlertModal');
const robberyAlertText = document.getElementById('robberyAlertText');
const btnRobberyAlertOk = document.getElementById('btnRobberyAlertOk');

let robberyAlertQueue = [];

function showNextRobberyAlert() {
  if (!robberyAlertQueue.length) {
    robberyAlertModal.classList.add('hidden');
    return;
  }
  const n = robberyAlertQueue[0];
  robberyAlertText.textContent = `${n.robberName} robbed you for $${n.amount.toFixed(2)}!`;
  robberyAlertModal.classList.remove('hidden');
}

btnRobberyAlertOk.addEventListener('click', async () => {
  robberyAlertQueue.shift();
  if (robberyAlertQueue.length) {
    showNextRobberyAlert();
  } else {
    robberyAlertModal.classList.add('hidden');
    try { await apiMarkRobberyNotificationsSeen(); } catch { /* best-effort */ }
  }
});

async function refreshRobberyAlerts() {
  if (!getAuthToken()) return;
  if (robberyAlertQueue.length) return; // already showing/queued -- avoid re-fetching mid-alert
  try {
    const result = await apiRobberyNotifications();
    if (result.notifications.length) {
      robberyAlertQueue = result.notifications;
      showNextRobberyAlert();
    }
  } catch {
    // Best-effort, same as the other polled views.
  }
}

setInterval(refreshRobberyAlerts, NOTIF_POLL_MS);
refreshRobberyAlerts();
