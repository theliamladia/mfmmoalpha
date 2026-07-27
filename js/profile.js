// ---------- Player Profiles ----------
const PROFILE_SHOWCASE_MAX = 4;

const profileNotFound = document.getElementById('profileNotFound');
const profileContent = document.getElementById('profileContent');
const profileBannerEl = document.getElementById('profileBanner');
const btnProfileShuffleBanner = document.getElementById('btnProfileShuffleBanner');
const profileNameEl = document.getElementById('profileName');
const btnProfileStatus = document.getElementById('btnProfileStatus');
const profileStatusText = document.getElementById('profileStatusText');
const profileLevelBadge = document.getElementById('profileLevelBadge');
const profileAllianceBadge = document.getElementById('profileAllianceBadge');
const profileCashEl = document.getElementById('profileCash');
const profileFcEl = document.getElementById('profileFc');
const profilePortfolioGrid = document.getElementById('profilePortfolioGrid');
const profileShowcaseList = document.getElementById('profileShowcaseList');
const btnProfileShowcaseAdd = document.getElementById('btnProfileShowcaseAdd');
const profileShowcasePicker = document.getElementById('profileShowcasePicker');
const profileShowcasePickerTitle = document.getElementById('profileShowcasePickerTitle');
const profileShowcasePickerList = document.getElementById('profileShowcasePickerList');
const btnProfileShowcasePickerClose = document.getElementById('btnProfileShowcasePickerClose');
const profileWallInput = document.getElementById('profileWallInput');
const btnProfileWallPost = document.getElementById('btnProfileWallPost');
const profileWallList = document.getElementById('profileWallList');
const profileWallPagination = document.getElementById('profileWallPagination');

let profileViewCache = null; // { username, character, level, isOwner, wallPage, wallTotalPages, wallPageNum }
let profileNavTargetUsername = null; // consumed once by switchPage('profile') in js/core.js

// Every owned title def for an arbitrary (possibly not-your-own) character -- crate/store titles
// live in .inventory as {id, qty} stacks, custom titles live in .titles.customTitles, and
// achievement/leaderboard titles live in .titles.owned. allTitleDefsFor/getItemDef (js/market.js,
// js/core.js) already accept an explicit char argument, so this just combines the ownership check.
function profileOwnedTitleDefs(char) {
  return allTitleDefsFor(char).filter((def) => (
    (char.titles.owned || []).includes(def.id)
    || (char.inventory || []).some((s) => s.id === def.id && s.qty > 0)
  ));
}

function profileEquippedTitle(char) {
  const equippedId = char.titles && char.titles.equipped;
  if (!equippedId) return null;
  if (!profileOwnedTitleDefs(char).some((d) => d.id === equippedId)) return null;
  return getItemDef(equippedId, char);
}

// Banner is independent of the equipped title (see btnProfileShuffleBanner) -- falls back to
// whatever's actually equipped if no separate banner choice was made or it's no longer owned.
function profileBannerTitle(char) {
  const bannerTitleId = char.profile && char.profile.bannerTitleId;
  if (bannerTitleId && profileOwnedTitleDefs(char).some((d) => d.id === bannerTitleId)) {
    return getItemDef(bannerTitleId, char);
  }
  return profileEquippedTitle(char);
}

// Same background-resolution rules as titleBadgeMarkup (js/market.js), just applied to the big
// banner div instead of a small chip -- custom titles carry their own background inline, static
// catalog titles reuse their existing .title-CLASS { background-image/... } CSS rule instead.
function applyProfileBanner(title) {
  profileBannerEl.className = 'profile-banner' + (title && !title.custom ? ` ${title.cssClass}` : '');
  if (title && title.custom) {
    profileBannerEl.style.cssText = title.isGif
      ? `background-image:url('${title.background}');background-size:cover;background-position:center;`
      : `background:${title.background};`;
  } else {
    profileBannerEl.style.cssText = '';
  }
}

// Markup version of applyProfileBanner(), for embedding a small banner preview inline (the Players
// Online hover card) instead of writing directly to the one profileBannerEl on the Profile page.
function profileBannerDivHtml(title, extraClass) {
  const cls = 'profile-banner' + (extraClass ? ` ${extraClass}` : '') + (title && !title.custom ? ` ${title.cssClass}` : '');
  let style = '';
  if (title && title.custom) {
    style = title.isGif
      ? `background-image:url('${title.background}');background-size:cover;background-position:center;`
      : `background:${title.background};`;
  }
  return `<div class="${cls}" style="${style}"></div>`;
}

// "Profile name will be art name style of the badge" -- reuses the same .title-CLASS .title-text
// descendant-selector trick titleBadgeMarkup uses for the chip, just without the chip chrome.
function profileNameHtml(title, fullName) {
  const escaped = escapeHtml(fullName);
  if (!title) return escaped;
  if (title.custom) {
    const style = title.textColor ? `color:${title.textColor};` : '';
    return `<span style="${style}">${escaped}</span>`;
  }
  return `<span class="${title.cssClass}"><span class="title-text">${escaped}</span></span>`;
}

function viewProfile(username) {
  profileNavTargetUsername = username;
  switchPage('profile');
}

async function loadProfile(username, page) {
  try {
    const result = await apiGetProfile(username, page || 1);
    profileViewCache = result;
    renderProfile();
  } catch {
    profileViewCache = null;
    profileNotFound.classList.remove('hidden');
    profileContent.classList.add('hidden');
  }
}

function renderProfile() {
  if (!profileViewCache) return;
  profileNotFound.classList.add('hidden');
  profileContent.classList.remove('hidden');

  const { character: viewedChar, isOwner, level, username } = profileViewCache;
  if (!viewedChar.profile) viewedChar.profile = { bannerTitleId: null, showcaseTitleIds: [], status: '' };
  const profileState = viewedChar.profile;

  const bannerTitle = profileBannerTitle(viewedChar);
  applyProfileBanner(bannerTitle);
  btnProfileShuffleBanner.classList.toggle('hidden', !isOwner);

  const fullName = `${viewedChar.firstName} ${viewedChar.lastName}`;
  profileNameEl.innerHTML = profileNameHtml(bannerTitle, fullName);

  btnProfileStatus.classList.toggle('hidden', !isOwner);
  const status = profileState.status || '';
  profileStatusText.textContent = status;
  profileStatusText.classList.toggle('hidden', !status);

  profileLevelBadge.textContent = `⭐ Lvl ${level}`;
  profileAllianceBadge.textContent = allianceLabel(viewedChar.alliance);

  profileCashEl.textContent = Math.floor(viewedChar.cash || 0).toLocaleString();
  profileFcEl.textContent = (viewedChar.crypto ? viewedChar.crypto.fc : 0).toFixed(4);

  const holdings = (viewedChar.stocks && viewedChar.stocks.holdings) || {};
  const holdingRows = Object.entries(holdings);
  profilePortfolioGrid.innerHTML = holdingRows.length
    ? holdingRows.map(([symbol, holding]) => {
      // stocksCache (js/stockMarket.js) only has live prices once the viewer has opened Investors
      // Center this session -- fall back to avg cost (no gain/loss shown) rather than fetching a
      // second, separate price feed just for this mini widget.
      const live = typeof stocksCache !== 'undefined' ? stocksCache.find((s) => s.symbol === symbol) : null;
      const price = live ? live.price : holding.avgCost;
      const value = round2(price * holding.qty);
      return `
        <div class="stock-portfolio-row">
          <span>${symbol} &times; ${holding.qty}</span>
          <span>Avg Cost $${holding.avgCost.toLocaleString()}</span>
          <span>Value $${value.toLocaleString()}</span>
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No positions.</p>';

  const showcaseIds = profileState.showcaseTitleIds || [];
  const showcaseDefs = showcaseIds.map((id) => getItemDef(id, viewedChar)).filter(Boolean);
  profileShowcaseList.innerHTML = showcaseDefs.length
    ? showcaseDefs.map((def) => `
      <div class="profile-showcase-item">
        ${titleBadgeMarkup(def)}
        <div class="profile-showcase-text">
          <p class="profile-showcase-name">${escapeHtml(def.name)}</p>
          <p class="profile-showcase-how">${escapeHtml(def.how || '')}</p>
        </div>
        ${isOwner ? `<button class="secondary-btn" data-showcase-remove="${def.id}">Remove</button>` : ''}
      </div>
    `).join('')
    : '<p class="equip-picker-empty">No titles showcased yet.</p>';

  btnProfileShowcaseAdd.classList.toggle('hidden', !isOwner || showcaseIds.length >= PROFILE_SHOWCASE_MAX);

  if (isOwner) {
    profileShowcaseList.querySelectorAll('button[data-showcase-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await apiRemoveShowcaseTitle(btn.dataset.showcaseRemove);
          character = result.character;
          save();
          renderAll();
          await loadProfile(username);
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  }

  renderProfileWall();
}

function renderProfileWall() {
  const { wallPage, wallTotalPages, wallPageNum, isOwner, username } = profileViewCache;
  profileWallList.innerHTML = wallPage.length
    ? wallPage.map((post) => `
      <div class="profile-wall-post">
        <div class="profile-wall-post-header">
          <b>${escapeHtml(post.authorName)}</b>
          <span class="profile-wall-post-date">${new Date(post.ts).toLocaleString()}</span>
          ${isOwner ? `<button class="profile-wall-delete" data-wall-delete="${post.id}" title="Delete">🗑️</button>` : ''}
        </div>
        <p>${escapeHtml(post.text)}</p>
      </div>
    `).join('')
    : '<p class="equip-picker-empty">No comments yet.</p>';

  profileWallPagination.innerHTML = wallTotalPages > 1
    ? Array.from({ length: wallTotalPages }, (_, i) => i + 1)
      .map((n) => `<button class="${n === wallPageNum ? '' : 'secondary-btn'}" data-wall-page="${n}" ${n === wallPageNum ? 'disabled' : ''}>${n}</button>`)
      .join('')
    : '';

  profileWallList.querySelectorAll('button[data-wall-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiDeleteWallPost(username, btn.dataset.wallDelete, wallPageNum);
        profileViewCache.wallPage = result.wallPage;
        profileViewCache.wallTotalPages = result.wallTotalPages;
        profileViewCache.wallPageNum = result.wallPageNum;
        renderProfileWall();
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });

  profileWallPagination.querySelectorAll('button[data-wall-page]').forEach((btn) => {
    btn.addEventListener('click', () => loadProfile(username, Number(btn.dataset.wallPage)));
  });
}

btnProfileWallPost.addEventListener('click', async () => {
  if (!profileViewCache) return;
  const text = profileWallInput.value.trim();
  if (!text) return;
  try {
    const result = await apiPostWall(profileViewCache.username, text);
    profileWallInput.value = '';
    profileViewCache.wallPage = result.wallPage;
    profileViewCache.wallTotalPages = result.wallTotalPages;
    profileViewCache.wallPageNum = result.wallPageNum;
    renderProfileWall();
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

btnProfileStatus.addEventListener('click', async () => {
  if (!profileViewCache) return;
  const current = (profileViewCache.character.profile && profileViewCache.character.profile.status) || '';
  const next = prompt('Update your status:', current);
  if (next === null) return;
  try {
    const result = await apiSetProfileStatus(next);
    character = result.character;
    save();
    renderAll();
    await loadProfile(profileViewCache.username);
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
});

function openProfilePicker(heading, items) {
  profileShowcasePickerTitle.textContent = heading;
  profileShowcasePickerList.innerHTML = items;
  profileShowcasePicker.classList.remove('hidden');
}

btnProfileShowcasePickerClose.addEventListener('click', () => profileShowcasePicker.classList.add('hidden'));

btnProfileShowcaseAdd.addEventListener('click', () => {
  if (!profileViewCache) return;
  const owned = profileOwnedTitleDefs(profileViewCache.character);
  const showcaseIds = (profileViewCache.character.profile && profileViewCache.character.profile.showcaseTitleIds) || [];
  const available = owned.filter((d) => !showcaseIds.includes(d.id));
  const items = available.length
    ? available.map((def) => `
      <div class="hustle-card">
        ${titleBadgeMarkup(def)}
        <button data-showcase-pick="${def.id}">Add</button>
      </div>
    `).join('')
    : '<p class="equip-picker-empty">No more titles to add.</p>';
  openProfilePicker('Add a title to your Showcase', items);

  profileShowcasePickerList.querySelectorAll('button[data-showcase-pick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiAddShowcaseTitle(btn.dataset.showcasePick);
        character = result.character;
        save();
        renderAll();
        profileShowcasePicker.classList.add('hidden');
        await loadProfile(profileViewCache.username);
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
});

btnProfileShuffleBanner.addEventListener('click', () => {
  if (!profileViewCache) return;
  const owned = profileOwnedTitleDefs(profileViewCache.character);
  const items = [
    `<div class="hustle-card"><p>Equipped Title</p><button data-banner-pick="">Use</button></div>`,
    ...owned.map((def) => `
      <div class="hustle-card">
        ${titleBadgeMarkup(def)}
        <button data-banner-pick="${def.id}">Use</button>
      </div>
    `),
  ].join('');
  openProfilePicker('Change your profile banner', items);

  profileShowcasePickerList.querySelectorAll('button[data-banner-pick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiSetProfileBanner(btn.dataset.bannerPick || null);
        character = result.character;
        save();
        renderAll();
        profileShowcasePicker.classList.add('hidden');
        await loadProfile(profileViewCache.username);
      } catch (err) {
        if (err.reason) alert(err.reason);
      }
    });
  });
});
