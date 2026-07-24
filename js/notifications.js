// ---------- Notifications bell (payments received + MTN sales) ----------
// Polls globally, independent of page, since the bell lives in the header and either kind of
// notification can arrive while the recipient is anywhere in the app -- same "always poll" idiom
// as chat. Payments and MTN sales are two separate tables/routes server-side (matching this
// codebase's convention of not sharing storage across notification types), but both are quiet
// "good news" that share one bell/dropdown client-side instead of getting a second bell icon --
// merged and sorted by time here.
const btnNotifBell = document.getElementById('btnNotifBell');
const notifBellBadge = document.getElementById('notifBellBadge');
const notifDropdown = document.getElementById('notifDropdown');
const notifList = document.getElementById('notifList');

const NOTIF_POLL_MS = 10000;
let notifDropdownOpen = false;

function renderNotifBadge(unseenCount) {
  notifBellBadge.classList.toggle('hidden', !(unseenCount > 0));
}

function notifItemText(n) {
  if (n.kind === 'mtnSale') {
    const item = getItemDef(n.itemId);
    const name = item ? itemLabel(item) : n.itemId;
    return `<b>${escapeHtml(n.buyerName)}</b> bought ${n.qty}x ${escapeHtml(name)} for $${n.total.toFixed(2)}`;
  }
  return `<b>${escapeHtml(n.payerName)}</b> paid you $${n.amount.toFixed(2)}`;
}

function renderNotifList(notifications) {
  if (!notifications.length) {
    notifList.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
    return;
  }
  notifList.innerHTML = notifications.map((n) => `
    <div class="notif-item${n.seen ? '' : ' notif-unseen'}">
      <p>${notifItemText(n)}</p>
      <span class="notif-time">${new Date(n.createdAt).toLocaleString()}</span>
    </div>
  `).join('');
}

// Merges the two sources by recency -- callers just want one combined, time-sorted feed.
function mergeNotifications(payments, mtnSales) {
  const tagged = [
    ...payments.map((n) => ({ ...n, kind: 'payment' })),
    ...mtnSales.map((n) => ({ ...n, kind: 'mtnSale' })),
  ];
  return tagged.sort((a, b) => b.createdAt - a.createdAt);
}

async function refreshNotifications() {
  if (!getAuthToken()) return;
  try {
    const [paymentResult, mtnSaleResult] = await Promise.all([apiPaymentNotifications(), apiMtnSaleNotifications()]);
    renderNotifBadge(paymentResult.unseenCount + mtnSaleResult.unseenCount);
    if (notifDropdownOpen) renderNotifList(mergeNotifications(paymentResult.notifications, mtnSaleResult.notifications));
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
    const [paymentResult, mtnSaleResult] = await Promise.all([apiMarkPaymentNotificationsSeen(), apiMarkMtnSaleNotificationsSeen()]);
    renderNotifList(mergeNotifications(paymentResult.notifications, mtnSaleResult.notifications));
    renderNotifBadge(paymentResult.unseenCount + mtnSaleResult.unseenCount);
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
