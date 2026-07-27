// ---------- Report tab (bug/wipe/suggestion submissions) ----------
// Submissions go to a shared server-side table (not per-character) since only the admin account
// ever reads them back. The "View Logs" button is visible to everyone -- same UI-only convenience
// pattern as js/admin.js's btnAdmin -- but the real gate is server-side (requireAdminPassword
// checks the signed JWT's username claim, so this can't be bypassed for anything that matters).
const REPORT_ADMIN_USERNAME = 'mrleems';

const reportTypeSelect = document.getElementById('reportTypeSelect');
const reportMessageInput = document.getElementById('reportMessageInput');
const btnReportSubmit = document.getElementById('btnReportSubmit');
const reportSubmitMessage = document.getElementById('reportSubmitMessage');
const btnViewReportLogs = document.getElementById('btnViewReportLogs');

btnReportSubmit.addEventListener('click', async () => {
  const type = reportTypeSelect.value;
  const message = reportMessageInput.value.trim();
  if (!message) {
    reportSubmitMessage.textContent = 'Enter a message first.';
    reportSubmitMessage.className = 'loss';
    return;
  }
  try {
    const result = await apiReportSubmit(type, message);
    reportSubmitMessage.textContent = result.message;
    reportSubmitMessage.className = 'gain';
    reportMessageInput.value = '';
  } catch (err) {
    reportSubmitMessage.textContent = err.reason || 'Something went wrong.';
    reportSubmitMessage.className = 'loss';
  }
});

// ---------- View Logs modal (admin only) ----------
const reportLogsModal = document.getElementById('reportLogsModal');
const btnReportLogsClose = document.getElementById('btnReportLogsClose');
const btnReportLogsCloseX = document.getElementById('btnReportLogsCloseX');
const reportLogsTypeFilter = document.getElementById('reportLogsTypeFilter');
const reportLogsList = document.getElementById('reportLogsList');
const btnReportLogsPrev = document.getElementById('btnReportLogsPrev');
const btnReportLogsNext = document.getElementById('btnReportLogsNext');
const reportLogsPageLabel = document.getElementById('reportLogsPageLabel');

const REPORT_TYPE_LABELS = { bug: '🐛 Bug Report', wipe: '🧹 Wipe Report', suggestion: '💡 Suggestion' };

let reportLogsPage = 0;

async function refreshReportLogs() {
  try {
    const result = await apiReportsList(reportLogsPage, reportLogsTypeFilter.value || null);
    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    reportLogsPage = Math.min(reportLogsPage, totalPages - 1);

    reportLogsList.innerHTML = result.reports.length
      ? result.reports.map((r) => `
        <div class="stock-transaction-row">
          <span class="stock-tx-date">${new Date(r.createdAt).toLocaleString()}</span>
          <span><b>${escapeHtml(r.username)}</b> &mdash; ${REPORT_TYPE_LABELS[r.type] || r.type}</span>
          <span>${escapeHtml(r.message)}</span>
          <div class="report-resolve-row">
            ${r.resolved
              ? `<span class="report-resolved-badge">✅ Resolved: ${escapeHtml(r.resolvedComment || '')}</span>`
              : `<button class="secondary-btn" data-resolve-report="${r.id}">Resolved</button>`}
          </div>
        </div>
      `).join('')
      : '<p class="equip-picker-empty">No reports yet.</p>';

    reportLogsList.querySelectorAll('[data-resolve-report]').forEach((btn) => {
      btn.addEventListener('click', () => openReportResolveModal(Number(btn.dataset.resolveReport)));
    });

    reportLogsPageLabel.textContent = `Page ${reportLogsPage + 1} of ${totalPages}`;
    btnReportLogsPrev.disabled = reportLogsPage <= 0;
    btnReportLogsNext.disabled = reportLogsPage >= totalPages - 1;
  } catch (err) {
    reportLogsList.innerHTML = `<p class="equip-picker-empty">${escapeHtml(err.reason || 'Failed to load reports.')}</p>`;
  }
}

btnViewReportLogs.addEventListener('click', () => {
  if ((getMyUsername() || '').toLowerCase() !== REPORT_ADMIN_USERNAME) {
    alert('Not authorized.');
    return;
  }
  reportLogsPage = 0;
  reportLogsModal.classList.remove('hidden');
  refreshReportLogs();
});

btnReportLogsClose.addEventListener('click', () => reportLogsModal.classList.add('hidden'));
btnReportLogsCloseX.addEventListener('click', () => reportLogsModal.classList.add('hidden'));
reportLogsTypeFilter.addEventListener('change', () => {
  reportLogsPage = 0;
  refreshReportLogs();
});
btnReportLogsPrev.addEventListener('click', () => {
  reportLogsPage = Math.max(0, reportLogsPage - 1);
  refreshReportLogs();
});
btnReportLogsNext.addEventListener('click', () => {
  reportLogsPage += 1;
  refreshReportLogs();
});

// ---------- Resolve-comment modal ----------
// Marking a report resolved requires a comment, which the server also sends the reporting player
// as a notification (see /reports/:id/resolve in mfmmoserver/server.js) -- so the admin always
// leaves the reporter some kind of response, rather than reports silently disappearing.
const reportResolveModal = document.getElementById('reportResolveModal');
const reportResolveCommentInput = document.getElementById('reportResolveCommentInput');
const btnReportResolveConfirm = document.getElementById('btnReportResolveConfirm');
const btnReportResolveCancel = document.getElementById('btnReportResolveCancel');
const reportResolveError = document.getElementById('reportResolveError');

let reportResolveTargetId = null;

function openReportResolveModal(reportId) {
  reportResolveTargetId = reportId;
  reportResolveCommentInput.value = '';
  reportResolveError.textContent = '';
  reportResolveModal.classList.remove('hidden');
  reportResolveCommentInput.focus();
}

function closeReportResolveModal() {
  reportResolveModal.classList.add('hidden');
  reportResolveTargetId = null;
}

btnReportResolveConfirm.addEventListener('click', async () => {
  const comment = reportResolveCommentInput.value.trim();
  if (!comment) {
    reportResolveError.textContent = 'Enter a comment for the reporter.';
    return;
  }
  try {
    await apiResolveReport(reportResolveTargetId, comment);
    closeReportResolveModal();
    refreshReportLogs();
  } catch (err) {
    reportResolveError.textContent = err.reason || 'Something went wrong.';
  }
});

btnReportResolveCancel.addEventListener('click', closeReportResolveModal);
