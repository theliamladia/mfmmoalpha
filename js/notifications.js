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
