---
name: title-making
description: Use when adding a new title crate (a new mystery-pull cosmetic crate with its own titles/rarities), adding a single new title, or touching the "hidden name / art-only badge" convention (Anima, RED/BLUE, LLG, Milos Legends style). Triggers on requests like "add a new crate", "add a title", "make a badge/title art-only", or bugs about title badges (wrong width, wrong group, not equippable, missing from Showcase/dropdown/chat).
---

# Title Making (mfmmoalpha)

This codebase has one consistent pattern for "mystery-pull crate full of titles" (Anima, Counterfinish,
RED, BLUE, Leems Larudo x GOOD, Milos Legends 1, etc.). Follow it exactly — every step below was a real
place a past crate build got wired incompletely and caused a bug (missing from a picker, wrong width,
not tradeable, sync loss). This skill is the checklist.

## 1. Title data — `js/core.js`

Add a `const MY_CRATE_TITLES = [...]` array near the other crate arrays. Each entry:

```js
{ id: 'mcUniqueId', name: 'Display Name', cssClass: 'title-mc-slug', weight: 15, rarity: 'common',
  how: 'Won from My Crate spin (common).' }
```

- `id` must be globally unique across every title array in the file (grep first).
- `weight` values across one crate's array should sum to 100 (they're literal per-crate pull percentages,
  read directly by the odds display — no normalization happens anywhere).
- `rarity` is a free string (`common`/`uncommon`/`rare`/`mythic` are the existing tiers) — it drives the
  Sell/Prestige eligibility gate (`item.rarity` truthy) and the crate-odds display's mythic-announce logic.
- **Art-only convention**: if the art itself IS the title (a photo/wordmark, not a font-rendered name —
  this is the Anima/RED/BLUE/LLG/Milos-Legends look), add `hideNameOnBadge: true`. The real name still
  lives in the data and shows everywhere except the small badge chip (Inventory, Trade, "you won X" toast,
  hover popover, Showcase all show it — only the chip itself blanks it via CSS `visibility:hidden`, not
  `display:none`, so it keeps its layout box). **Do not skip this even for "just one weird title"** — a
  title with real art but no name text needs it, or the fallback font-rendered name renders on top of the
  art.

If prestiging should swap in different designed art per level instead of appending a roman numeral
(matches LLG), add entries to `LLG_MAX_PRESTIGE`-style map and register a dedicated branch in
`getItemDef()` before the generic prestige branch — copy the LLG prestige branch as a template. Most new
crates do NOT need this; the default roman-numeral prestige (already generic) is fine.

## 2. CSS art — `style.css`

One class per title id, keyed by `cssClass`:

```css
.title-mc-slug { background-image: url('...'); background-size: cover; background-position: center; }
```

**Do not size these individually.** A shared rule already fixes size for every hidden-name badge:

```css
.title-badge:has(.title-text-hidden) { width: 120px; height: 40px; }
```

This exists because `.title-text-hidden` is `visibility:hidden` (preserves layout space) — without a
fixed size, `.title-badge`'s `inline-block` sizing reserves width based on the (invisible) name's text
length, so different titles in the same list (e.g. the Switch Title dropdown) end up visibly different
widths. If you ever see "these badges are different sizes for no visible reason," this is almost always
the cause — check that the badge in question actually has `hideNameOnBadge: true` and is inside a
`.title-badge` (not some other element that doesn't inherit the rule).

## 3. Market catalog wiring — `js/market.js`

Four places, all required or the title becomes invisible/untradeable/unequippable in some surface:

1. **`allTitleDefsFor(char)`** — spread `...MY_CRATE_TITLES` into the big array. This is what
   `getItemDef()` resolves against; skip this and the title id resolves to `null` everywhere.
2. **`CRATE_TITLE_IDS`** — spread the ids in. This marks them as inventory-stack-tracked (tradeable,
   "owned" only while qty > 0) rather than permanent-titles.owned. Skip this and a won copy can't be
   traded/sold and `isTitleOwned` mis-reports it.
3. **`TITLE_CRATE_GROUPS`** — add `{ label: '🏷️ MY CRATE', ids: new Set(MY_CRATE_TITLES.map(t => t.id)) }`.
   This is what groups the Switch Title dropdown and Profile picker into per-crate sections. Skip this
   and every title from the crate falls into the catch-all "Other Titles" bucket.
4. **`const CRATE_MY_CRATE = { name: 'MY CRATE', icon: '...', cost: MY_CRATE_COST, titles: MY_CRATE_TITLES };`**
   — the spin-button/odds-view object. Add `limited: true, key: 'mycrate'` only if it needs
   server-authoritative shared stock like RED/BLUE (rare — most crates are plain client-side spins).

Then wire the DOM refs + listeners at the bottom of the file (copy the LLG or Milos Legends block
verbatim, renaming):

```js
const btnMcSpin = document.getElementById('btnMcSpin');
const mcSpinMessage = document.getElementById('mcSpinMessage');
const btnViewMcCrate = document.getElementById('btnViewMcCrate');
const mcSpinQtyInput = document.getElementById('mcSpinQty');
...
btnViewMcCrate.addEventListener('click', () => showCrateOdds(CRATE_MY_CRATE));
registerCrateQtyInput(CRATE_MY_CRATE, mcSpinQtyInput, btnMcSpin);
btnMcSpin.addEventListener('click', () => spinCrate(CRATE_MY_CRATE, [btnMcSpin, btnViewMcCrate], mcSpinMessage));
```

`spinCrate()` itself needs no changes — it already handles single spin, animated multi-open (grants +
saves incrementally per reel, not batched — see the crate-loss fix history if touching this), and Quick
Open, uniformly for every crate. Do not duplicate its logic per-crate.

## 4. HTML markup — `index.html`

Inside the relevant `.shop` container (Milos Market's crate-bearing tabs; check `#shop-titles` /
`#shop-good` for the two current homes — **new crates default to `#shop-good`** unless there's a specific
reason for a standalone banner, per this repo's placement convention):

```html
<div class="feature-banner">
  <div class="feature-banner-text"><h3>&#1234; MY CRATE</h3></div>
  <div class="feature-banner-actions">
    <button id="btnViewMcCrate" class="secondary-btn">View Crate</button>
    <input type="number" id="mcSpinQty" class="crate-qty-input" min="1" max="10" value="1" title="How many to spin">
    <button id="btnMcSpin">Spin ($COST)</button>
  </div>
</div>
<p id="mcSpinMessage"></p>
```

The shared `#crateSpinModal`/`#crateResultModal` overlays (already in `index.html`) handle the actual
spin animation and results reveal for every crate — no per-crate modal markup needed.

## 4b. Synthesized id suffixes — check before inventing a new one

Three id shapes are synthesized on the fly from a base title id rather than existing in any catalog.
`getItemDef()` (js/core.js) has one branch per shape, and each one is hand-mirrored server-side:

| Shape | Client regex (core.js) | Server mirror (gameLogic.js) | Made by |
|---|---|---|---|
| `${baseId}_p${level}` | `PRESTIGE_ID_RE` | `NMG_PRESTIGE_ID_RE` | Prestige (js/inventory.js) |
| `${baseId}_nmg${grade}` | `NMG_ID_RE` | `NMG_GRADED_ID_RE` | NMG reveal (server) |
| `${baseId}_foil` | `FOIL_ID_RE` | `FOIL_ID_RE` | Foil Ascension (server) |

**Foil is the one shape that needs no per-title work** — `title-foil` is a generic CSS overlay class
appended to whatever `cssClass` the base title already has, so every current and future title gets a
working Foil for free. Nothing to add per crate.

If you ever add a **fourth** suffix, check it against all six regexes above (both sides), and note
that the prestige/NMG regexes both require digits after their marker while `_foil` is a bare word —
that's exactly what keeps them disjoint. A new suffix ending in digits is the dangerous case.

Foils are deliberately **excluded** from Prestige (js/inventory.js `prestigeTitle`/`canPrestige`),
from NMG submission (js/nmg.js `nmgSubmitCandidates` + the server's `/nmg/submit`), and from
`COSMETIXX_MARKET_TITLES` — that array is a hand-maintained list of plain base ids that the server
mints slabs from, so a foil id can only ever appear there if someone types one in. Don't.

## 5. Sanity checklist before calling it done

- [ ] Every id in the new array is unique repo-wide (`grep -n "'yourIdPrefix" js/core.js`)
- [ ] Weights in the array sum to ~100
- [ ] `hideNameOnBadge: true` set on every title whose art is a photo/wordmark (not font-rendered text)
- [ ] CSS class exists for every `cssClass` referenced, no typos
- [ ] All 4 market.js wiring points done (`allTitleDefsFor`, `CRATE_TITLE_IDS`, `TITLE_CRATE_GROUPS`, crate
      object) — grep the crate's own title array name across `js/market.js`; it should appear in all 4
      plus the button-wiring block
- [ ] Local smoke test: open the crate, spin qty=1 and qty=5, confirm the item lands in Inventory >
      Cosmetics, the Switch Title dropdown, and the Profile banner/showcase picker, and that hidden-name
      badges render at a consistent size next to other titles in the same list
- [ ] If `COSMETIXX_MARKET_TITLES` exists (`mfmmoserver/gameLogic.js`) and this crate isn't archived
      (Open Beta / GOOD Season 1 are the only current exclusions), mirror the new titles' `{id, weight,
      rarity}` into it, tagged with the crate's cost — CosmetixxMarket's server-side pricing has no
      title catalog of its own, so a crate skipped here is a crate that can never appear in the
      rotation. This is the exact "forgot to update the mirror" mistake that slipped through for both
      Milos Legends and Leems Larudo x GOOD on the old NMG eligibility list.
