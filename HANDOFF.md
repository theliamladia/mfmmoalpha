# mfmmo — Project Handoff

Everything needed to pick this project up: what it is, where it lives, how to deploy it, and how
it's built.

---

## 1. What it is

**SpecialUNITS GUI** — a browser-based, GTA-parody idle/MMO played at **mfmmo.com**. Comedic
crime-sim tone: you're a nobody in "New Milos City" grinding money through legal and illegal work,
climbing stat and job ladders, gambling, trading with other players, and — the real endgame —
collecting cosmetic **Titles** that display next to your name everywhere.

**Core loop:** earn Floydbucks → spend on stats/gear/gambling → buy cosmetic crates → pull rare
Titles → grade / trade / flex them on your Profile and in chat.

It's a **live game with real players**. Changes ship to production immediately (see Deploy). The
economy is real to its players — cosmetics have taken serious grinding to obtain, so balance and
data-integrity changes deserve care.

Multiplayer is real but lightweight: shared chat, a presence roster, a player marketplace, PvP
(rob / slime / "enjoy" / duels), coinflip wagers, marriage, and a shared jail registry. There are
no guilds/teams — everything is solo-vs-world.

---

## 2. Where it lives

| Thing | Location |
|---|---|
| Client repo | `github.com/theliamladia/mfmmoalpha` |
| Server repo | `github.com/theliamladia/mfmmoserver` |
| Player-facing site | `https://mfmmo.com` (Vercel) |
| API | `https://api.mfmmo.com` (DigitalOcean droplet) |
| Droplet | `137.184.154.196`, SSH user `deploy` |
| Server code on box | `~/mfmmoserver` |
| Database | `~/mfmmoserver/data.sqlite` (SQLite, ~9.4 MB) |

**Client** is static HTML/CSS/JS with **no build step and no framework** — plain classic `<script>`
tags sharing one global scope. What you edit is what ships. Load order is set by the script tags at
the bottom of `index.html` and matters.

**Server** is Express + better-sqlite3 (synchronous), run under pm2 as `mfmmoalpha-server`, fronted
by nginx (`/etc/nginx/sites-enabled/api.mfmmo.com`). Node v24.

---

## 3. Deploy

### Client — automatic
```bash
git push origin main     # Vercel auto-deploys mfmmo.com
```
That's it. Players may need a hard refresh (Cmd/Ctrl+Shift+R) to pick up new JS/CSS.

### Server — manual, and easy to get wrong
```bash
ssh deploy@137.184.154.196
cd ~/mfmmoserver
git pull
pm2 restart mfmmoalpha-server --update-env
```

Or as a one-liner — note the PATH export, it is **required**:
```bash
ssh deploy@137.184.154.196 'export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH
cd ~/mfmmoserver && git pull && pm2 restart mfmmoalpha-server --update-env && pm2 list'
```

Three traps, all of which have caused real confusion:

1. **`pm2` is not on the PATH in a non-interactive SSH session** (it's installed under nvm). Without
   the export, `ssh ... 'pm2 restart ...'` silently does nothing and reports success.
2. **`git pull` is not a deploy.** The droplet was once fully up to date with origin while pm2
   showed 3 days uptime — four commits of server work sat inert and a pricing change looked broken.
   Always confirm `pm2 list` uptime resets.
3. **Verify no new errors** after restarting:
   `date -r ~/.pm2/logs/mfmmoalpha-server-error.log` vs the process start time.

### SSH access
Key-based auth already works from the owner's Mac (`~/.ssh/id_ed25519`). Nothing to configure. Never
put a private key or password into a config file or paste it anywhere.

Useful:
```bash
pm2 logs mfmmoalpha-server --lines 50    # tail
pm2 list                                  # status/uptime
sqlite3 data.sqlite "select count(*) from users;"
```

### Environment (`~/mfmmoserver/.env`)
| Var | Purpose |
|---|---|
| `JWT_SECRET` | **Required** — server refuses to start without it |
| `ADMIN_USERNAME` | Defaults to `mrleems` |
| `ALLOWED_ORIGINS` | Defaults to `https://mfmmo.com,https://www.mfmmo.com` |
| `PORT` | Defaults to `3000` |

CORS uses `credentials: true` — required for the `sendBeacon` save-on-tab-close path.

### Backups
Nightly automated snapshot at 04:17 UTC via the deploy user's crontab: `scripts/nightly-backup.js`
(SQLite backup API, integrity-checked, newest 7 kept in `~/backups`, log at `~/backups/backup.log`).
On-box only — protects against corruption and bad migrations, not disk loss; off-box replication is
the remaining gap. Ad-hoc `data.sqlite.bak-*` snapshots also accumulate in `~/mfmmoserver` before
schema deploys.

---

## 4. The game

### Navigation (sidebar)
| Page | What it is |
|---|---|
| **Profile** | Public player page: banner, equipped Vision, Title Showcase, graded-slab Portfolio Showcase, Player Market, wall posts, privacy toggles |
| **Da Skreetz** | The basic loop — Work / Slut / Crime on a 10s cooldown |
| **Milos Market** | Shops: gym, food, looksmaxxing, Cosmetixxx (titles + CosmetixxMarket), New Milos Grading, GOOD® |
| **Midas Casino** | Cashier, Blackjack, Slots, Roulette |
| **New Milos City** | The big one — 14 sub-tabs, see below |
| **Leaderboard** | Looks / net worth / level / height, with title rewards |
| **Curios George** | Weekly auction of one-of-a-kind flex items |
| **Wiki / Updates / Report** | Docs, changelog, bug/suggestion submission |

### New Milos City sub-tabs
Hustles (job ladders), Combat (turn-based PvE), Crime (fixed-payout crimes), City Hall (rename,
marriage, gun licence), NMC Gun Club, Bank (tiers + credit card billed every 24h), Morals Center
(alignment stance), Milos Trading Network (player marketplace), New Milos Penitentiary (public jail
registry, bail, commissary), Coinflip, Milos Outlook Farms, MyCrypto Setup (Floydcoin mining),
Altcoins (rug-pull minigame), Investors Center (stock market).

### Currencies
- **Floydbucks (cash)** — primary
- **Chips** — casino only
- **FC / Floydcoin** — mined passively, tradeable for cash, partially robbable
- **Altcoins** — player-minted rug-pull tokens
- **Stocks** — Investors Center holdings

### Cosmetics (the endgame)
Four separate equip slots / systems:

1. **Titles** — displayed beside your name everywhere. Pulled from crates; tradeable inventory
   stacks; can be **prestiged** (roman numerals, or swapped art for LLG).
2. **Badges** — small chip shown *before* the title. Balaclava Badge Crate ($960) → rank chain
   Bronze→…→Grandmaster → trade for a Gem → collect 3 Gems → UNITS Balaclava.
3. **Visions** ($20,000 crate) — reskins **your entire game UI** and your Profile as others see it.
   17 palettes.
4. **NMG (New Milos Grading)** — submit a Title, wait out a turnaround tier, get back a permanently
   graded slab (1–10) that can't be equipped but can be showcased/sold. "Crack" reverses it.

**Crates & costs:** Counterfinish $3,000 · Anima $4,500 · Open Beta $5,000 · GOOD® Season 1 $10,000 ·
RED/BLUE $20,000 (limited to 1,000 openings each, now exhausted/archived) · Leems Larudo × GOOD®
$20,000 · Milos Legends 1 $20,000 · VISIONS $20,000 · Balaclava Badge $960.

Archived crates (Open Beta, GOOD® Season 1, Anima, Counterfinish, RED, BLUE) are no longer
purchasable — view-only odds. Their titles can still appear in **CosmetixxMarket**, a 24h-rotating
store of 5 system-generated graded slabs, where archived-crate titles carry a **10× price premium**
so buy-then-crack can't cheaply resurrect an archived cosmetic.

---

## 5. Codebase map

### Client (`mfmmoalpha`) — ~11.9k lines of JS
| File | Responsibility |
|---|---|
| `index.html` | All markup for every page (single-page app, pages toggled by class) |
| `style.css` | ~5.3k lines. CSS-custom-property token system in `:root` |
| `js/core.js` | Character model, `save()`/sync, `renderAll()`, page routing, item defs, title catalogs |
| `js/api.js` | Every API call; `apiRequest()` wrapper |
| `js/clientAuth.js` | Login/register, **`migrateServerCharacter()`** (the real migration path) |
| `js/milos.js` | New Milos City — the largest file |
| `js/market.js` | Shops, crates, spin animation, hustle buttons, the 250ms tick loop |
| `js/profile.js`, `nmg.js`, `inventory.js`, `visions.js`, `badges.js` | Cosmetics + profile |
| `js/bank.js`, `crypto.js`, `farms.js`, `stockMarket.js`, `altcoins.js`, `investorL2.js` | Economy systems |
| `js/casino*.js`, `coinflip.js`, `duels.js`, `slime.js`, `playerActions.js` | Gambling + PvP |
| `js/jail.js`, `penitentiary.js`, `mtn.js`, `variety.js`, `notifications.js`, `report.js` | Misc systems |
| `js/admin*.js` | Admin panel |
| `assets/` | 16 MB title art, 2 MB badge art |
| `.claude/skills/title-making/SKILL.md` | Checklist for adding a title/crate — **read before adding one** |

### Server (`mfmmoserver`)
| File | Responsibility |
|---|---|
| `server.js` | All 169 Express routes, `runAction()` helper, admin routes |
| `gameLogic.js` | All game rules + `newCharacter()`; the authority for anything money-affecting |
| `db.js` | Schema + all queries (24 tables) |
| `auth.js` | bcrypt + JWT, `requireAuth` middleware |

**Architecture:** the character is stored as one JSON blob (`users.character_json`) plus
`character_rev` for optimistic concurrency. Most actions go through `runAction()`, which
read-modify-writes that blob synchronously. Shared/multiplayer state (listings, chat, jail, duels,
market slots) lives in real tables.

Server-authoritative: hustles, jobs, gym, bank, casino, crypto, farms, stocks, PvP, NMG, crate
stock, CosmetixxMarket. Client-side-then-synced: cosmetics/equips and other display-only state.

---

## 6. Admin

Log in as `mrleems` → **Admin** button in the top bar. Gates on the JWT username, so it can't be
spoofed client-side. Capabilities: pause the game, set server modifiers (Peace & Prosperity /
Riotlandia), maintenance mode, grant cash/items, inspect any inventory, view transaction logs, bank
balances, resolve reports, reset stats, season wipe, NMG fast-forward, CosmetixxMarket force-regen.

---

## 7. Gotchas worth knowing on day one

Fuller detail lives in the git history of the fixes, but these are the ones that bite:

- **Adding a `character.*` field?** Patch `migrateServerCharacter()` in `js/clientAuth.js`.
  `load()` in `core.js` is dead code. Getting this wrong logs every existing player out on refresh.
- **Never `await` anything that routes through `apiRequest()` inside `flushCharacterSync()`'s
  catch** — it deadlocks the entire client permanently (this was the "rapid clicking freezes the
  game" bug).
- **Client and server duplicate game constants by hand** (drug prices, community-service cost, NMG
  weights). Server is authoritative; update both.
- **CSS:** chrome uses `var(--token)` so Visions can reskin it; crate/title/badge art stays
  hardcoded so Visions *can't*. Don't blur that line.
- **New crate?** Follow `.claude/skills/title-making/SKILL.md`. There are 4 required `market.js`
  wiring points and missing one makes the crate silently invisible in some surface. Also mirror it
  into `COSMETIXX_MARKET_TITLES` server-side or it can never appear in the rotation.
- **Local dev:** `python3 -m http.server` in the client repo. Browser caching is aggressive — use a
  **fresh port** to force new JS/CSS. Test server changes against a *scratch copy* of the DB, never
  `data.sqlite` directly.

---

## 8. Open items

**Infrastructure**
- Backups: nightly on-box snapshots exist (see Deploy > Backups); off-box replication still missing.
- No rate limiting on any route.

**Known bugs / debt**
- Several routes bump `character_rev` without returning `character`, so the client never learns the
  new rev → avoidable 409 conflicts. Cross-player routes (pay/rob/slime/MTN) bump the *victim's*
  rev out of band.
- Unverified perf suspects: `character.arrestRecord` grows unbounded; `renderAll()` rebuilds the
  whole app 1–2× per click; `getItemDef()` rebuilds a ~108-entry array per lookup; MTN listings
  query has no LIMIT.

**UX not yet done**
- New Milos City needs **3 levels of tabs** to reach an action.
- Accessibility: zero `:focus-visible` rules, zero `prefers-reduced-motion` guards (14 pulsing
  animations), some icon-only buttons lack accessible names.
- Mobile: pages added since the drawer work (NMG, CosmetixxMarket, Visions, Profile slabs) were
  never audited at the 900px breakpoint.
- `.ghost-btn` tier exists in CSS but no buttons use it yet.

**Product**
The biggest missing pillar is **group play** — no crews/gangs, no territory, no shared goals. The
collection/economy loop is strong but entirely solo, and every sink buys flex rather than
progression, so there's little reason to keep playing once you own the cosmetics you wanted.
