// ---------- Equipped name-recolor perk (Hyper Gems / Anima Hyper Rares) ----------
// A handful of mythic titles promise (see their `how` text in core.js) to recolor the player's
// actual name text everywhere it renders, not just the little title badge chip. Keyed by the base
// title id so a prestiged copy (id shaped `${baseId}_p${level}`, synthesized on demand by
// getItemDef -- never a real catalog entry) still gets the same name style as the base title.
const NAME_STYLE_CLASS_BY_TITLE_ID = {
  cfHyperSapphire: 'name-style-hyper-sapphire',
  cfHyperRuby: 'name-style-hyper-ruby',
  cfHyperEmerald: 'name-style-hyper-emerald',
  animaHyperGear5: 'name-style-hyper-rainbow',
  animaHyperMakima: 'name-style-hyper-rainbow',
};

function nameStyleClassForTitleId(titleId) {
  if (!titleId) return null;
  const { baseId } = parsePrestigeId(titleId);
  return NAME_STYLE_CLASS_BY_TITLE_ID[baseId] || null;
}

function nameStyleClassFor(char) {
  return nameStyleClassForTitleId(char.titles && char.titles.equipped);
}

// Wraps an already-plain-text full name in the equipped perk's span, if any -- returns escaped,
// innerHTML-safe markup either way so call sites can swap textContent for innerHTML directly.
function styledNameHtml(char, fullName) {
  return styledNameHtmlById(char.titles && char.titles.equipped, fullName);
}

// Same as styledNameHtml, but for the other-player call sites (MTN listings, coinflip lobbies)
// that only ever get a plain name string plus the equipped title id from the server -- they never
// have that other player's full character object client-side.
function styledNameHtmlById(titleId, fullName) {
  const cls = nameStyleClassForTitleId(titleId);
  const escaped = escapeHtml(fullName);
  return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
}
