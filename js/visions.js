// ---------- VISIONS: app + profile reskin engine ----------
// Visions are NOT titles (see the dedicated getItemDef branch in core.js) -- they're their own
// cosmetic category with their own equip slot (character.visions.equipped) and their own effect:
// equipping one overrides the app's CSS custom-property token system (see :root in style.css),
// applied via inline styles so it naturally wins over the stylesheet without needing any static
// per-vision CSS rules. Two independent scopes:
//   1. The equipper's own whole app view -- applied to <html>, driven by their OWN equipped Vision.
//   2. The Profile page specifically -- applied to #page-profile, driven by whichever character's
//      profile is being VIEWED (their own, or another player's), so visiting someone's profile
//      shows THEIR chosen Vision there regardless of what you have equipped yourself.
// VISION_PALETTES is populated below with real hex values per Vision (surfaces/borders/text/accent
// + a c1/c2 pair reused for the small collectible-chip gradient icon in style.css).
// Full 17-Vision palette (surfaces/borders/text/accent hex values) -- designed by a 3-proposal
// panel (bold/restrained/accessibility-focused) + synthesis pass, each Vision's accent/surface
// tones matching the color brief already written for it in VISIONS_TITLES (core.js).
const VISION_PALETTES = {
  visionGoodtrix: { surface0: '#12151c', surface1: '#161a22', surface2: '#191e28', surface3: '#1f2530', surface4: '#262d3a', borderHairline: '#232a35', borderDefault: '#333c4a', borderStrong: '#454f60', textPrimary: '#dfeaff', textSecondary: '#a9bbd6', textMuted: '#7f90ab', textDisabled: '#56617a', accent: '#3fa8ff', accentHover: '#6cc0ff', accentActive: '#2179d9', accentForeground: '#0b0f16', accentSoftBg: 'rgba(63,168,255,0.12)', accentSoftBorder: 'rgba(63,168,255,0.28)' },
  visionPandora: { surface0: '#171220', surface1: '#1b1524', surface2: '#1f1829', surface3: '#261e33', surface4: '#2d2440', borderHairline: '#2b2236', borderDefault: '#3d2f4a', borderStrong: '#513f60', textPrimary: '#f0e6f7', textSecondary: '#c7b3d6', textMuted: '#a08fb3', textDisabled: '#6f6280', accent: '#9b30d9', accentHover: '#c66be8', accentActive: '#7c25ad', accentForeground: '#fdf5ff', accentSoftBg: 'rgba(155,48,217,0.12)', accentSoftBorder: 'rgba(155,48,217,0.28)' },
  visionSlate: { surface0: '#16171a', surface1: '#1a1b1f', surface2: '#1d1f24', surface3: '#23252b', surface4: '#292b32', borderHairline: '#292b30', borderDefault: '#34363c', borderStrong: '#44464d', textPrimary: '#e9eaec', textSecondary: '#b7b9c0', textMuted: '#989aa3', textDisabled: '#6a6c74', accent: '#7e97b3', accentHover: '#9db0c7', accentActive: '#647c98', accentForeground: '#12151a', accentSoftBg: 'rgba(126,151,179,0.12)', accentSoftBorder: 'rgba(126,151,179,0.28)' },
  visionNeonNights: { surface0: '#150e17', surface1: '#19111c', surface2: '#1d1420', surface3: '#241a29', surface4: '#2c2032', borderHairline: '#2a1a30', borderDefault: '#3c2440', borderStrong: '#522f57', textPrimary: '#eae6f5', textSecondary: '#bfb0c9', textMuted: '#9689a3', textDisabled: '#675a72', accent: '#ff2d92', accentHover: '#ff5fac', accentActive: '#d4126e', accentForeground: '#14000f', accentSoftBg: 'rgba(255,45,146,0.12)', accentSoftBorder: 'rgba(255,45,146,0.28)' },
  visionCrimsonTide: { surface0: '#180f11', surface1: '#1c1214', surface2: '#201416', surface3: '#27181b', surface4: '#2f1c1f', borderHairline: '#2c1719', borderDefault: '#402024', borderStrong: '#56292e', textPrimary: '#ece3e4', textSecondary: '#c2a9ac', textMuted: '#9c8688', textDisabled: '#6d5c5d', accent: '#d21f3c', accentHover: '#e5455c', accentActive: '#a2142a', accentForeground: '#fff5f5', accentSoftBg: 'rgba(210,31,60,0.12)', accentSoftBorder: 'rgba(210,31,60,0.28)' },
  visionObsidianGold: { surface0: '#141210', surface1: '#181614', surface2: '#1b1917', surface3: '#221f1a', surface4: '#2a261f', borderHairline: '#262420', borderDefault: '#3a352c', borderStrong: '#4d4739', textPrimary: '#efe9dc', textSecondary: '#c0b9a6', textMuted: '#999283', textDisabled: '#675f52', accent: '#d4af37', accentHover: '#e6c65e', accentActive: '#b3902a', accentForeground: '#14110a', accentSoftBg: 'rgba(212,175,55,0.12)', accentSoftBorder: 'rgba(212,175,55,0.28)' },
  visionArcticFrost: { surface0: '#10151a', surface1: '#131a20', surface2: '#161e25', surface3: '#1c252e', surface4: '#222d38', borderHairline: '#212c35', borderDefault: '#2e3d49', borderStrong: '#3e5060', textPrimary: '#eaf6ff', textSecondary: '#b7d3e3', textMuted: '#8fadbe', textDisabled: '#607f8f', accent: '#5cc8f2', accentHover: '#8fdcff', accentActive: '#3ba9d6', accentForeground: '#0a1116', accentSoftBg: 'rgba(92,200,242,0.12)', accentSoftBorder: 'rgba(92,200,242,0.28)' },
  visionCopperRust: { surface0: '#171310', surface1: '#1b1613', surface2: '#1f1916', surface3: '#261f1a', surface4: '#2f261f', borderHairline: '#2a2018', borderDefault: '#40301f', borderStrong: '#56402a', textPrimary: '#f0e4d8', textSecondary: '#c4ac97', textMuted: '#9d8a78', textDisabled: '#6d5f52', accent: '#cc6a2e', accentHover: '#e08a52', accentActive: '#a34f20', accentForeground: '#170f09', accentSoftBg: 'rgba(204,106,46,0.12)', accentSoftBorder: 'rgba(204,106,46,0.28)' },
  visionToxicWaste: { surface0: '#131611', surface1: '#161a14', surface2: '#191e16', surface3: '#1f251b', surface4: '#262d20', borderHairline: '#232a1c', borderDefault: '#34402a', borderStrong: '#47563a', textPrimary: '#eaf2df', textSecondary: '#b8c7a3', textMuted: '#93a382', textDisabled: '#647159', accent: '#a6ff00', accentHover: '#c4ff4d', accentActive: '#82cc00', accentForeground: '#0c1400', accentSoftBg: 'rgba(166,255,0,0.12)', accentSoftBorder: 'rgba(166,255,0,0.28)' },
  visionDeepSea: { surface0: '#0e161a', surface1: '#111b20', surface2: '#142026', surface3: '#1a2830', surface4: '#20323b', borderHairline: '#1c2c34', borderDefault: '#294049', borderStrong: '#38545f', textPrimary: '#dff3f0', textSecondary: '#a9c9c5', textMuted: '#83a3a0', textDisabled: '#587270', accent: '#17c3b2', accentHover: '#4fd6c6', accentActive: '#0f9284', accentForeground: '#06120f', accentSoftBg: 'rgba(23,195,178,0.12)', accentSoftBorder: 'rgba(23,195,178,0.28)' },
  visionRoseGold: { surface0: '#171213', surface1: '#1b1516', surface2: '#1f1819', surface3: '#261e1f', surface4: '#2f2426', borderHairline: '#2b1f20', borderDefault: '#402e2f', borderStrong: '#563f3e', textPrimary: '#f2e3de', textSecondary: '#c7ada8', textMuted: '#a08984', textDisabled: '#705d5a', accent: '#e6917a', accentHover: '#f0aa94', accentActive: '#c76f57', accentForeground: '#1a100c', accentSoftBg: 'rgba(230,145,122,0.12)', accentSoftBorder: 'rgba(230,145,122,0.28)' },
  visionCottonCandy: { surface0: '#15131a', surface1: '#19161e', surface2: '#1d1a23', surface3: '#241f2b', surface4: '#2c2634', borderHairline: '#2a2130', borderDefault: '#3d3244', borderStrong: '#52445a', textPrimary: '#f2e9f5', textSecondary: '#c6b8ce', textMuted: '#9f93a8', textDisabled: '#6f6577', accent: '#ff8fd1', accentHover: '#ffb0de', accentActive: '#e567b0', accentForeground: '#1a0f16', accentSoftBg: 'rgba(255,143,209,0.12)', accentSoftBorder: 'rgba(255,143,209,0.28)' },
  visionForestMoss: { surface0: '#14170f', surface1: '#171b12', surface2: '#1a1f14', surface3: '#20251a', surface4: '#272d1f', borderHairline: '#232a18', borderDefault: '#333d26', borderStrong: '#445234', textPrimary: '#e6ecdc', textSecondary: '#b7c1a5', textMuted: '#929c81', textDisabled: '#656d57', accent: '#7a9a4a', accentHover: '#93b566', accentActive: '#5c7938', accentForeground: '#10140a', accentSoftBg: 'rgba(122,154,74,0.12)', accentSoftBorder: 'rgba(122,154,74,0.28)' },
  visionSandstorm: { surface0: '#171410', surface1: '#1b1713', surface2: '#1f1b16', surface3: '#26211a', surface4: '#2f291f', borderHairline: '#2b2318', borderDefault: '#423525', borderStrong: '#574632', textPrimary: '#f0e6d4', textSecondary: '#c3b39a', textMuted: '#9c8f79', textDisabled: '#6d6353', accent: '#cf9a4f', accentHover: '#e3b578', accentActive: '#ab803e', accentForeground: '#161006', accentSoftBg: 'rgba(207,154,79,0.12)', accentSoftBorder: 'rgba(207,154,79,0.28)' },
  visionSteelBlue: { surface0: '#15171a', surface1: '#191c20', surface2: '#1c2025', surface3: '#22272d', surface4: '#292f36', borderHairline: '#262b31', borderDefault: '#343b43', borderStrong: '#454d57', textPrimary: '#e6eaee', textSecondary: '#b3bac2', textMuted: '#929aa4', textDisabled: '#656d78', accent: '#3a72a0', accentHover: '#5590bd', accentActive: '#2a597f', accentForeground: '#f4f8fb', accentSoftBg: 'rgba(58,114,160,0.12)', accentSoftBorder: 'rgba(58,114,160,0.28)' },
  visionBlush: { surface0: '#171315', surface1: '#1b1619', surface2: '#1f191d', surface3: '#261f23', surface4: '#2f262b', borderHairline: '#2a2024', borderDefault: '#3f2f36', borderStrong: '#544048', textPrimary: '#f5e6ec', textSecondary: '#cab0ba', textMuted: '#a48c95', textDisabled: '#726067', accent: '#ec7fa9', accentHover: '#f3a0c0', accentActive: '#cf5c8c', accentForeground: '#190f13', accentSoftBg: 'rgba(236,127,169,0.12)', accentSoftBorder: 'rgba(236,127,169,0.28)' },
  visionCharcoal: { surface0: '#141414', surface1: '#181818', surface2: '#1c1c1e', surface3: '#222224', surface4: '#292929', borderHairline: '#262628', borderDefault: '#363638', borderStrong: '#47474a', textPrimary: '#e7e7e9', textSecondary: '#b6b6ba', textMuted: '#94949a', textDisabled: '#66666b', accent: '#9a9da4', accentHover: '#b3b6bc', accentActive: '#7a7d84', accentForeground: '#101113', accentSoftBg: 'rgba(154,157,164,0.12)', accentSoftBorder: 'rgba(154,157,164,0.28)' },
};

const VISION_CSS_VAR_MAP = {
  surface0: '--surface-0', surface1: '--surface-1', surface2: '--surface-2', surface3: '--surface-3', surface4: '--surface-4',
  borderHairline: '--border-hairline', borderDefault: '--border-default', borderStrong: '--border-strong',
  textPrimary: '--text-primary', textSecondary: '--text-secondary', textMuted: '--text-muted', textDisabled: '--text-disabled',
  accent: '--accent', accentHover: '--accent-hover', accentActive: '--accent-active', accentForeground: '--accent-foreground',
  accentSoftBg: '--accent-soft-bg', accentSoftBorder: '--accent-soft-border',
  surfaceRaised: '--surface-raised', surfaceNeutral: '--surface-neutral',
};

// --surface-raised / --surface-neutral are intermediate chrome tones (panels, modal boxes, the
// secondary-button family). They're DERIVED from each palette's existing surfaces rather than
// hand-authored 17 more times: they only ever need to sit between the surfaces a palette already
// defines, so deriving them keeps every current and future Vision automatically consistent and
// removes 34 hand-tuned values that could drift.
//
// --success / --danger are deliberately NOT themed per-Vision. Green-means-gain and red-means-loss
// is load-bearing information, not decoration -- recoloring it to fit a palette would make a
// "you lost $400" line stop reading as bad news. They stay at their :root values under every Vision.
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function derivedVisionTokens(palette) {
  return {
    surfaceRaised: mixHex(palette.surface2, palette.surface4, 0.5),
    surfaceNeutral: mixHex(palette.surface4, palette.textDisabled, 0.25),
  };
}

// Applies (or clears, if visionId is falsy/unknown) one Vision's full token override onto `el`.
// Inline styles win over any stylesheet rule for that same element by CSS's own cascade rules, and
// CSS custom properties inherit down the DOM tree, so a descendant's own inline override always
// wins over whatever an ancestor (e.g. <html>) declared -- no specificity fight needed between the
// app-wide and profile-scoped applications of this function.
function applyVisionCssVars(el, visionId) {
  if (!el) return;
  const palette = visionId && VISION_PALETTES[visionId];
  if (!palette) {
    Object.values(VISION_CSS_VAR_MAP).forEach((cssVar) => el.style.removeProperty(cssVar));
    return;
  }
  // Derived tokens are merged in on top of the hand-authored palette, so a palette can still
  // override one explicitly just by declaring it (none currently do).
  const resolved = { ...derivedVisionTokens(palette), ...palette };
  Object.entries(VISION_CSS_VAR_MAP).forEach(([key, cssVar]) => {
    if (resolved[key]) el.style.setProperty(cssVar, resolved[key]);
  });
}

function applyOwnVisionTheme() {
  if (typeof character === 'undefined' || !character) return;
  applyVisionCssVars(document.documentElement, character.visions && character.visions.equipped);
}

// Called from js/profile.js's renderProfile() with the character whose profile is on screen --
// their own if isOwner, otherwise the other player's. Never touches <html>, only #page-profile, so
// it can never leak into the viewer's own app-wide theme.
function applyProfileVisionTheme(viewedChar) {
  const profilePage = document.getElementById('page-profile');
  applyVisionCssVars(profilePage, viewedChar && viewedChar.visions && viewedChar.visions.equipped);
}

function equipVision(visionId) {
  if (!character.visions) character.visions = { equipped: null };
  character.visions.equipped = character.visions.equipped === visionId ? null : visionId;
  save();
  renderAll();
}

const visionsGrid = document.getElementById('visionsGrid');

function renderVisionsGrid() {
  if (!visionsGrid) return;
  if (!character.visions) character.visions = { equipped: null };
  const ownedStacks = character.inventory.filter((stack) => stack.qty > 0 && VISIONS_TITLES.some((v) => v.id === stack.id));
  if (!ownedStacks.length) {
    visionsGrid.innerHTML = '<p class="equip-picker-empty">No Visions yet. Spin above.</p>';
    return;
  }

  visionsGrid.innerHTML = ownedStacks.map((stack) => {
    const def = VISIONS_TITLES.find((v) => v.id === stack.id);
    const equipped = character.visions.equipped === stack.id;
    return `
      <div class="hustle-card">
        <div class="title-preview"><span class="title-badge ${def.cssClass}"><span class="title-text">${escapeHtml(def.name)}</span></span></div>
        <h3>${escapeHtml(def.name)}</h3>
        <p>${escapeHtml(def.how)}</p>
        <p>&times; ${stack.qty}</p>
        <button data-equip-vision="${stack.id}" class="${equipped ? 'active-hustle' : ''}">${equipped ? 'Equipped' : 'Equip'}</button>
      </div>
    `;
  }).join('');

  visionsGrid.querySelectorAll('[data-equip-vision]').forEach((btn) => {
    btn.addEventListener('click', () => equipVision(btn.dataset.equipVision));
  });
}
