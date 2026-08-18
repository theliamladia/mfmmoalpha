// ---------- Player Profiles ----------
const PROFILE_SHOWCASE_MAX = 4;
const PROFILE_SLAB_SHOWCASE_MAX = 6;
const PROFILE_SLAB_MARKET_MAX = 6;

const profileNotFound = document.getElementById('profileNotFound');
const profileContent = document.getElementById('profileContent');
const profileVisionRow = document.getElementById('profileVisionRow');
const profileVisionSwatch = document.getElementById('profileVisionSwatch');
const profileVisionLabel = document.getElementById('profileVisionLabel');
const btnProfileVisionChange = document.getElementById('btnProfileVisionChange');
const profileBannerEl = document.getElementById('profileBanner');
const btnProfileShuffleBanner = document.getElementById('btnProfileShuffleBanner');
const profileNameEl = document.getElementById('profileName');
const profileNameTitleBadge = document.getElementById('profileNameTitleBadge');
const btnProfileStatus = document.getElementById('btnProfileStatus');
const profileStatusText = document.getElementById('profileStatusText');
const profileLevelBadge = document.getElementById('profileLevelBadge');
const profileAllianceBadge = document.getElementById('profileAllianceBadge');
const profileCashEl = document.getElementById('profileCash');
const profileFcEl = document.getElementById('profileFc');
const btnToggleCashPrivacy = document.getElementById('btnToggleCashPrivacy');
const btnToggleFcPrivacy = document.getElementById('btnToggleFcPrivacy');
const btnTogglePortfolioPrivacy = document.getElementById('btnTogglePortfolioPrivacy');
const profilePortfolioGrid = document.getElementById('profilePortfolioGrid');
const profileShowcaseList = document.getElementById('profileShowcaseList');
const btnProfileShowcaseAdd = document.getElementById('btnProfileShowcaseAdd');
const profileShowcasePicker = document.getElementById('profileShowcasePicker');
const profileShowcasePickerTitle = document.getElementById('profileShowcasePickerTitle');
const profileShowcasePickerList = document.getElementById('profileShowcasePickerList');
const btnProfileShowcasePickerClose = document.getElementById('btnProfileShowcasePickerClose');
const profileSlabShowcaseGrid = document.getElementById('profileSlabShowcaseGrid');
const btnProfileSlabShowcaseAdd = document.getElementById('btnProfileSlabShowcaseAdd');
const profileSlabMarketGrid = document.getElementById('profileSlabMarketGrid');
const btnProfileSlabMarketList = document.getElementById('btnProfileSlabMarketList');
const profileWallInput = document.getElementById('profileWallInput');
const btnProfileWallPost = document.getElementById('btnProfileWallPost');
const profileWallList = document.getElementById('profileWallList');
const profileWallPagination = document.getElementById('profileWallPagination');

let profileViewCache = null; // { username, character, level, isOwner, wallPage, wallTotalPages, wallPageNum }
let profileNavTargetUsername = null; // consumed once by switchPage('profile') in js/core.js

// Every owned title def for an arbitrary (possibly not-your-own) character -- mirrors
// ownedTitleDefs() (js/market.js) exactly, just parameterized on an explicit char instead of the
// global `character`. Resolving inventory stacks through getItemDef(stack.id, char) (rather than
// filtering allTitleDefsFor by base id) is what correctly picks up prestiged copies too, since a
// prestige stack's id (e.g. `baseId_p2`) never matches a base def's id directly.
function profileOwnedTitleDefs(char) {
  const fromOwned = (char.titles.owned || []).map((id) => getItemDef(id, char)).filter((t) => t && t.type === 'title');
  const fromInventory = (char.inventory || [])
    .filter((stack) => stack.qty > 0)
    .map((stack) => getItemDef(stack.id, char))
    .filter((t) => t && t.type === 'title');
  const seen = new Set();
  return [...fromOwned, ...fromInventory].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
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

// Plain name, deliberately -- an earlier version wrapped this in the banner title's own
// .title-CLASS (the same class that carries its background-image), which put a small cropped
// slice of that art directly behind the name text. The banner above already shows that art at
// full size; the name itself just stays plain text.
function profileNameHtml(fullName) {
  return escapeHtml(fullName);
}

function viewProfile(username) {
  profileNavTargetUsername = username;
  switchPage('profile');
}

// Every owned Vision def for an arbitrary character -- same "read inventory stacks" shape as
// profileOwnedTitleDefs below, just against VISIONS_TITLES instead of the title catalogs (Visions
// aren't titles, see the getItemDef vision branch in core.js, so they need their own lookup here).
function profileOwnedVisionDefs(char) {
  return (char.inventory || [])
    .filter((stack) => stack.qty > 0)
    .map((stack) => VISIONS_TITLES.find((v) => v.id === stack.id))
    .filter(Boolean);
}

function renderProfileVisionRow(viewedChar, isOwner) {
  if (!profileVisionRow) return;
  const equippedId = viewedChar.visions && viewedChar.visions.equipped;
  const def = equippedId ? VISIONS_TITLES.find((v) => v.id === equippedId) : null;
  profileVisionSwatch.className = `profile-vision-swatch${def ? ` ${def.cssClass}` : ''}`;
  profileVisionLabel.textContent = def ? `🌀 Vision: ${def.name}` : '🌀 No Vision equipped';
  btnProfileVisionChange.classList.toggle('hidden', !isOwner);
}

if (btnProfileVisionChange) {
  btnProfileVisionChange.addEventListener('click', () => {
    if (!profileViewCache) return;
    const owned = profileOwnedVisionDefs(profileViewCache.character);
    openProfilePicker('Change your Vision');
    const noneRow = `<div class="title-dropdown-item" data-pick-vision="none">None</div>`;
    profileShowcasePickerList.innerHTML = noneRow + (owned.length
      ? owned.map((v) => `
          <div class="title-dropdown-item" data-pick-vision="${v.id}">
            <span class="title-badge ${v.cssClass}"><span class="title-text">${escapeHtml(v.name)}</span></span>
          </div>
        `).join('')
      : '<p class="equip-picker-empty">No Visions yet. Spin one in GOOD®.</p>');

    profileShowcasePickerList.querySelectorAll('[data-pick-vision]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.pickVision;
        if (!character.visions) character.visions = { equipped: null };
        character.visions.equipped = id === 'none' ? null : id;
        save();
        // profileViewCache.character is always its own fetched-from-server copy (even for the
        // owner's own profile, see loadProfile above) -- kept in sync directly here instead of
        // re-fetching, since equipping a Vision is purely client-state with no server route of its
        // own to await first (unlike e.g. the Portfolio Showcase actions, which really do need the
        // round trip because the server made the actual change).
        profileViewCache.character.visions = { ...(profileViewCache.character.visions || {}), equipped: character.visions.equipped };
        profileShowcasePicker.classList.add('hidden');
        renderAll();
        renderProfile();
      });
    });
  });
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
  // Driven by whoever's profile THIS IS (viewedChar), never the viewer's own character -- so
  // visiting someone else's profile shows THEIR equipped Vision scoped to just this page, while
  // the rest of your own app view stays on your own theme (see applyOwnVisionTheme in renderAll).
  if (typeof applyProfileVisionTheme === 'function') applyProfileVisionTheme(viewedChar);
  renderProfileVisionRow(viewedChar, isOwner);
  const privacy = profileState.privacy || { cash: false, fc: false, portfolio: false };

  const bannerTitle = profileBannerTitle(viewedChar);
  applyProfileBanner(bannerTitle);
  btnProfileShuffleBanner.classList.toggle('hidden', !isOwner);

  const fullName = `${viewedChar.firstName} ${viewedChar.lastName}`;
  profileNameEl.innerHTML = profileNameHtml(fullName);

  // Equipped title, rendered with the exact same markup helper the rest of the game uses (chat,
  // showcase, dropdowns) -- foils/mythic effects/hidden-name art all come along for free. Renders
  // nothing (no empty chip) when no title is equipped, same "omit entirely" idiom as
  // profileStatusText above. profileEquippedTitle already re-validates against viewedChar's actual
  // ownership, so a title that's since been traded/cracked away can't linger here.
  const equippedTitleDef = profileEquippedTitle(viewedChar);
  // "Rank" here is the equipped Balaclava BADGE (the chip that renders before the title everywhere
  // else -- see badgeChipMarkup in core.js), per the owner's clarification. It leads the title in
  // the name row for the same reason it leads it in chat/roster: badge, then title, then name reads
  // as one identity unit. badgeChipMarkup is already parameterized on the viewed character and
  // returns '' when nothing is equipped, so other players' profiles and badge-less players both
  // come for free.
  profileNameTitleBadge.innerHTML = badgeChipMarkup(viewedChar) + (equippedTitleDef ? titleBadgeMarkup(equippedTitleDef) : '');

  btnProfileStatus.classList.toggle('hidden', !isOwner);
  const status = profileState.status || '';
  profileStatusText.textContent = status;
  profileStatusText.classList.toggle('hidden', !status);

  // "Rank" per the game's existing terminology -- there's no separate ranking system, just the
  // same Level shown in the topbar (see levelBadgeEl in core.js) and leaderboard, computed
  // server-side into profileViewCache.level so it's correct for other players too.
  profileLevelBadge.textContent = `⭐ Lvl ${level}`;
  profileAllianceBadge.textContent = allianceLabel(viewedChar.alliance, viewedChar);

  // The server already redacts cash/fc/stocks to null/empty for non-owners when private (see
  // GET /profile/:username) -- this just decides what to show in their place. The owner's own
  // view is never redacted, so `privacy` alone (not the redacted value) drives their eye-icon state.
  const cashHidden = !isOwner && privacy.cash;
  const fcHidden = !isOwner && privacy.fc;
  const portfolioHidden = !isOwner && privacy.portfolio;

  profileCashEl.textContent = cashHidden ? '🔒 Private' : Math.floor(viewedChar.cash || 0).toLocaleString();
  profileFcEl.textContent = fcHidden ? '🔒 Private' : (viewedChar.crypto ? viewedChar.crypto.fc : 0).toFixed(4);

  btnToggleCashPrivacy.classList.toggle('hidden', !isOwner);
  btnToggleFcPrivacy.classList.toggle('hidden', !isOwner);
  btnTogglePortfolioPrivacy.classList.toggle('hidden', !isOwner);
  btnToggleCashPrivacy.textContent = privacy.cash ? '🙈' : '👁️';
  btnToggleFcPrivacy.textContent = privacy.fc ? '🙈' : '👁️';
  btnTogglePortfolioPrivacy.textContent = privacy.portfolio ? '🙈' : '👁️';
  btnToggleCashPrivacy.title = privacy.cash ? 'Private -- click to make public' : 'Public -- click to make private';
  btnToggleFcPrivacy.title = btnToggleCashPrivacy.title;
  btnTogglePortfolioPrivacy.title = btnToggleCashPrivacy.title;

  const holdings = (viewedChar.stocks && viewedChar.stocks.holdings) || {};
  const holdingRows = Object.entries(holdings);
  profilePortfolioGrid.innerHTML = portfolioHidden
    ? '<p class="equip-picker-empty">🔒 Private</p>'
    : holdingRows.length
      ? holdingRows.map(([symbol, holding]) => {
        // stocksCache (js/stockMarket.js) only has live prices once the viewer has opened
        // Investors Center this session -- fall back to avg cost (no gain/loss shown) rather than
        // fetching a second, separate price feed just for this mini widget.
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
          <p class="profile-showcase-name">${escapeHtml(itemLabel(def))}</p>
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

  renderProfileSlabShowcase();
  renderProfileSlabMarket();
  renderProfileWall();
}

// Portfolio Showcase: same pin/unpin shape as the Title Showcase above, restricted to graded slabs
// (nmgGrade truthy) and rendered full-size via nmgSlabHtml (js/nmg.js) instead of the small badge
// chip -- the whole point of this section is showing off the actual slab art.
function renderProfileSlabShowcase() {
  if (!profileViewCache) return;
  const { character: viewedChar, isOwner } = profileViewCache;
  const profileState = viewedChar.profile || {};
  const slabIds = profileState.slabShowcaseIds || [];
  const slabDefs = slabIds.map((id) => getItemDef(id, viewedChar)).filter((d) => d && d.nmgGrade);

  profileSlabShowcaseGrid.innerHTML = slabDefs.length
    ? slabDefs.map((def) => `
      <div class="profile-slab-slot">
        ${nmgSlabHtml(def)}
        ${slabEstValueHtml(def)}
        ${isOwner ? `
          <div class="profile-slab-slot-actions">
            <button class="secondary-btn" data-slab-showcase-remove="${def.id}">Remove</button>
          </div>
        ` : ''}
      </div>
    `).join('')
    : '<p class="equip-picker-empty">No slabs showcased yet.</p>';

  btnProfileSlabShowcaseAdd.classList.toggle('hidden', !isOwner || slabIds.length >= PROFILE_SLAB_SHOWCASE_MAX);

  if (isOwner) {
    profileSlabShowcaseGrid.querySelectorAll('button[data-slab-showcase-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await apiRemoveSlabShowcase(btn.dataset.slabShowcaseRemove);
          character = result.character;
          save();
          renderAll();
          await loadProfile(profileViewCache.username);
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  }
}

// Player Market: backed by the same shared mtn_listings table as the general Milos Trading
// Network (js/mtn.js) -- listings are agnostic to which UI created them, so Cancel/Buy here just
// reuse apiMtnCancel/apiMtnBuy unchanged. profileViewCache.slabMarketListings is already scoped to
// this one profile's graded-title listings server-side (GET /profile/:username).
function renderProfileSlabMarket() {
  if (!profileViewCache) return;
  const { isOwner, slabMarketListings } = profileViewCache;
  const listings = slabMarketListings || [];

  profileSlabMarketGrid.innerHTML = listings.length
    ? listings.map((listing) => {
      const def = getItemDef(listing.itemId);
      if (!def) return '';
      return `
        <div class="profile-slab-slot">
          ${nmgSlabHtml(def)}
          <p class="profile-slab-market-price">$${listing.pricePerUnit.toLocaleString()}</p>
          <div class="profile-slab-slot-actions">
            ${isOwner
              ? `<button class="secondary-btn" data-slab-market-cancel="${listing.id}">Cancel Listing</button>`
              : `<button data-slab-market-buy="${listing.id}">Buy</button>`}
          </div>
        </div>
      `;
    }).join('')
    : '<p class="equip-picker-empty">No slabs listed for sale.</p>';

  btnProfileSlabMarketList.classList.toggle('hidden', !isOwner || listings.length >= PROFILE_SLAB_MARKET_MAX);

  if (isOwner) {
    profileSlabMarketGrid.querySelectorAll('button[data-slab-market-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await apiMtnCancel(Number(btn.dataset.slabMarketCancel));
          character = result.character;
          save();
          renderAll();
          await loadProfile(profileViewCache.username);
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  } else {
    profileSlabMarketGrid.querySelectorAll('button[data-slab-market-buy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Buy this slab?')) return;
        try {
          const result = await apiMtnBuy(Number(btn.dataset.slabMarketBuy));
          character = result.character;
          save();
          renderAll();
          await loadProfile(profileViewCache.username);
        } catch (err) {
          if (err.reason) alert(err.reason);
        }
      });
    });
  }
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

async function toggleProfilePrivacy(field) {
  if (!profileViewCache) return;
  try {
    const result = await apiToggleProfilePrivacy(field);
    character = result.character;
    save();
    renderAll();
    await loadProfile(profileViewCache.username);
  } catch (err) {
    if (err.reason) alert(err.reason);
  }
}
btnToggleCashPrivacy.addEventListener('click', () => toggleProfilePrivacy('cash'));
btnToggleFcPrivacy.addEventListener('click', () => toggleProfilePrivacy('fc'));
btnTogglePortfolioPrivacy.addEventListener('click', () => toggleProfilePrivacy('portfolio'));

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

// Same crate-grouped, collapsible, rarity/prestige-sorted dropdown tech as the "Switch title"
// chevron (renderTitleDropdown() in js/bank.js), just parameterized over an arbitrary item list
// and click callback instead of being wired straight to doEquipTitle(). Kept as its own function
// rather than generalizing renderTitleDropdown() itself, since that one is tightly coupled to the
// self-only "equip" action and character.titles.equipped highlighting.
const expandedProfilePickerGroups = new Set();

// `listEl` defaults to the Profile Showcase/Banner picker's own list so both existing call sites
// (Showcase-add, Banner-shuffle) work unchanged -- pass a different element to reuse this same
// grouped/sorted/collapsible picker UI against a different modal (e.g. the NMG title-submit picker
// in js/nmg.js) without duplicating this logic.
function renderGroupedTitlePicker(items, onPick, extraTopHtml, listEl = profileShowcasePickerList) {
  const groups = new Map();
  items.forEach((t) => {
    const label = titleCrateGroupLabel(t);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  });
  groups.forEach((arr) => arr.sort(compareTitleStacksByRarityThenPrestige((t) => t.id, (t) => t)));
  const orderedLabels = [...TITLE_CRATE_GROUPS.map((g) => g.label), NMG_GRADED_LABEL, OTHER_TITLES_LABEL].filter((l) => groups.has(l));

  const groupsHtml = orderedLabels.map((label) => {
    const arr = groups.get(label);
    const isExpanded = expandedProfilePickerGroups.has(label);
    const itemsHtml = arr.map((t) => `
      <div class="title-dropdown-item" data-picker-select="${t.id}">
        ${titleHoverMarkup(t)}
      </div>
    `).join('');
    return `
      <div class="title-dropdown-group-header" data-picker-group-toggle="${escapeHtml(label)}">
        <span>${label}</span>
        <span class="title-dropdown-group-count">${arr.length}</span>
        <span class="title-dropdown-group-chevron ${isExpanded ? 'open' : ''}">▾</span>
      </div>
      <div class="title-dropdown-group-items ${isExpanded ? '' : 'hidden'}">${itemsHtml}</div>
    `;
  }).join('');

  listEl.innerHTML = (extraTopHtml || '') + groupsHtml
    || '<p class="equip-picker-empty">Nothing to pick from.</p>';

  listEl.querySelectorAll('[data-picker-group-toggle]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const label = el.dataset.pickerGroupToggle;
      if (expandedProfilePickerGroups.has(label)) expandedProfilePickerGroups.delete(label);
      else expandedProfilePickerGroups.add(label);
      renderGroupedTitlePicker(items, onPick, extraTopHtml, listEl);
    });
  });

  listEl.querySelectorAll('[data-picker-select]').forEach((el) => {
    el.addEventListener('click', () => onPick(el.dataset.pickerSelect));
  });
  listEl.querySelectorAll('[data-picker-select-top]').forEach((el) => {
    el.addEventListener('click', () => onPick(el.dataset.pickerSelectTop));
  });
}

function openProfilePicker(heading) {
  expandedProfilePickerGroups.clear();
  profileShowcasePickerTitle.textContent = heading;
  profileShowcasePicker.classList.remove('hidden');
}

btnProfileShowcasePickerClose.addEventListener('click', () => profileShowcasePicker.classList.add('hidden'));

btnProfileShowcaseAdd.addEventListener('click', () => {
  if (!profileViewCache) return;
  const owned = profileOwnedTitleDefs(profileViewCache.character);
  const showcaseIds = (profileViewCache.character.profile && profileViewCache.character.profile.showcaseTitleIds) || [];
  const available = owned.filter((d) => !showcaseIds.includes(d.id));
  openProfilePicker('Add a title to your Showcase');
  renderGroupedTitlePicker(available, async (titleId) => {
    try {
      const result = await apiAddShowcaseTitle(titleId);
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

btnProfileSlabShowcaseAdd.addEventListener('click', () => {
  if (!profileViewCache) return;
  const owned = profileOwnedTitleDefs(profileViewCache.character).filter((d) => d.nmgGrade);
  const slabIds = (profileViewCache.character.profile && profileViewCache.character.profile.slabShowcaseIds) || [];
  const available = owned.filter((d) => !slabIds.includes(d.id));
  openProfilePicker('Add a slab to your Portfolio Showcase');
  renderGroupedTitlePicker(available, async (titleId) => {
    try {
      const result = await apiAddSlabShowcase(titleId);
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

// Reuses the same picker modal (openProfilePicker/renderGroupedTitlePicker) as every other
// title-picking flow on this page -- the only thing unique to listing is the price, asked via a
// plain prompt() after the pick, same idiom the profile Status editor already uses rather than
// building a whole second modal step just for one number input.
btnProfileSlabMarketList.addEventListener('click', () => {
  if (!profileViewCache) return;
  const owned = profileOwnedTitleDefs(profileViewCache.character).filter((d) => d.nmgGrade);
  openProfilePicker('List a slab for sale');
  renderGroupedTitlePicker(owned, async (titleId) => {
    profileShowcasePicker.classList.add('hidden');
    const def = getItemDef(titleId, profileViewCache.character);
    const priceStr = prompt(`List ${def ? itemLabel(def) : titleId} for how much? ($)`);
    if (priceStr === null) return;
    const price = Number(priceStr);
    if (!(price > 0)) {
      alert('Enter a valid price.');
      return;
    }
    try {
      const result = await apiListSlabForSale(titleId, price);
      character = result.character;
      save();
      renderAll();
      await loadProfile(profileViewCache.username);
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  });
});

btnProfileShuffleBanner.addEventListener('click', () => {
  if (!profileViewCache) return;
  const owned = profileOwnedTitleDefs(profileViewCache.character);
  openProfilePicker('Change your profile banner');
  profileShowcasePicker.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const equippedTopHtml = `
    <div class="title-dropdown-item" data-picker-select-top="">
      <span class="badge rank-badge">Use Equipped Title</span>
    </div>
  `;
  renderGroupedTitlePicker(owned, async (titleId) => {
    try {
      const result = await apiSetProfileBanner(titleId || null);
      character = result.character;
      save();
      renderAll();
      profileShowcasePicker.classList.add('hidden');
      await loadProfile(profileViewCache.username);
    } catch (err) {
      if (err.reason) alert(err.reason);
    }
  }, equippedTopHtml);
});
