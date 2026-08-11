# mfmmo — Developer Handoff

Snapshot of how this project is built, deployed, and where the landmines are. Written after a long
session of bug-fixing and feature work; the "Landmines" section is the highest-value part — every
entry there is something that actually caused a production bug.

---

## 1. What this is

**SpecialUNITS GUI** (mfmmo.com) — a browser-based GTA-parody idle/MMO. Two repos:

| | Repo | Stack | Deploy |
|---|---|---|---|
| Client | `mfmmoalpha` | Static HTML/CSS/JS, **no build step** | **Auto-deploys on `git push origin main`** (Vercel) |
| Server | `mfmmoserver` | Express + better-sqlite3 (synchronous), pm2 | **Manual** — see below |

Client JS is plain classic scripts sharing one global scope (no modules/bundler). Load order is
defined by the `<script>` tags at the bottom of `index.html` and **matters** — e.g. `core.js`
defines `notify()`/`formatMoney()` used by `market.js`, `milos.js`, `jail.js`.

---

## 2. Deploy

### Client — nothing to do
`git push origin main` → Vercel auto-deploys. Users may need a hard refresh (Cmd/Ctrl+Shift+R) to
pick up new JS/CSS.

### Server — manual, and easy to get wrong
```bash
ssh deploy@137.184.154.196
cd ~/mfmmoserver && git pull && pm2 restart mfmmoalpha-server --update-env
```

Three things that have bitten us:

1. **`pm2` is not on the PATH in a non-interactive SSH session** (it's under nvm). A one-liner
   `ssh ... 'pm2 restart ...'` silently does nothing. Export first:
   `export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH`
2. **`git pull` is not a deploy.** On 2026-08-11 the droplet was fully up to date with origin but
   `pm2` showed 3 days uptime — four commits of server work were sitting inert on disk, and a
   pricing change appeared "not to work". Always check `pm2 list` uptime after restarting.
3. Confirm no new errors: compare `date -r ~/.pm2/logs/mfmmoalpha-server-error.log` against the
   process start time.

SSH already works from the owner's Mac via `~/.ssh/id_ed25519`. Never ask for a key or password.

---

## 3. Landmines

### 3.1 The sync gate — do not await `apiRequest` inside `flushCharacterSync`'s catch
`js/core.js`. `apiRequest()` does `await flushCharacterSync()` before **every** request except
`/character/sync`. `flushCharacterSync` guards re-entry with `inFlightCharacterSync`.

If anything inside that promise's own `.catch` awaits something routing back through `apiRequest`,
it waits on itself → **permanent deadlock**, and because `inFlightCharacterSync` then never clears,
*every subsequent request in the app* blocks forever. The whole game freezes until a page reload.

This was the long-standing "rapid clicking freezes the game" bug. The catch is now synchronous and
only records the conflict; recovery (`recoverFromStaleSync`) is chained on the **post-`.finally`**
promise so the gate is released first. Keep it that way.

### 3.2 `characterRev` protocol
Optimistic concurrency on `/character/sync`. Two rules:
- `js/api.js` reads the rev **before** throwing on a non-2xx. Otherwise a single 409 becomes
  permanent — the client keeps re-sending the same stale `expectedRev` forever.
- The 409 body names it **`currentRev`**, not `rev`. Accept both.
- Concurrent client requests desynchronize the rev and manufacture 409s, which is why action
  handlers need in-flight guards (`hustleInFlight`, `milosActionInFlight`).

### 3.3 Character migrations: patch `migrateServerCharacter`, not `load()`
`load()` in `js/core.js` is **dead code** (never called). The real per-login migration is
`migrateServerCharacter()` in `js/clientAuth.js`. Adding a new `character.*` field only to `load()`
means real players get `undefined`.

Worse: `clientAuth.js`'s `init()` wraps `apiMe()` **and** `enterGameWithCharacter()` in one
try/catch that calls `clearAuthToken()` on any throw. So an unguarded property access anywhere in
the render chain silently **logs users out on every refresh**. This has happened.

### 3.4 `getItemDef()` branch order (`js/core.js`)
Order is load-bearing: NMG (`_nmg{n}`) → LLG prestige → generic prestige → VISIONS → title fallback.
The final fallback **force-overwrites `type` to `'title'`** for anything found via
`allTitleDefsFor()`. That's why VISIONS needs its own branch *before* it — otherwise Visions get
treated as titles and leak into the Switch Title dropdown, Cosmetics tab, etc.

### 3.5 CSS tokens vs. art colors (VISIONS scope)
VISIONS reskins by overriding CSS custom properties on `<html>`. **Chrome must use `var(--token)`;
crate/title/badge/NMG art must stay hardcoded.** A Vision must never recolor a Presidential Rare or
an NMG grade badge.

Four title-art rules are explicitly protected from tokenization (`.title-beta2026`,
`.title-gs1-common`, `.title-g-common`, `.title-looksmaxxer`), and `#2ecc71`/`#2f80ed` are left
hardcoded because they're majority art (gem titles, name styles).

`--success`/`--danger` are deliberately **not** themed per-Vision — green-means-gain is information,
not decoration.

Before this was fixed, VISIONS reskinned only ~20% of the UI (730 hardcoded hex vs 193 tokens).

### 3.6 Client/server logic is duplicated by hand
The server shares no code with the client. These must be updated in **both** places:

| Logic | Client | Server |
|---|---|---|
| Drug prices / jail years | `js/core.js` `DRUG_ITEMS` | `gameLogic.js` `DRUG_ITEMS_BY_ID` |
| Community Service cost | `js/core.js` `communityServiceCost` | `gameLogic.js` (same name) |
| Drug jail escalation | `js/milos.js` | `gameLogic.js` |
| CosmetixxMarket catalog | (n/a) | `gameLogic.js` `COSMETIXX_MARKET_TITLES` |

Server copies are authoritative; client copies are display-only mirrors.

### 3.7 The server has no title catalog — on purpose
`isCosmeticInventoryId()` (`gameLogic.js`) is a **deny-list**: "not a known equipment id" ⇒ treat as
a cosmetic/title. Prefer extending that over adding allow-lists. A manually-maintained allow-list
for NMG eligibility silently broke two whole crates (Milos Legends, LLG) before being replaced.

**Exception:** `COSMETIXX_MARKET_TITLES` genuinely needs ids + pull weights for pricing. New crates
must be mirrored there or they can never appear in the rotation — see the checklist in
`.claude/skills/title-making/SKILL.md`.

### 3.8 Misc
- `hideNameOnBadge: true` — art-only title chip (name still shows in Inventory/Trade/toasts). Use
  for any photo/wordmark title.
- `.title-badge:has(.title-text-hidden)` fixes these at 120×40. `.title-text-hidden` is
  `visibility:hidden` (not `display:none`), so without a fixed size the invisible name still
  reserves width and every chip ends up a different size.
- `.hustle-grid` is CSS grid (`auto-fill, minmax(220px, 1fr)`), not flex-wrap. 43 grids / 86 cards
  depend on it.
- `logTo()` caps log DOM at 30 entries. `.log:empty` collapses.
- Blocking `alert()` was replaced with non-blocking `notify()` on action paths — a burst of server
  rejections used to stack N main-thread-halting dialogs. `confirm()` is intentionally left alone.

---

## 4. What changed this session

**mfmmoalpha** (all live)
- `9b31e22` UI refresh + QoL — tokenization (fixes VISIONS coverage), CSS-grid cards, sidebar
  rebuild with meters + promoted cash, `formatMoney`, button tiers, empty-state collapse
- `45cbd39` **Rapid-click freeze fix** (the deadlock above)
- `433db48` Drug/Community-Service rebalance mirrors
- `643f0a7` VISIONS: qty display, removed nonsensical equip prompt, moved to Inventory tab, Profile
  vision row (own + other players')
- `ab8ee12` / `dfd8224` CosmetixxMarket client + admin regen button
- `1356e80` Update4 teaser art grids
- `e5e015d` / `312bbe3` / `33f319c` Sidebar chevron, badge clipping/glow, Players Online badge

**mfmmoserver** (deployed, `b81768c`)
- `b81768c` Drug exploit nerf — jail time now escalates with lifetime units sold; steeper
  Community Service curve; wholesale +25% / sell −10%
- `949ef43` / `e16d31e` / `6fbef2f` CosmetixxMarket + 10x archived-title premium
- `bd85258` Fixed `isCosmeticInventoryId` never being exported (500'd every NMG submit)
- `1ea6df6` NMG allow-list → deny-list
- `08cc225` CORS `credentials: true` (sendBeacon flush had never worked)

---

## 5. Open items

**Known-unfixed**
- Several server routes call `saveCharacter` (bumping `character_rev`) without returning
  `character`, so the client never learns the new rev → avoidable 409s. Cross-player routes
  (pay/rob/slime/MTN sale) bump the *victim's* rev out of band. Now survivable, not fatal.
- `.ghost-btn` tier exists but no buttons were retagged to use it.
- Nav/IA: New Milos City needs **3 levels of tabs** to reach an action.
- Accessibility: **zero** `:focus-visible` rules, **zero** `prefers-reduced-motion` guards despite
  14 pulsing keyframe animations, 2 icon-only buttons with no accessible name.
- Mobile: pages added since the drawer work (NMG, CosmetixxMarket, Visions, Profile slabs) were
  never audited at the 900px breakpoint.

**Flagged but never verified** (a diagnostic workflow hit a session limit mid-run — these are
plausible perf issues, not confirmed)
- `character.arrestRecord` grows unbounded; re-rendered and re-serialized on every save.
- `renderAll()` is a whole-app DOM rebuild running 1–2× per click regardless of visible page.
- `getItemDef()` rebuilds a ~108-entry array per title lookup; `renderAll` does ~10 inventory passes.
- MTN listings render unbounded (`SELECT *`, no LIMIT).

**Product** — the biggest missing pillar is **group play**: no crews/gangs, no territory, no shared
goals. The economy loop (crates → NMG grading → CosmetixxMarket → player market) is strong but
entirely solo, and all sinks buy flex rather than progression.

---

## 6. Debugging patterns that work here

- **Browser cache is aggressive.** Editing JS/CSS and reloading often serves the *old* file. Start
  the local server on a **fresh port** — the only reliable bust. (`curl` the file to confirm what
  the server actually has before concluding a fix didn't work.)
- **The preview pane collapses**, making `innerWidth` 0 and every `getBoundingClientRect()` garbage.
  Front the tab and `resize_window` before measuring, or you'll chase phantom layout regressions.
  Toggling state repeatedly in a hidden pane also returns **stale** `getComputedStyle` values —
  reload fresh and measure once.
- **Server routes:** copy `auth.js db.js gameLogic.js server.js package.json` to a scratch dir,
  symlink `node_modules`, run with `JWT_SECRET=test PORT=4123`. Never test against the real
  `data.sqlite`.
- **Async bugs:** port the exact promise semantics to a standalone Node script and simulate. This is
  how the deadlock was proven (and how a plausible-but-wrong livelock hypothesis was killed before
  shipping a fix for a non-bug).

---

## 7. Reference

- **Admin:** username `mrleems` gates all `/admin/*` routes and bypasses maintenance mode.
- **Reset semantics:** an update-rollout Reset wipes everything *except* cosmetic titles/badges.
- **Skill:** `.claude/skills/title-making/SKILL.md` — the checklist for adding a title/crate. There
  are 4 required `market.js` wiring points; missing one makes a crate silently invisible in some
  surface. It has happened more than once.
