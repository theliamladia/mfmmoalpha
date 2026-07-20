// ---------- admin ----------
const btnAdmin = document.getElementById('btnAdmin');

const adminMenuModal = document.getElementById('adminMenuModal');
const btnAdminClose = document.getElementById('btnAdminClose');
const btnAdminCloseX = document.getElementById('btnAdminCloseX');
const adminCashInput = document.getElementById('adminCashInput');
const adminChipsInput = document.getElementById('adminChipsInput');
const adminWeightInput = document.getElementById('adminWeightInput');
const adminStatInput = document.getElementById('adminStatInput');
const btnAdminAddCash = document.getElementById('btnAdminAddCash');
const btnAdminAddChips = document.getElementById('btnAdminAddChips');
const btnAdminAddWeight = document.getElementById('btnAdminAddWeight');
const btnAdminAddStats = document.getElementById('btnAdminAddStats');
const adminAllianceButtons = document.querySelectorAll('.admin-alliance-buttons button');
const btnAdminMaxStats = document.getElementById('btnAdminMaxStats');
const btnAdminReleaseJail = document.getElementById('btnAdminReleaseJail');
const btnAdminGiveAdminTitle = document.getElementById('btnAdminGiveAdminTitle');

// UI-only convenience -- the real gate is server-side (server.js requireAdminPassword checks the
// signed JWT's username claim on every admin request, so this can't be bypassed for anything that
// actually matters, even though this client-side check itself can).
const ADMIN_USERNAME = 'mrleems';

btnAdmin.addEventListener('click', () => {
  if ((getMyUsername() || '').toLowerCase() !== ADMIN_USERNAME) {
    alert('Not authorized.');
    return;
  }
  adminMenuModal.classList.remove('hidden');
  refreshAdminPauseButton();
  refreshAdminModifierButtons();
});

btnAdminClose.addEventListener('click', () => {
  adminMenuModal.classList.add('hidden');
});

btnAdminCloseX.addEventListener('click', () => {
  adminMenuModal.classList.add('hidden');
});

btnAdminAddCash.addEventListener('click', () => {
  character.cash += Math.floor(+adminCashInput.value) || 0;
  save();
  renderAll();
});

btnAdminAddChips.addEventListener('click', () => {
  character.chips += Math.floor(+adminChipsInput.value) || 0;
  save();
  renderAll();
});

btnAdminAddWeight.addEventListener('click', () => {
  character.fatGained = Math.max(0, character.fatGained + (+adminWeightInput.value || 0));
  save();
  renderAll();
});

btnAdminAddStats.addEventListener('click', () => {
  const amount = +adminStatInput.value || 0;
  const s = character.stats;
  s.health = clampStat(s.health + amount);
  s.attack = clampStat(s.attack + amount);
  s.speed = clampStat(s.speed + amount);
  s.defense = clampStat(s.defense + amount);
  s.looks = clampStat(s.looks + amount);
  save();
  renderAll();
});

adminAllianceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    character.alliance = clampStat(+btn.dataset.alliance);
    save();
    renderAll();
  });
});

btnAdminMaxStats.addEventListener('click', () => {
  const s = character.stats;
  s.health = STAT_CAP;
  s.attack = STAT_CAP;
  s.speed = STAT_CAP;
  s.defense = STAT_CAP;
  s.looks = STAT_CAP;
  save();
  renderAll();
});

btnAdminReleaseJail.addEventListener('click', () => {
  if (!character.jail.inJail) return;
  releaseFromJail();
});

function doGiveAdminTitle() {
  addToInventory(ADMIN_TITLE.id, 1);
}

btnAdminGiveAdminTitle.addEventListener('click', () => {
  doGiveAdminTitle();
  save();
  renderAll();
  alert('ADMIN title added to your Inventory (Cosmetics). Multiplayer gifting to another player will work the same way once trading is live.');
});

// ---------- Server Controls: pause ----------
const btnAdminTogglePause = document.getElementById('btnAdminTogglePause');

function refreshAdminPauseButton() {
  if (!btnAdminTogglePause) return;
  btnAdminTogglePause.textContent = isGamePaused() ? 'Resume Game' : 'Pause Game';
  btnAdminTogglePause.classList.toggle('active-modifier', isGamePaused());
}

btnAdminTogglePause.addEventListener('click', async () => {
  try {
    const result = await apiAdminSetPause(!isGamePaused());
    serverStateCache = result.state;
    refreshAdminPauseButton();
    renderServerBanners();
    renderAll();
  } catch (err) {
    alert(err.reason || 'Could not reach the server.');
  }
});

// ---------- Modifiers ----------
const adminModifierButtons = document.querySelectorAll('[data-modifier]');

function refreshAdminModifierButtons() {
  const current = activeModifier() || '';
  adminModifierButtons.forEach((btn) => {
    btn.classList.toggle('active-modifier', btn.dataset.modifier === current);
  });
}

adminModifierButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      const result = await apiAdminSetModifier(btn.dataset.modifier || null);
      serverStateCache = result.state;
      refreshAdminModifierButtons();
      renderServerBanners();
      renderAll();
    } catch (err) {
      alert(err.reason || 'Could not reach the server.');
    }
  });
});

// ---------- Inventory Checker ----------
const adminInvCheckInput = document.getElementById('adminInvCheckInput');
const btnAdminInvCheck = document.getElementById('btnAdminInvCheck');
const adminInvCheckResult = document.getElementById('adminInvCheckResult');

function renderInvCheckResult(result) {
  if (!result.ok) {
    adminInvCheckResult.innerHTML = `<p class="arrest-record-empty">${result.reason}</p>`;
    return;
  }
  const items = result.inventory.map((stack) => {
    const item = getItemDef(stack.id);
    return `<div class="arrest-record-row"><span>${item ? item.name : stack.id}</span><span>x${stack.qty}</span></div>`;
  }).join('') || '<p class="arrest-record-empty">No items.</p>';

  const equipped = Object.entries(result.equipment)
    .filter(([, itemId]) => itemId)
    .map(([slot, itemId]) => {
      const item = getItemDef(itemId);
      return `<div class="arrest-record-row"><span>${slot}</span><span>${item ? item.name : itemId}</span></div>`;
    }).join('') || '<p class="arrest-record-empty">Nothing equipped.</p>';

  adminInvCheckResult.innerHTML = `
    <p><b>${result.name}</b> &mdash; Inventory</p>
    ${items}
    <p><b>Equipped</b></p>
    ${equipped}
  `;
}

btnAdminInvCheck.addEventListener('click', async () => {
  try {
    const result = await apiAdminInventory(adminInvCheckInput.value);
    renderInvCheckResult(result);
  } catch (err) {
    renderInvCheckResult(err);
  }
});

// ---------- Title Maker ----------
// Client-side only, like the rest of this admin menu (Give ADMIN Title, stat editors) -- creates a
// full title definition (not just a name) and stores it directly on this character's own save
// (character.titles.customTitles), then adds it to Inventory the same way Give ADMIN Title does.
// Storing the full def alongside the owner's own data (rather than in some separate catalog) is
// what lets OTHER players' clients render it correctly when they see it equipped -- see
// allTitleDefsFor()/displayBadgeMarkupFor() in js/market.js.
const titleMakerLabel = document.getElementById('titleMakerLabel');
const titleMakerBgColor = document.getElementById('titleMakerBgColor');
const titleMakerBorderColor = document.getElementById('titleMakerBorderColor');
const titleMakerTextColor = document.getElementById('titleMakerTextColor');
const titleMakerGifUrl = document.getElementById('titleMakerGifUrl');
const titleMakerPreview = document.getElementById('titleMakerPreview');
const titleMakerError = document.getElementById('titleMakerError');
const btnTitleMakerCreate = document.getElementById('btnTitleMakerCreate');

// https:// only (blocks javascript: etc.) and no characters that could break out of the CSS
// url('...') or the surrounding HTML attribute it's embedded in.
const GIF_URL_RE = /^https:\/\/[^\s"'<>()]+$/i;

function buildTitleMakerPreviewDef() {
  const gifUrl = titleMakerGifUrl.value.trim();
  return {
    id: 'preview',
    name: titleMakerLabel.value.trim() || 'Preview',
    custom: true,
    background: gifUrl || titleMakerBgColor.value,
    isGif: !!gifUrl,
    borderColor: titleMakerBorderColor.value,
    textColor: titleMakerTextColor.value,
    how: 'Custom title created by an admin.',
  };
}

function refreshTitleMakerPreview() {
  titleMakerPreview.innerHTML = titleBadgeMarkup(buildTitleMakerPreviewDef());
}

[titleMakerLabel, titleMakerBgColor, titleMakerBorderColor, titleMakerTextColor, titleMakerGifUrl].forEach((el) => {
  el.addEventListener('input', refreshTitleMakerPreview);
});
refreshTitleMakerPreview();

btnTitleMakerCreate.addEventListener('click', () => {
  titleMakerError.textContent = '';
  const label = titleMakerLabel.value.trim();
  if (!label) { titleMakerError.textContent = 'Enter a title label.'; return; }

  const gifUrl = titleMakerGifUrl.value.trim();
  if (gifUrl && !GIF_URL_RE.test(gifUrl)) {
    titleMakerError.textContent = 'GIF/image URL must start with https:// and contain no quotes, parentheses, or spaces.';
    return;
  }

  const def = {
    id: `custom_${Date.now()}`,
    name: escapeHtml(label),
    custom: true,
    background: gifUrl || titleMakerBgColor.value,
    isGif: !!gifUrl,
    borderColor: titleMakerBorderColor.value,
    textColor: titleMakerTextColor.value,
    how: 'Custom title created by an admin.',
  };

  if (!character.titles.customTitles) character.titles.customTitles = [];
  character.titles.customTitles.push(def);
  addToInventory(def.id, 1);
  save();
  apiSyncCharacter(character);
  renderAll();

  titleMakerLabel.value = '';
  titleMakerGifUrl.value = '';
  refreshTitleMakerPreview();
  alert(`"${label}" added to your Inventory (Cosmetics).`);
});

