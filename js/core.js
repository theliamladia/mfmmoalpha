// ---------- logic/render convention ----------
// do<X>(...)     — pure game logic. Reads/mutates `character` only, no DOM access.
//                  Returns a result object describing what happened, e.g.
//                  { ok: true, message: '...', cls: 'gain' } or { ok: false, reason: '...' }.
//                  This is the layer a future multiplayer server would own.
// render<X>()/build<X>() — DOM only. Reads `character` (read-only) and updates the page.
//                          Never mutates `character` or calls save().
// Event listeners are thin glue: read inputs -> call do<X>() -> if ok, logTo()+save()+renderAll();
// if not ok, show the reason (alert/log) and stop.

const STORAGE_KEY = 'specialUnitsGui.character.v2';
const COOLDOWN_MS = 10000;
const STAT_CAP = 100;

const CALORIES_PER_LB = 3500;
const DEFENSE_PER_LB = 0.5;
const SPEED_LOSS_PER_LB = 1;

const GYM_BURN_LBS = 0.5;
const GYM_COST = 20;
const GYM_SPEED_GAIN = 0.6; // > SPEED_LOSS_PER_LB * GYM_BURN_LBS (0.5), so a full cycle nets +speed

// Looks is a derived stat: 90% Body (built up by Workouts + eating, see gameLogic.js on the
// server) + 10% Face (Maxx items).
const MAXX_COMPLETE_MULTIPLIER = 1.25;
const MUSCLE_GAIN_RATIO = 0.3;
const STRETCH_HEIGHT_COOLDOWN_MS = 30000;
const STRETCH_HEIGHT_MUSCLE_COST = 60;
const STRETCH_HEIGHT_GAIN_IN = 1;
// Steroid cycles: bigger multiplier on cost/gains trades off against worse roid-jail odds and length.
const STEROID_TIERS = [
  { id: 'mild', name: '💊 Mild Cycle', mult: 1.75, jailChance: 0.2, jailClicks: 3 },
  { id: 'standard', name: '💉 Standard Cycle', mult: 3, jailChance: 0.4, jailClicks: 5 },
  { id: 'heavy', name: '☠️ Heavy Cycle', mult: 5, jailChance: 0.6, jailClicks: 9 },
];
const STEROID_TIERS_BY_ID = {};
STEROID_TIERS.forEach((t) => { STEROID_TIERS_BY_ID[t.id] = t; });
const ROID_ESCAPE_COST = GYM_COST * 4;

const ALLIANCE_BUFF = 2; // legal work nudges toward Holy Good
const ALLIANCE_DEBUFF = 6; // getting caught (or committing crime) nudges toward Dirty Bad
const ALLIANCE_DEBUFF_MINOR = 3; // smaller nudge toward Dirty Bad for lower-stakes bad acts (e.g. Slut)
const ALLIANCE_TIERS = [
  { max: 19, label: '😇 Holy Good' },
  { max: 39, label: '🙂 Good' },
  { max: 59, label: '😐 Neutral' },
  { max: 79, label: '😈 Bad' },
  { max: 100, label: '💀 Dirty Bad' },
];

const GUZMAN_MIN_ALLIANCE = 60; // Bad Hustles (jobs, dealing, robbery) require Bad or worse

// ---------- Morals Center of NMC ----------
// Pick a stance and it ticks your Alliance every MORALS_TICK_MS, even while you're on another page.
const MORALS_TICK_MS = 10000;
const MORALS_GOOD_STEP = 2;
const MORALS_BAD_STEP = 2;
const MORALS_NEUTRAL_STEP = 3;
// Taking a stance now costs cash (Update 4) -- stepping back to no stance stays free, so there's
// always a no-cost way out rather than being stuck paying to undo a change.
const MORALS_CHANGE_COST = 5000;
// Mirrors gameLogic.js's VARIETY_RENOUNCE_COST server-side -- server is authoritative (Variety is
// server-side state, unlike Morals Center's own client-trust choice), this is just for display.
const VARIETY_RENOUNCE_COST_CLIENT = 5000;
const MORALS_CHOICES = {
  acceptRicardo: { name: '😇 Accept Ricardo', desc: 'Every 10s, nudge your Alliance toward Good.' },
  renounceRicardo: { name: '😈 Renounce Ricardo', desc: 'Every 10s, nudge your Alliance toward Bad.' },
  invokeNeutrality: { name: '😐 Invoke Neutrality', desc: 'Every 10s, pull your Alliance back toward Neutral (50).' },
};

const GOOD_HUSTLE_MAX_ALLIANCE = 59; // Good Hustles allowed for Neutral or better, blocked for Bad
const COMBAT_GOOD_MAX_ALLIANCE = 39; // Combat: Good alignment (not Neutral) fights Gangsters/Thugs

// Skill training is intentionally slow — 4 skills per job, each 0-100, ground out in tiny increments.
const JOB_SKILL_TRAIN_MIN = 0.02;
const JOB_SKILL_TRAIN_MAX = 0.06;
const LOOKS_TRAIN_BONUS_MAX = 1.2; // high Looks trains job skills up to 2.2x faster (charisma/presence helps you get noticed and promoted)
// Re-based so the starting Looks stat (10) grants exactly 0% bonus instead of a head start built
// into everyone's starting stats -- must match mfmmoserver/gameLogic.js's LOOKS_TRAIN_BASE/_K exactly.
const LOOKS_TRAIN_BASE = 10;
const LOOKS_TRAIN_K = LOOKS_TRAIN_BONUS_MAX / (1 - Math.sqrt(LOOKS_TRAIN_BASE / 100));
const GOOD_CEO_MULTIPLIER = 1.6;
const GOOD_CEO_MIN_AVG = 95;

// Job "promotions": average of the 4 job skills decides your rank. Each promotion is a real raise
// (its own pay band, floor rising faster than ceiling so income gets steadier, not just bigger) AND
// a shorter cooldown between clicks, like a real job giving you more responsibility (and more
// throughput) the longer you stick with it. This is what makes grinding a New Milos City job
// eventually beat just clicking Work in Da Skreetz. Ranks past Trainee/Rookie also unlock a
// job-specific perk (see JOB_PERKS below) once you reach them.
const JOB_PERK_MIN_AVG = 55; // Supervisor/Lieutenant and up
// Pay ranges are 16x their prior values now (was already 32% above original -- 10% from the first
// Drugs & Rugs balance pass, 20% from Update 4's second Good Hustle buff -- then multiplied 16x
// again so a starting Trainee averages ~$5-8/click instead of ~$0.40). Must match JOB_RANKS
// in mfmmoserver/gameLogic.js exactly -- this copy only drives the client's pay-range preview, the
// server computes the actual payout.
const JOB_RANKS = [
  { minAvg: 0, title: 'Trainee', payMin: 2.112, payMax: 10.56, cooldownMs: 2000 },
  { minAvg: 15, title: 'Associate', payMin: 4.224, payMax: 15.936, cooldownMs: 1800 },
  { minAvg: 35, title: 'Senior Associate', payMin: 8.448, payMax: 23.232, cooldownMs: 1600 },
  { minAvg: 55, title: 'Supervisor', payMin: 14.784, payMax: 38.016, cooldownMs: 1400 },
  { minAvg: 75, title: 'Manager', payMin: 24.384, payMax: 58.176, cooldownMs: 1200 },
  { minAvg: 95, title: 'Regional Manager', payMin: 38.016, payMax: 84.48, cooldownMs: 1000 },
];
const BAD_JOB_RANKS = [
  { minAvg: 0, title: 'Rookie', payMin: 5, payMax: 25, cooldownMs: 2000 },
  { minAvg: 15, title: 'Associate', payMin: 10, payMax: 37.5, cooldownMs: 1800 },
  { minAvg: 35, title: 'Enforcer', payMin: 20, payMax: 55, cooldownMs: 1600 },
  { minAvg: 55, title: 'Lieutenant', payMin: 35, payMax: 90, cooldownMs: 1400 },
  { minAvg: 75, title: 'Underboss', payMin: 57.5, payMax: 137.5, cooldownMs: 1200 },
  { minAvg: 95, title: 'Boss', payMin: 90, payMax: 200, cooldownMs: 1000 },
];

// Job-specific perks, unlocked once that job's skill average hits JOB_PERK_MIN_AVG while employed there.
const JOB_PERKS = {
  milos11: { name: '🏷️ Employee Discount', desc: "20% off Pete's Pies while you're clocked in at Milos11." },
  pizza: { name: '🏃 Delivery Legs', desc: 'A permanent +2 Speed the moment you hit the threshold, from all those sprints up stairs.' },
  wrestler: { name: '🤼 Wrestling Gear Access', desc: 'Unlocks the Wrestling Gear Store below -- exclusive combat gear only wrestlers can buy.' },
  getaway: { name: '🏎️ Evasion Instincts', desc: '-3% bust chance on this job while employed as a Getaway Driver.' },
  fence: { name: '🕴️ Inside Contacts', desc: '15% off everything at the NMC Gun Club while employed as The Fence.' },
};

// Wrestling-job-exclusive gear: equips into the Character > Equipment board's otherwise-empty
// helmet/chest/pants/feet slots, adding flat combat stat bonuses on top of the usual gun/melee bonus.
const WRESTLING_GEAR_ITEMS = [
  { id: 'wrestHeadgear', name: '🪖 Wrestling Headgear', type: 'gear', slot: 'helmet', cost: 2000, statBonuses: { defense: 3, health: 5 }, desc: '+3 Defense, +5 HP in a fight.' },
  { id: 'wrestBelt', name: '🏆 Championship Belt', type: 'gear', slot: 'chest', cost: 3000, statBonuses: { defense: 6 }, desc: '+6 Defense in a fight.' },
  { id: 'wrestSinglet', name: '🥋 Singlet Padding', type: 'gear', slot: 'pants', cost: 2500, statBonuses: { attack: 4 }, desc: '+4 Attack in a fight.' },
  { id: 'wrestBoots', name: '🥾 Grappling Boots', type: 'gear', slot: 'feet', cost: 2200, statBonuses: { speed: 5 }, desc: '+5 Speed (dodge chance) in a fight.' },
];
const WRESTLING_GEAR_ITEMS_BY_ID = {};
WRESTLING_GEAR_ITEMS.forEach((item) => { WRESTLING_GEAR_ITEMS_BY_ID[item.id] = item; });

function rankFor(ranks, avg) {
  let current = ranks[0];
  for (const rank of ranks) {
    if (avg >= rank.minAvg) current = rank;
  }
  return current;
}

function nextRankFor(ranks, avg) {
  return ranks.find((rank) => rank.minAvg > avg) || null;
}

const GOOD_JOBS = [
  {
    id: 'milos11',
    name: '🏪 Milos11',
    desc: 'Clock in at the convenience store.',
    skills: [
      { key: 'skill1', label: 'Register Speed' },
      { key: 'skill2', label: 'Stocking' },
      { key: 'skill3', label: 'Customer Service' },
      { key: 'skill4', label: 'Inventory Mgmt' },
    ],
  },
  {
    id: 'pizza',
    name: "🍕 Pete'sza Delivery",
    desc: 'Deliver pies around town.',
    skills: [
      { key: 'skill1', label: 'Navigation' },
      { key: 'skill2', label: 'Speed' },
      { key: 'skill3', label: 'Order Accuracy' },
      { key: 'skill4', label: 'Tips Charm' },
    ],
  },
  {
    id: 'wrestler',
    name: '🤼 Krogue Wrestler Gear',
    desc: 'Hawk wrestling merch on the corner.',
    skills: [
      { key: 'skill1', label: 'Haggling' },
      { key: 'skill2', label: 'Display Setup' },
      { key: 'skill3', label: 'Product Knowledge' },
      { key: 'skill4', label: 'Crowd Pull' },
    ],
  },
];

const BAD_JOBS = [
  {
    id: 'getaway',
    name: '🏎️ Getaway Driver',
    desc: "Wheelman for whoever's paying. Keep the engine running.",
    skills: [
      { key: 'skill1', label: 'Driving' },
      { key: 'skill2', label: 'Nerve' },
      { key: 'skill3', label: 'Route Knowledge' },
      { key: 'skill4', label: 'Evasion' },
    ],
  },
  {
    id: 'fence',
    name: '🕴️ The Fence',
    desc: 'Move stolen goods for cash, no questions asked.',
    skills: [
      { key: 'skill1', label: 'Appraisal' },
      { key: 'skill2', label: 'Negotiation' },
      { key: 'skill3', label: 'Discretion' },
      { key: 'skill4', label: 'Contacts' },
    ],
  },
];

const BAD_JOB_BUST_BASE = 0.08; // bust chance at base rank (0 skill)
const BAD_JOB_BUST_MIN = 0.02; // bust chance at maxed-out skill
const BAD_JOB_JAIL_YEARS = 1;

// Rebalanced -- mirrors mfmmoserver/gameLogic.js's DRUG_ITEMS_BY_ID exactly (that copy is the real
// authority, /hustle/sell-drugs is server-authoritative; this one is display-only). wholesaleCost
// +25%, sellMin/sellMax -10%, and jail time (see drugJailEscalationMultiplier in js/milos.js) now
// also escalates with lifetime units sold instead of staying flat -- was exploitable by spamming
// qty=1 sales to keep both risk and sentence length cheap forever.
const DRUG_ITEMS = [
  { id: 'drugWeed', name: '🌿 Weed', type: 'drug', wholesaleCost: 25, sellMin: 27, sellMax: 45, jailYearsPerUnit: 0.2, riskBase: 0.05, riskPerUnit: 0.02 },
  { id: 'drugPills', name: '💊 Pills', type: 'drug', wholesaleCost: 75, sellMin: 81, sellMax: 126, jailYearsPerUnit: 0.5, riskBase: 0.12, riskPerUnit: 0.03 },
  { id: 'drugMeth', name: '🧪 Meth', type: 'drug', wholesaleCost: 125, sellMin: 144, sellMax: 234, jailYearsPerUnit: 1.5, riskBase: 0.25, riskPerUnit: 0.05 },
  { id: 'drugCoke', name: '❄️ Cocaine', type: 'drug', wholesaleCost: 190, sellMin: 198, sellMax: 288, jailYearsPerUnit: 1, riskBase: 0.2, riskPerUnit: 0.04 },
];
const DRUG_ITEMS_BY_ID = {};
DRUG_ITEMS.forEach((d) => { DRUG_ITEMS_BY_ID[d.id] = d; });

// Guzman is the street-level entry point: cheap product, marginal profit. Selling more units on
// the street raises your drug dealing rank and introduces higher-end dealers with better product.
const DEALER_TIERS = [
  { id: 'guzman', name: '🕴️ Guzman Nestor', drugId: 'drugWeed', unlockUnits: 0 },
  { id: 'esteban', name: '🕴️ Esteban Vico', drugId: 'drugPills', unlockUnits: 400 },
  { id: 'ramon', name: '🕴️ Ramon Castillo', drugId: 'drugMeth', unlockUnits: 1000 },
  { id: 'dmitri', name: '🕴️ Dmitri Kovash', drugId: 'drugCoke', unlockUnits: 2000 },
];
const DEALER_QUICK_MIN = 3;
const DEALER_QUICK_MAX = 12;
const DEALER_QUICK_COOLDOWN_MS = 15000;
const DEALER_QUICK_SUCCESS_CHANCE = 0.85;

const ROBBERY_COOLDOWN_MS = 10000;
const ROBBERY_MIN = 20;
const ROBBERY_MAX = 150;
const ROBBERY_JAIL_YEARS = 1;

// ---------- Crime tiers (New Milos City) ----------
// A crime record system: every time you're busted for a crime (Da Skreetz Crime or one of these
// tiers), your "streak" goes up, and every future sentence gets longer as a result (repeat
// offenders get thrown the book). Community Service is the release valve — pay down your streak
// before you get caught again.
// Reward ranges are 20% below their original values (Drugs & Rugs balance pass -- crime pay down).
// Must match CRIME_TIERS_BY_ID in mfmmoserver/gameLogic.js exactly -- this copy only drives the
// client's reward-range preview, the server computes the actual payout.
const CRIME_TIERS = [
  { id: 'shoplift', name: '🛍️ Shoplifting', desc: 'Slip something into your jacket at a corner store.', minReward: 64, maxReward: 160, jailYears: 1, baseRisk: 0.35 },
  { id: 'pettytheft', name: '👛 Petty Theft', desc: 'Pick a pocket or snatch a purse off a table.', minReward: 280, maxReward: 520, jailYears: 1, baseRisk: 0.45 },
  { id: 'burglary', name: '🏚️ Burglary', desc: "Break into a house while nobody's home.", minReward: 960, maxReward: 1760, jailYears: 4, baseRisk: 0.5 },
  { id: 'grandtheft', name: '🚗 Grand Theft Auto', desc: 'Boost a car off the street and flip it.', minReward: 1800, maxReward: 2000, jailYears: 6, baseRisk: 0.6 },
];
const CRIME_COOLDOWN_MS = 12000;
const CRIME_RISK_MIN = 0.05;
const CRIME_STAT_MITIGATION = 0.5; // max reduction to a tier's baseRisk from Attack/Speed at 100/100
const CRIME_STREAK_MAX = 12; // cap on how much a record can escalate a sentence
const COMMUNITY_SERVICE_COOLDOWN_MS = 60000;
const COMMUNITY_SERVICE_BASE_COST = 750; // scales with current streak
const COMMUNITY_SERVICE_STREAK_REDUCTION = 4;
// Mirrors the server's communityServiceCost() exactly -- display-only, /crime/community-service is
// server-authoritative. Steeper than flat-linear: the higher your pending punitive sentence
// (crimeRecord.streak) already is, the more washing it down costs per streak point, not just more
// in step with it. Unchanged at streak=0.
const COMMUNITY_SERVICE_ESCALATION_RATE = 0.15;

function communityServiceCost(streak) {
  return Math.round(COMMUNITY_SERVICE_BASE_COST * (1 + streak) * (1 + streak * COMMUNITY_SERVICE_ESCALATION_RATE));
}

function crimeFailChance(tier) {
  const statScore = (character.stats.speed + character.stats.attack) / 200; // 0..1 at 100/100
  const reduction = Math.min(CRIME_STAT_MITIGATION, statScore * CRIME_STAT_MITIGATION);
  return Math.max(CRIME_RISK_MIN, tier.baseRisk - reduction);
}

const BANK_TIERS = [
  { name: '🏦 New Milos Discovery', cardName: 'NMB Discovery', maxBalance: 5000, upgradeCost: 0 },
  { name: '🏦 New Milos Bank Card', cardName: 'NMB Advantage Standard', maxBalance: 25000, upgradeCost: 10000 },
  { name: '🏦 New Milos Phalanx', cardName: 'NMB Advantage Elevated', maxBalance: 100000, upgradeCost: 50000 },
  { name: '🏦 New Milos Praetorian', cardName: 'NMB Endeavor Credit', maxBalance: 500000, upgradeCost: 250000 },
  { name: '🏦 New Milos Caesar Titanum', cardName: 'NMB Ti Casear', maxBalance: 2000000, upgradeCost: 1000000 },
];
const BANK_CREDIT_LIMIT_PCT = 0.5;
const BANK_BILLING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BANK_DEFAULT_JAIL_YEARS = 2;

const COMBAT_COOLDOWN_MS = 5000;
const NPC_TYPES = {
  citizen: { name: '🧍 Citizen', hp: 20, attack: 5, defense: 2, minReward: 30, maxReward: 90 },
  cop: { name: '👮 Cop', hp: 50, attack: 14, defense: 9, minReward: 90, maxReward: 220 },
  thug: { name: '🥷 Thug', hp: 30, attack: 8, defense: 4, minReward: 65, maxReward: 160 },
  gangster: { name: '🕴️ Gangster', hp: 45, attack: 12, defense: 7, minReward: 130, maxReward: 300 },
  goon: { name: '🥊 Goon', hp: 32, attack: 9, defense: 5, minReward: 70, maxReward: 170 },
  gangbanger: { name: '🔫 Gangbanger', hp: 48, attack: 13, defense: 7, minReward: 140, maxReward: 320 },
  vagabond: { name: '🎒 Vagabond', hp: 18, attack: 4, defense: 2, minReward: 25, maxReward: 80 },
  miscreant: { name: '🃏 Miscreant', hp: 35, attack: 9, defense: 5, minReward: 60, maxReward: 150 },
  milos: { name: '👹 Milos', hp: 100000, attack: 50, defense: 40, minReward: 100000, maxReward: 500000 },
};

// Cost-per-calorie rises with size -- a bigger pie is never a better deal than a slice, just less clicking.
const FOOD_ITEMS = [
  { id: 'pizza', name: '🍕 Pizza Slice', cost: 1, calories: 285 },
  { id: 'calzone', name: '🥟 Calzone', cost: 3, calories: 650 },
  { id: 'pizzamax', name: '🍕 Pizzamax (Whole Pie)', cost: 10, calories: 2000 },
  { id: 'dinuguan', name: '🍲 Dinuguan', cost: 15, calories: 900 },
  { id: 'halohalo', name: '🍧 Halo Halo', cost: 20, calories: 1000 },
  { id: 'primerib', name: '🥩 Prime Rib', cost: 30, calories: 1200 },
];

// Cost-per-Looks-point rises with tier so a pricier item is never a worse deal than a cheaper one.
const MAXX_ITEMS = [
  { id: 'mewing', name: '💋 Mewing Course', cost: 750, looks: 1, desc: '+1 Face Looks' },
  { id: 'bonesmash', name: '🔨 Bone Smashing Kit', cost: 2400, looks: 1, desc: '+1 Face Looks' },
  { id: 'hairline', name: '💇 Hair Transplant', cost: 4800, looks: 2, desc: '+2 Face Looks' },
  { id: 'jaw', name: '💉 Jawline Filler', cost: 7800, looks: 2, desc: '+2 Face Looks' },
  { id: 'canthal', name: '👁️ Canthal Tilt Surgery', cost: 15000, looks: 4, desc: '+4 Face Looks' },
  { id: 'limblength', name: '🦴 Limb Lengthening Surgery', cost: 12000, height: 1, speed: 1, desc: '+1" Height, +1 Speed' },
];

const TITLES = [
  { id: 'title10k', name: '$10k$', cost: 10000, cssClass: 'title-10k', how: 'Spend $10,000 in Cosmetixxx in Market.' },
  { id: 'title100k', name: '$100k$', cost: 100000, cssClass: 'title-100k', how: 'Spend $100,000 in Cosmetixxx in Market.' },
  { id: 'titleMillion', name: '$MILLION$', cost: 1000000, cssClass: 'title-million', how: 'Spend $1,000,000 in Cosmetixxx in Market.' },
];

const PEAK_TITLE = { id: 'peakCivilian', name: 'PEAK CIVILIAN', cssClass: 'title-peak', how: 'Max all 5 stats (Health, Attack, Speed, Defense, Looks) to 100.' };

const CAESAR_TI_TITLE = { id: 'caesarTi', name: 'CAESAR Ti', cssClass: 'title-caesarti', how: 'Unlock the New Milos Caesar Titanum bank tier.' };

const ADMIN_TITLE = { id: 'adminTitle', name: 'ADMIN', cssClass: 'title-admin', how: 'Granted by an admin.' };

const FAT_FUCK_TITLE = { id: 'fatFuck', name: 'FAT FUCK', cssClass: 'title-fatfuck', how: 'Eat 10,000 food items at Pete\'sza.' };
const LOOSE_TITLE = { id: 'looseTitle', name: 'LOOSE', cssClass: 'title-loose', how: 'Slut out 500 times.' };

// Leaderboard titles: server-assigned, one holder at a time per category, rechecked daily. Ids
// must match LEADERBOARD_TITLES in mfmmoserver/gameLogic.js exactly -- the server grants/revokes
// these directly onto titles.owned/equipped, same as it does for combat/jail/etc.
const LOOKSMAXXER_TITLE = { id: 'looksmaxxer', name: 'LOOKSMAXXER', cssClass: 'title-looksmaxxer', how: '#1 on the Looks leaderboard. Lost automatically if someone overtakes you.' };
const NETWORTH_TITLE = { id: 'highestNetWorth', name: 'HIGHEST NET WORTH', cssClass: 'title-networth', how: '#1 on the Money leaderboard (cash + bank + chips - credit owed). Lost automatically if someone overtakes you.' };
const HIGHEST_LEVEL_TITLE = { id: 'highestLevel', name: 'HIGHEST LEVEL', cssClass: 'title-highestlevel', how: '#1 on the Level leaderboard. Lost automatically if someone overtakes you.' };
const HEIGHTMAXXED_TITLE = { id: 'heightmaxxed', name: 'HeightMAXXED', cssClass: 'title-heightmaxxed', how: '#1 on the Height leaderboard. Lost automatically if someone overtakes you.' };

const BETA_SPIN_COST = 5000;
const BETA_SPIN_TITLES = [
  { id: 'betaSpin2026', name: 'Beta 2026', cssClass: 'title-beta2026', weight: 50, rarity: 'common', how: 'Won from an OPEN BETA spin in Cosmetixxx (common).' },
  { id: 'betaSpin2k26', name: 'Beta 2k26', cssClass: 'title-beta2k26', weight: 30, rarity: 'uncommon', how: 'Won from an OPEN BETA spin in Cosmetixxx (uncommon).' },
  { id: 'betaSpinTester', name: 'Beta Tester', cssClass: 'title-betatester', weight: 15, rarity: 'rare', how: 'Won from an OPEN BETA spin in Cosmetixxx (rare).' },
  { id: 'betaSpinOpen', name: 'OPEN BETA', cssClass: 'title-openbeta', weight: 5, rarity: 'mythic', how: 'Won from an OPEN BETA spin in Cosmetixxx (exclusive!).' },
];

const GOOD_SEASON1_COST = 10000;
const GOOD_SEASON1_TITLES = [
  { id: 'gs1CommonA', name: 'GS1®', cssClass: 'title-gs1-common', weight: 30, rarity: 'common', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1CommonB', name: 'G®', cssClass: 'title-g-common', weight: 25, rarity: 'common', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1Uncommon', name: 'G®1', cssClass: 'title-g1-uncommon', weight: 25, rarity: 'uncommon', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (uncommon).' },
  { id: 'gs1RareFull', name: 'GOOD® Season 1', cssClass: 'title-gs1-rare', weight: 8, rarity: 'rare', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
  { id: 'gs1RareGewd', name: 'Gewd', cssClass: 'title-gewd-rare', weight: 8, rarity: 'rare', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
  { id: 'gs1Mythic', name: 'I\'m SOWWY', cssClass: 'title-sowwy-mythic', weight: 4, rarity: 'mythic', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (mythic!).' },
  { id: 'gs1Common2', name: 'G Wagon®', cssClass: 'title-gwagon-common', weight: 20, rarity: 'common', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1RareBless', name: 'GOD IS GOOD®', cssClass: 'title-godisgood-rare', weight: 6, rarity: 'rare', how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
];

// Anima Crate: every item's name is a real character name (used everywhere -- Showcase, Inventory/
// Cosmetics, Trade dropdown, MTN listings, admin lookups, the "you won X" crate-result toast, wall
// posts, etc.) but never rendered on the badge chip itself, per the mystery-pull convention -- that
// stays blank/art-only. hideNameOnBadge is a plain display flag read by titleBadgeMarkup(), not a
// fake-markup name string: previously `name` itself held an invisible-span HTML hack, which broke
// anywhere that (correctly) escapes name text before displaying it. See itemLabel() below.
const ANIMA_CRATE_COST = 4500;
const ANIMA_CRATE_TITLES = [
  { id: 'animaCommonGoku', name: 'Goku', hideNameOnBadge: true, cssClass: 'title-anima-common-goku', weight: 31.67, rarity: 'common', how: 'Won from an Anima Crate spin (common).' },
  { id: 'animaCommonZoro', name: 'Zoro', hideNameOnBadge: true, cssClass: 'title-anima-common-zoro', weight: 31.67, rarity: 'common', how: 'Won from an Anima Crate spin (common).' },
  { id: 'animaCommonHatsune', name: 'Hatsune', hideNameOnBadge: true, cssClass: 'title-anima-common-hatsune', weight: 31.66, rarity: 'common', how: 'Won from an Anima Crate spin (common).' },
  { id: 'animaRareYujiro', name: 'Yujiro', hideNameOnBadge: true, cssClass: 'title-anima-rare-yujiro', weight: 1.5, rarity: 'uncommon', how: 'Won from an Anima Crate spin (Anima Rare).' },
  { id: 'animaRareCreator', name: 'The Creator', hideNameOnBadge: true, cssClass: 'title-anima-rare-creator', weight: 1.5, rarity: 'uncommon', how: 'Won from an Anima Crate spin (Anima Rare).' },
  { id: 'animaRareJinwoo', name: 'Jinwoo Mog', hideNameOnBadge: true, cssClass: 'title-anima-rare-jinwoo', weight: 1.5, rarity: 'uncommon', how: 'Won from an Anima Crate spin (Anima Rare).' },
  { id: 'animaMegaKirito', name: 'Kirito', hideNameOnBadge: true, cssClass: 'title-anima-mega-kirito', weight: 0.075, rarity: 'rare', how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  { id: 'animaMegaItachi', name: 'Itachi', hideNameOnBadge: true, cssClass: 'title-anima-mega-itachi', weight: 0.075, rarity: 'rare', how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  { id: 'animaMegaGodGoku', name: 'God Goku', hideNameOnBadge: true, cssClass: 'title-anima-mega-godgoku', weight: 0.075, rarity: 'rare', how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  { id: 'animaMegaLuffy', name: 'Luffy', hideNameOnBadge: true, cssClass: 'title-anima-mega-luffy', weight: 0.075, rarity: 'rare', how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  // Once equipped, also recolors the player's actual display name with a rainbow gradient
  // everywhere it renders -- see js/nameStyle.js.
  { id: 'animaHyperGear5', name: 'Gear 5 Luffy', hideNameOnBadge: true, cssClass: 'title-anima-hyper-gear5', weight: 0.05, rarity: 'mythic', how: 'Won from an Anima Crate spin (Anima Mega Hyper Rare!). Recolors your name everywhere with a rainbow gradient while equipped.' },
  { id: 'animaHyperMakima', name: 'Makima', hideNameOnBadge: true, cssClass: 'title-anima-hyper-makima', weight: 0.05, rarity: 'mythic', how: 'Won from an Anima Crate spin (Anima Mega Hyper Rare!). Recolors your name everywhere with a rainbow gradient while equipped.' },
];

// RED vs. BLUE Crate: same mystery-pull convention as Anima (real name, hideNameOnBadge: true) --
// two fully independent pools/catalogs, one per crate. Presidential Rares are each side's mythic
// top prize and additionally recolor the player's name/font while equipped -- see js/nameStyle.js.
const RED_CRATE_COST = 20000;
const RED_CRATE_TITLES = [
  { id: 'redTrumpFistUp', name: 'Donald Trump Fist Up', hideNameOnBadge: true, cssClass: 'title-red-trumpfistup', weight: 5, rarity: 'mythic', how: 'Won from a RED Crate spin (Presidential Rare!). Recolors your name everywhere in a glowing Republican Red Xanh Mono font while equipped.' },
  { id: 'redTrump', name: 'Trump', hideNameOnBadge: true, cssClass: 'title-red-trump', weight: 6.67, rarity: 'rare', how: 'Won from a RED Crate spin (rare).' },
  { id: 'redBush', name: 'Bush', hideNameOnBadge: true, cssClass: 'title-red-bush', weight: 6.67, rarity: 'rare', how: 'Won from a RED Crate spin (rare).' },
  { id: 'redRegan', name: 'Regan', hideNameOnBadge: true, cssClass: 'title-red-regan', weight: 6.66, rarity: 'rare', how: 'Won from a RED Crate spin (rare).' },
  { id: 'redNixon', name: 'Nixon', hideNameOnBadge: true, cssClass: 'title-red-nixon', weight: 10, rarity: 'uncommon', how: 'Won from a RED Crate spin (uncommon).' },
  { id: 'redMcconel', name: 'Mcconel', hideNameOnBadge: true, cssClass: 'title-red-mcconel', weight: 10, rarity: 'uncommon', how: 'Won from a RED Crate spin (uncommon).' },
  { id: 'redDesantis', name: 'Desantis', hideNameOnBadge: true, cssClass: 'title-red-desantis', weight: 10, rarity: 'uncommon', how: 'Won from a RED Crate spin (uncommon).' },
  { id: 'redMtg', name: 'Marjorie Taylor Greene', hideNameOnBadge: true, cssClass: 'title-red-mtg', weight: 15, rarity: 'common', how: 'Won from a RED Crate spin (common).' },
  { id: 'redLoomer', name: 'Laura Loomer', hideNameOnBadge: true, cssClass: 'title-red-loomer', weight: 15, rarity: 'common', how: 'Won from a RED Crate spin (common).' },
  { id: 'redCruz', name: 'Ted Cruz', hideNameOnBadge: true, cssClass: 'title-red-cruz', weight: 15, rarity: 'common', how: 'Won from a RED Crate spin (common).' },
];

const BLUE_CRATE_COST = 20000;
const BLUE_CRATE_TITLES = [
  { id: 'blueDarkBrandon', name: 'Dark Brandon', hideNameOnBadge: true, cssClass: 'title-blue-darkbrandon', weight: 5, rarity: 'mythic', how: 'Won from a BLUE Crate spin (Presidential Rare!). Recolors your name everywhere in a glowing Democrat Blue Xanh Mono font while equipped.' },
  { id: 'blueBiden', name: 'Joe Biden', hideNameOnBadge: true, cssClass: 'title-blue-biden', weight: 6.67, rarity: 'rare', how: 'Won from a BLUE Crate spin (rare).' },
  { id: 'blueObama', name: 'Obama', hideNameOnBadge: true, cssClass: 'title-blue-obama', weight: 6.67, rarity: 'rare', how: 'Won from a BLUE Crate spin (rare).' },
  { id: 'blueJfk', name: 'JFK', hideNameOnBadge: true, cssClass: 'title-blue-jfk', weight: 6.66, rarity: 'rare', how: 'Won from a BLUE Crate spin (rare).' },
  { id: 'blueHarris', name: 'Harris', hideNameOnBadge: true, cssClass: 'title-blue-harris', weight: 10, rarity: 'uncommon', how: 'Won from a BLUE Crate spin (uncommon).' },
  { id: 'blueCarter', name: 'Jimmy Carter', hideNameOnBadge: true, cssClass: 'title-blue-carter', weight: 10, rarity: 'uncommon', how: 'Won from a BLUE Crate spin (uncommon).' },
  { id: 'blueClinton', name: 'Clinton', hideNameOnBadge: true, cssClass: 'title-blue-clinton', weight: 10, rarity: 'uncommon', how: 'Won from a BLUE Crate spin (uncommon).' },
  { id: 'blueNewsome', name: 'Gavin Newsome', hideNameOnBadge: true, cssClass: 'title-blue-newsome', weight: 15, rarity: 'common', how: 'Won from a BLUE Crate spin (common).' },
  { id: 'blueBernie', name: 'Bernie', hideNameOnBadge: true, cssClass: 'title-blue-bernie', weight: 15, rarity: 'common', how: 'Won from a BLUE Crate spin (common).' },
  { id: 'blueAoc', name: 'AOC', hideNameOnBadge: true, cssClass: 'title-blue-aoc', weight: 15, rarity: 'common', how: 'Won from a BLUE Crate spin (common).' },
];

// Hidden autograph parallels: NOT in RED_CRATE_TITLES/BLUE_CRATE_TITLES (so they never show in the
// crate odds list and weightedTitleFrom can never draw them directly -- see maybeSwapHiddenAuto in
// market.js), no `weight` for the same reason. A 1% roll swaps one in whenever a spin lands on that
// side's Presidential Rare, so from the player's perspective it's a secret alternate pull, not a
// separately-listed prize. Still resolvable via getItemDef/allTitleDefsFor like any other title
// (inventory, showcase, trade, sell) once actually won.
const RED_BLUE_HIDDEN_TITLES = [
  { id: 'redTrumpAuto', name: 'Donald Trump Auto', hideNameOnBadge: true, cssClass: 'title-red-trumpauto', rarity: 'mythic', how: 'Hidden 1% pull from a RED Crate Presidential Rare spin -- an autographed alternate. Recolors your name everywhere in a glowing Republican Red Xanh Mono font while equipped.' },
  { id: 'blueBidenAuto', name: 'Joe Biden Auto', hideNameOnBadge: true, cssClass: 'title-blue-bidenauto', rarity: 'mythic', how: 'Hidden 1% pull from a BLUE Crate Presidential Rare spin -- an autographed alternate. Recolors your name everywhere in a glowing Democrat Blue Xanh Mono font while equipped.' },
];

// Counterfinish Crate: skins/finishes, not characters -- item label text is always visible.
const COUNTERFINISH_CRATE_COST = 3000;
const COUNTERFINISH_CRATE_TITLES = [
  { id: 'cfSafari', name: 'Safari', cssClass: 'title-cf-safari', weight: 15, rarity: 'common', how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfTiger', name: 'Tiger', cssClass: 'title-cf-tiger', weight: 15, rarity: 'common', how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfTronic', name: 'Tronic', cssClass: 'title-cf-tronic', weight: 15, rarity: 'common', how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfFree', name: 'Free', cssClass: 'title-cf-free', weight: 15, rarity: 'common', how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfLore', name: 'Lore', cssClass: 'title-cf-lore', weight: 15, rarity: 'uncommon', how: 'Won from a Counterfinish Crate spin (rare).' },
  { id: 'cfHowl', name: 'Howl', cssClass: 'title-cf-howl', weight: 15, rarity: 'uncommon', how: 'Won from a Counterfinish Crate spin (rare).' },
  { id: 'cfFade', name: 'Fade', cssClass: 'title-cf-fade', weight: 15, rarity: 'uncommon', how: 'Won from a Counterfinish Crate spin (rare).' },
  { id: 'cfSapphire', name: 'Sapphire', cssClass: 'title-cf-sapphire', weight: 1.5, rarity: 'rare', how: 'Won from a Counterfinish Crate spin (Gem).' },
  { id: 'cfRuby', name: 'Ruby', cssClass: 'title-cf-ruby', weight: 1.5, rarity: 'rare', how: 'Won from a Counterfinish Crate spin (Gem).' },
  { id: 'cfEmerald', name: 'Emerald', cssClass: 'title-cf-emerald', weight: 1.5, rarity: 'rare', how: 'Won from a Counterfinish Crate spin (Gem).' },
  // Hyper Gems: item label always reads "HYPER" (neutral white glow) -- the gem-colored,
  // cursive-font name recolor is a separate equipped perk, see js/nameStyle.js.
  { id: 'cfHyperSapphire', name: 'HYPER', cssClass: 'title-cf-hyper-sapphire', weight: 0.17, rarity: 'mythic', how: 'Won from a Counterfinish Crate spin (Hyper Gem!). Recolors your name everywhere in Sapphire blue with a cursive font while equipped.' },
  { id: 'cfHyperRuby', name: 'HYPER', cssClass: 'title-cf-hyper-ruby', weight: 0.17, rarity: 'mythic', how: 'Won from a Counterfinish Crate spin (Hyper Gem!). Recolors your name everywhere in Ruby red with a cursive font while equipped.' },
  { id: 'cfHyperEmerald', name: 'HYPER', cssClass: 'title-cf-hyper-emerald', weight: 0.16, rarity: 'mythic', how: 'Won from a Counterfinish Crate spin (Hyper Gem!). Recolors your name everywhere in Emerald green with a cursive font while equipped.' },
];

// Leems Larudo x GOOD: every title's art IS its name (a piece of wordmark/logo design), so like
// Anima/Red/Blue the badge chip stays art-only (hideNameOnBadge) while the real name still shows
// everywhere else (Inventory, Trade, MTN, the "you won X" toast). Lives in the GOOD tab (see
// CRATE_LLG in js/market.js), not Cosmetixxx.
const LLG_CRATE_COST = 20000;
const LEEMS_LARUDO_GOOD_TITLES = [
  { id: 'llgSkyCommon', name: 'Good Sky Common', hideNameOnBadge: true, cssClass: 'title-llg-sky-common', weight: 19.475, rarity: 'common', how: 'Won from a Leems Larudo x GOOD® spin (common).' },
  { id: 'llgSkyRegistered', name: 'Sky Registered', hideNameOnBadge: true, cssClass: 'title-llg-sky-registered', weight: 19.475, rarity: 'common', how: 'Won from a Leems Larudo x GOOD® spin (common).' },
  { id: 'llgGRegistered', name: 'G Registered', hideNameOnBadge: true, cssClass: 'title-llg-g-registered', weight: 19.475, rarity: 'common', how: 'Won from a Leems Larudo x GOOD® spin (common).' },
  { id: 'llgHappy', name: 'Happy', hideNameOnBadge: true, cssClass: 'title-llg-happy', weight: 19.475, rarity: 'common', how: 'Won from a Leems Larudo x GOOD® spin (common).' },
  { id: 'llgRegisteredSkyAlt', name: 'Registered Sky Alt', hideNameOnBadge: true, cssClass: 'title-llg-registered-sky-alt', weight: 8, rarity: 'uncommon', how: 'Won from a Leems Larudo x GOOD® spin (uncommon).' },
  { id: 'llgHappyAlt', name: 'Happy Alt', hideNameOnBadge: true, cssClass: 'title-llg-happy-alt', weight: 8, rarity: 'uncommon', how: 'Won from a Leems Larudo x GOOD® spin (uncommon).' },
  { id: 'llgRegisteredAlt', name: 'Good Registered Alt', hideNameOnBadge: true, cssClass: 'title-llg-registered-alt', weight: 3, rarity: 'rare', how: 'Won from a Leems Larudo x GOOD® spin (rare).' },
  { id: 'llgTypeface', name: 'Good Typeface', hideNameOnBadge: true, cssClass: 'title-llg-typeface', weight: 3, rarity: 'rare', how: 'Won from a Leems Larudo x GOOD® spin (rare).' },
  { id: 'llgImpossible', name: 'Impossible', hideNameOnBadge: true, cssClass: 'title-llg-impossible', weight: 0.05, rarity: 'mythic', how: 'Won from a Leems Larudo x GOOD® spin (mythic! 0.05% odds).' },
  { id: 'llgSpecialFont', name: 'GOOD® Special Font', hideNameOnBadge: true, cssClass: 'title-llg-special-font', weight: 0.05, rarity: 'mythic', how: 'Won from a Leems Larudo x GOOD® spin (mythic! 0.05% odds).' },
];

// Prestiging a Leems Larudo x GOOD title swaps in a wholly different piece of art per level instead
// of the usual "append a roman numeral to the name" -- each base id here maps to how many prestige
// art levels actually exist (Impossible/GOOD Special Font only got 2 designed; everything else got
// the full 4). Read by the getItemDef prestige branch below, checked before the generic one.
const LLG_MAX_PRESTIGE = {
  llgSkyCommon: 4,
  llgSkyRegistered: 4,
  llgGRegistered: 4,
  llgHappy: 4,
  llgRegisteredSkyAlt: 4,
  llgHappyAlt: 4,
  llgRegisteredAlt: 4,
  llgTypeface: 4,
  llgImpossible: 2,
  llgSpecialFont: 2,
};

// A normal title can prestige indefinitely (the generic branch just keeps appending roman
// numerals), but these have a finite amount of designed art -- checked by both the Prestige
// button's visibility and prestigeTitle() itself (js/inventory.js) so a title can't be pushed past
// its last drawn level.
function llgPrestigeCapReached(baseId, level) {
  return baseId in LLG_MAX_PRESTIGE && level >= LLG_MAX_PRESTIGE[baseId];
}

// VISIONS: full app-shell theme reskins. Each icon is a diagonal 2-color split (no art asset --
// same gradient the design doc's own mockup used). NOT titles -- see the dedicated getItemDef
// branch above and js/visions.js for the equip/reskin engine. Equipping one reskins the equipper's
// own whole app view AND their Profile page for anyone visiting it (driven by the profile
// SUBJECT's equipped Vision, not the viewer's own).
const VISIONS_CRATE_COST = 20000;
const VISIONS_TITLES = [
  { id: 'visionGoodtrix', name: 'GOODTRIX', cssClass: 'title-vision-goodtrix', weight: 0.167, rarity: 'mythic', how: 'Won from a VISIONS spin (mythic!). Darkmode + blue text, Matrix-style font. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionPandora', name: "Pandora's Box", cssClass: 'title-vision-pandora', weight: 0.167, rarity: 'mythic', how: 'Won from a VISIONS spin (mythic!). CS2 Pandora\'s Box gloves colorway. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionSlate', name: 'SLATE', cssClass: 'title-vision-slate', weight: 0.166, rarity: 'mythic', how: 'Won from a VISIONS spin (mythic!). Clean darkmode. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionNeonNights', name: 'Neon Nights', cssClass: 'title-vision-neonnights', weight: 3.625, rarity: 'rare', how: 'Won from a VISIONS spin (rare). Hot pink + cyan cyberpunk. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionCrimsonTide', name: 'Crimson Tide', cssClass: 'title-vision-crimsontide', weight: 3.625, rarity: 'rare', how: 'Won from a VISIONS spin (rare). Deep red / maroon. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionObsidianGold', name: 'Obsidian Gold', cssClass: 'title-vision-obsidiangold', weight: 3.625, rarity: 'rare', how: 'Won from a VISIONS spin (rare). Black + gold luxury. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionArcticFrost', name: 'Arctic Frost', cssClass: 'title-vision-arcticfrost', weight: 3.625, rarity: 'rare', how: 'Won from a VISIONS spin (rare). Icy blue & white. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionCopperRust', name: 'Copper Rust', cssClass: 'title-vision-copperrust', weight: 6, rarity: 'uncommon', how: 'Won from a VISIONS spin (uncommon). Industrial copper / orange. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionToxicWaste', name: 'Toxic Waste', cssClass: 'title-vision-toxicwaste', weight: 6, rarity: 'uncommon', how: 'Won from a VISIONS spin (uncommon). Radioactive green / yellow. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionDeepSea', name: 'Deep Sea', cssClass: 'title-vision-deepsea', weight: 6, rarity: 'uncommon', how: 'Won from a VISIONS spin (uncommon). Navy / teal. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionRoseGold', name: 'Rose Gold', cssClass: 'title-vision-rosegold', weight: 6, rarity: 'uncommon', how: 'Won from a VISIONS spin (uncommon). Pink-gold metallic. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionCottonCandy', name: 'Cotton Candy', cssClass: 'title-vision-cottoncandy', weight: 6, rarity: 'uncommon', how: 'Won from a VISIONS spin (uncommon). Blue / pink pastel. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionForestMoss', name: 'Forest Moss', cssClass: 'title-vision-forestmoss', weight: 11, rarity: 'common', how: 'Won from a VISIONS spin (common). Muted green / brown. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionSandstorm', name: 'Sandstorm', cssClass: 'title-vision-sandstorm', weight: 11, rarity: 'common', how: 'Won from a VISIONS spin (common). Tan / desert. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionSteelBlue', name: 'Steel Blue', cssClass: 'title-vision-steelblue', weight: 11, rarity: 'common', how: 'Won from a VISIONS spin (common). Simple corporate blue-gray. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionBlush', name: 'Blush', cssClass: 'title-vision-blush', weight: 11, rarity: 'common', how: 'Won from a VISIONS spin (common). Soft pink pastel. Reskins your whole game view, and your Profile page for anyone visiting it.' },
  { id: 'visionCharcoal', name: 'Charcoal', cssClass: 'title-vision-charcoal', weight: 11, rarity: 'common', how: 'Won from a VISIONS spin (common). Plain gray-black. Reskins your whole game view, and your Profile page for anyone visiting it.' },
];

// Milos Legends 1 Crate: real character portraits (not wordmark art), so names show normally on
// the badge, same as RED/BLUE Crate. Lives in Cosmetixxx (shop-titles), not GOOD -- confirmed by
// the user, who drew a hard line between the two ("Milos Legends is in Cosmetixxx. Only Leems
// Larudo x Good is in GOOD®").
const MILOS_LEGENDS_CRATE_COST = 20000;
const MILOS_LEGENDS_TITLES = [
  { id: 'mlConnie', name: 'Connie the Boytoy', hideNameOnBadge: true, cssClass: 'title-ml-connie', weight: 15, rarity: 'common', how: 'Won from a Milos Legends 1 spin (common).' },
  { id: 'mlEliteUnit', name: 'ELITE Unit', hideNameOnBadge: true, cssClass: 'title-ml-elite-unit', weight: 15, rarity: 'common', how: 'Won from a Milos Legends 1 spin (common).' },
  { id: 'mlMrSerious', name: 'Mr. Serious', hideNameOnBadge: true, cssClass: 'title-ml-mr-serious', weight: 15, rarity: 'common', how: 'Won from a Milos Legends 1 spin (common).' },
  { id: 'mlOtaku', name: 'The Otaku', hideNameOnBadge: true, cssClass: 'title-ml-otaku', weight: 15, rarity: 'common', how: 'Won from a Milos Legends 1 spin (common).' },
  { id: 'mlPileit', name: "Pile'it the Pilot", hideNameOnBadge: true, cssClass: 'title-ml-pileit', weight: 15, rarity: 'common', how: 'Won from a Milos Legends 1 spin (common).' },
  { id: 'mlKhylil', name: 'Khylil Draine', hideNameOnBadge: true, cssClass: 'title-ml-khylil', weight: 8.3, rarity: 'uncommon', how: 'Won from a Milos Legends 1 spin (uncommon).' },
  { id: 'mlHawken', name: 'Hawken Runquist', hideNameOnBadge: true, cssClass: 'title-ml-hawken', weight: 8.3, rarity: 'uncommon', how: 'Won from a Milos Legends 1 spin (uncommon).' },
  { id: 'mlSuperjailWarden', name: 'Superjail Warden', hideNameOnBadge: true, cssClass: 'title-ml-superjail-warden', weight: 8.3, rarity: 'uncommon', how: 'Won from a Milos Legends 1 spin (uncommon).' },
  { id: 'mlSpecialUnit', name: 'Special Unit', hideNameOnBadge: true, cssClass: 'title-ml-special-unit', weight: 0.05, rarity: 'mythic', how: 'Won from a Milos Legends 1 spin (mythic! 0.05% odds).' },
  { id: 'mlKrogger', name: 'Krogger', hideNameOnBadge: true, cssClass: 'title-ml-krogger', weight: 0.05, rarity: 'mythic', how: 'Won from a Milos Legends 1 spin (mythic! 0.05% odds).' },
];

const RENAME_COST = 10000;

const PISTOL_ITEMS = [
  { id: 'glock19', name: '🔫 Glock 19', type: 'pistol', caliber: '9mm', cost: 500, atkBonus: 6 },
  { id: 'm9', name: '🔫 Beretta M9', type: 'pistol', caliber: '9mm', cost: 650, atkBonus: 7 },
];
const RIFLE_ITEMS = [
  { id: 'ar15', name: '🎯 AR-15', type: 'rifle', caliber: '5.56', cost: 2500, atkBonus: 12 },
  { id: 'm4', name: '🎯 M4 Carbine', type: 'rifle', caliber: '5.56', cost: 3200, atkBonus: 14 },
];
const GUN_ITEMS_BY_ID = {};
[...PISTOL_ITEMS, ...RIFLE_ITEMS].forEach((item) => { GUN_ITEMS_BY_ID[item.id] = item; });

// Melee weapons: no license needed, legal to carry, cheap alternative to a gun for Combat.
const MELEE_ITEMS = [
  { id: 'knuckles', name: '👊 Brass Knuckles', type: 'melee', cost: 75, atkBonus: 2 },
  { id: 'knife', name: '🔪 Switchblade Knife', type: 'melee', cost: 200, atkBonus: 4 },
];
const MELEE_ITEMS_BY_ID = {};
MELEE_ITEMS.forEach((item) => { MELEE_ITEMS_BY_ID[item.id] = item; });

const AMMO_ITEMS = [
  { id: 'ammo9mm', name: '📦 9mm Ammo Box', type: 'ammo', caliber: '9mm', cost: 50 },
  { id: 'ammo556', name: '📦 5.56 Ammo Box', type: 'ammo', caliber: '5.56', cost: 80 },
];
const AMMO_ITEMS_BY_ID = {};
AMMO_ITEMS.forEach((item) => { AMMO_ITEMS_BY_ID[item.id] = item; });

// Priced well above the priciest rifle so it reads as a serious one-time investment, not a normal
// gear buy -- consumed after the wearer's next PvP duel (win or lose), enforced server-side.
const ARMOR_ITEMS = [
  { id: 'bodyArmor', name: '🦺 Body Armor', type: 'gear', slot: 'armor', cost: 8000, statBonuses: { defense: 15 }, desc: '+15 Defense in a fight. Consumed after your next duel, win or lose.' },
];
const ARMOR_ITEMS_BY_ID = {};
ARMOR_ITEMS.forEach((item) => { ARMOR_ITEMS_BY_ID[item.id] = item; });

const CONCEALED_APPLY_COST = 2000;
const CONCEALED_WAIT_MS = 10 * 60 * 1000;
const JAIL_YEARS_WEAPON = 20;
const RANGE_COOLDOWN_MS = 3000;

// ---------- Jail activities: doing time doesn't have to be dead time ----------
const JAIL_WORKOUT_COOLDOWN_MS = 6000;
const JAIL_WORKOUT_ATK_GAIN_MIN = 0.1;
const JAIL_WORKOUT_ATK_GAIN_MAX = 0.25;
const JAIL_WORKOUT_DEF_GAIN_MIN = 0.05;
const JAIL_WORKOUT_DEF_GAIN_MAX = 0.15;

const JAIL_FIGHT_COOLDOWN_MS = 8000;
const JAIL_FIGHT_ATK_GAIN_MIN = 0.1;
const JAIL_FIGHT_ATK_GAIN_MAX = 0.3;
const JAIL_FIGHT_DEF_GAIN_MIN = 0.05;
const JAIL_FIGHT_DEF_GAIN_MAX = 0.15;
const JAIL_FIGHT_LOSS_MIN = 5;
const JAIL_FIGHT_LOSS_MAX = 20;

const JAIL_CONTRABAND_MARKUP = 1.2; // smuggled-in prices cost more than buying it straight -- a believable risk premium, not a punitive one

const GUN_SAFETY_QUESTIONS = [
  { q: 'What should you always assume about a firearm?', options: ['It\'s unloaded', 'It\'s loaded', 'It\'s a toy', 'It\'s safe'], correct: 1 },
  { q: 'Where should your finger be when you are not firing?', options: ['On the trigger', 'Near the trigger', 'Off the trigger', 'Doesn\'t matter'], correct: 2 },
  { q: 'What direction should the muzzle always point?', options: ['At the ground only', 'A safe direction', 'At the sky only', 'Doesn\'t matter'], correct: 1 },
  { q: 'Before cleaning a firearm, you should:', options: ['Load it first', 'Assume it\'s unloaded', 'Verify it\'s unloaded', 'Nothing special'], correct: 2 },
  { q: 'What should you wear when firing at a range?', options: ['Nothing', 'A hat', 'Gloves only', 'Eye and ear protection'], correct: 3 },
  { q: 'How should firearms be stored at home?', options: ['Loaded and ready', 'Unloaded and locked', 'On a table', 'In a drawer, loaded'], correct: 1 },
  { q: 'What should you do before pulling the trigger?', options: ['Just aim', 'Close your eyes', 'Identify your target and what\'s beyond it', 'Nothing'], correct: 2 },
  { q: 'Is it safe to hand someone a firearm without checking if it\'s loaded?', options: ['Yes', 'No', 'Sometimes', 'Doesn\'t matter'], correct: 1 },
  { q: 'What should you do if a firearm misfires?', options: ['Look down the barrel', 'Shake it', 'Keep it pointed in a safe direction and wait', 'Pull the trigger again immediately'], correct: 2 },
  { q: 'Alcohol and firearms:', options: ['Are fine together', 'Only a little is ok', 'Should never be mixed', 'Doesn\'t matter'], correct: 2 },
];

const screenCreate = document.getElementById('screen-create');
const screenGame = document.getElementById('screen-game');

let character = null;

// ---------- helpers ----------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function clampStat(v) {
  return Math.max(0, Math.min(STAT_CAP, Math.round(v * 100) / 100));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

// Plain-text label for an item outside of its badge (Inventory/Cosmetics cards, Trade dropdown,
// MTN listings, admin lookups, crate-result toasts, Profile Showcase). `name` is always the real,
// escapable name now -- hideNameOnBadge (read by titleBadgeMarkup()) is what keeps it off the
// badge chip itself, so this is just `.name` directly. Kept as a named helper since call sites
// already read that way and it documents "the label to show a human", not "the raw catalog name".
function itemLabel(item) {
  return item.name;
}

// Sell prices by rarity tier -- only titles tagged with a `rarity` (the crate/store title
// catalogs) are sellable; leaderboard/achievement/custom titles have no rarity and aren't.
const TITLE_SELL_PRICE_BY_RARITY = { common: 1000, uncommon: 2000, rare: 2500, mythic: 10000 };

// Highest rarity first; titles with no rarity (leaderboard/achievement/custom) sort after every
// tagged rarity, matching their "not sellable/prestigeable" status.
const TITLE_RARITY_SORT_RANK = { mythic: 3, rare: 2, uncommon: 1, common: 0 };

// Shared comparator for any list of owned title stacks: highest rarity first, then highest
// prestige level first, so a player's titles read best-to-worst instead of acquisition order.
// `idOf`/`itemOf` let callers pass either raw stack objects or already-resolved title defs.
function compareTitleStacksByRarityThenPrestige(idOf, itemOf) {
  return (a, b) => {
    const itemA = itemOf(a);
    const itemB = itemOf(b);
    const rarityA = itemA.rarity ? TITLE_RARITY_SORT_RANK[itemA.rarity] : -1;
    const rarityB = itemB.rarity ? TITLE_RARITY_SORT_RANK[itemB.rarity] : -1;
    if (rarityB !== rarityA) return rarityB - rarityA;
    return parsePrestigeId(idOf(b)).level - parsePrestigeId(idOf(a)).level;
  };
}

// Prestige stacks are synthesized on the fly rather than hardcoded per-title (any crate title can
// be prestiged) -- id shape is `${baseTitleId}_p${level}`, e.g. betaSpin2026_p1 = "Beta 2026 I".
const PRESTIGE_ID_RE = /^(.+)_p(\d+)$/;
const PRESTIGE_COST = 5;

// ---------- Balaclava Badges ----------
// A cosmetic slot separate from Titles -- renders BEFORE the title everywhere a name shows.
// Deliberately kept structurally separate from the title system (own catalog, own equip field,
// own inventory-stack rank-up flow) rather than routed through getItemDef/allTitleDefsFor, since
// those are full of title-only assumptions (prestige/NMG id regexes, rarity odds, etc.) that don't
// apply here.
const BALACLAVA_BADGE_CRATE_COST = 960;
const BADGE_RANK_UP_COST = 5; // same duplicate-consumption idiom as PRESTIGE_COST for titles
const BADGE_DEFS = [
  { id: 'badgeBronze', name: 'Bronze Balaclava', cssClass: 'badge-bronze' },
  { id: 'badgeSilver', name: 'Silver Balaclava', cssClass: 'badge-silver' },
  { id: 'badgeGold', name: 'Gold Balaclava', cssClass: 'badge-gold' },
  { id: 'badgePlatinum', name: 'Platinum Balaclava', cssClass: 'badge-platinum' },
  { id: 'badgeMaster', name: 'Master Balaclava', cssClass: 'badge-master' },
  { id: 'badgeGrandmaster', name: 'Grandmaster Balaclava', cssClass: 'badge-grandmaster' },
  { id: 'badgeRuby', name: 'Ruby Balaclava', cssClass: 'badge-ruby' },
  { id: 'badgeSapphire', name: 'Sapphire Balaclava', cssClass: 'badge-sapphire' },
  { id: 'badgeEmerald', name: 'Emerald Balaclava', cssClass: 'badge-emerald' },
  { id: 'badgeUnits', name: 'UNITS Balaclava', cssClass: 'badge-units' },
];
// Bronze -> Silver -> Gold -> Platinum -> Master -> Grandmaster: each step consumes
// BADGE_RANK_UP_COST of the current rank, grants 1 of the next. Grandmaster -> Gem and
// 3 Gems -> UNITS are their own special-cased trades (see rankUpBadge/tradeGrandmasterForGem/
// tradeGemsForUnits in inventory.js), not part of this linear chain.
const BADGE_RANK_CHAIN = ['badgeBronze', 'badgeSilver', 'badgeGold', 'badgePlatinum', 'badgeMaster', 'badgeGrandmaster'];
const BADGE_GEM_IDS = ['badgeRuby', 'badgeSapphire', 'badgeEmerald'];
const BADGE_UNITS_ID = 'badgeUnits';

function getBadgeDef(id) {
  return BADGE_DEFS.find((b) => b.id === id) || null;
}

// Same "ById" split as styledNameHtmlById (js/nameStyle.js) -- chat messages only ever carry a raw
// badgeId (see chatTitleMarkup in js/milos.js), never a full character object, so the actual chip
// markup lives here and badgeChipMarkup(char) is just a thin wrapper over it.
function badgeChipMarkupById(badgeId) {
  if (!badgeId) return '';
  const def = getBadgeDef(badgeId);
  if (!def) return '';
  return `<span class="badge-chip ${def.cssClass}" title="${escapeHtml(def.name)}"></span>`;
}

function badgeChipMarkup(char) {
  return badgeChipMarkupById(char.badges && char.badges.equipped);
}

// New Milos Grading (NMG) results are synthesized the same way prestige is -- id shape
// `${baseTitleId}_nmg${grade}`, e.g. cfHyperSapphire_p1_nmg7 = "HYPER I NMG 7". Unlike prestige's
// numeral, the grade itself was a one-time random roll (server-side, see mfmmoserver/gameLogic.js
// rollNmgGrade), but once revealed it's permanently baked into the id string exactly like the
// prestige level is -- so no separate persisted-full-def array is needed, the id alone is
// self-describing. This is the client's single source of truth for label/color display; the
// server's own copy (gameLogic.js NMG_GRADE_WEIGHTS) only needs the numeric odds, never these.
const NMG_ID_RE = /^(.+)_nmg(\d{1,2})$/;

// ---------- Foil Ascension ----------
// Burn 3 copies of one plain title + $25,000 at Cosmetixxx -> 1 Foil (see js/market.js
// foilAscendTitle). Synthesized from the id exactly like prestige and NMG are -- id shape
// `${baseId}_foil`, e.g. mlKrogger_foil = "Foil Krogger".
//
// The suffix is a literal word, with no trailing digits, so it can never be mistaken for either of
// the other two synthesized shapes: PRESTIGE_ID_RE needs `_p` + digits and NMG_ID_RE needs `_nmg` +
// digits. Both regexes are hand-mirrored server-side (NMG_PRESTIGE_ID_RE / NMG_GRADED_ID_RE in
// mfmmoserver/gameLogic.js) with the same digit requirement, so the non-collision holds on both
// sides. Foils are only ever minted from a plain ungraded, un-prestiged stack, so a foil id never
// wraps one of the other shapes either.
const FOIL_ID_RE = /^(.+)_foil$/;
const FOIL_ASCENSION_COPIES = 3;
const FOIL_ASCENSION_COST = 25000;
const NMG_GRADE_TIERS = {
  10: { label: 'Elite', color: '#f7d51d' },
  9: { label: 'Mint', color: '#ffffff' },
  8: { label: 'Good', color: '#ffffff' },
  7: { label: 'Worn', color: '#c9a875' },
  6: { label: 'Worn', color: '#c9a875' },
  5: { label: 'Worn', color: '#c9a875' },
  4: { label: 'Worn', color: '#c9a875' },
  3: { label: 'Sub', color: '#8a8a8a' },
  2: { label: 'Sub', color: '#8a8a8a' },
  1: { label: 'Sub', color: '#8a8a8a' },
};

function toRoman(num) {
  const table = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = num;
  let result = '';
  table.forEach(([value, symbol]) => {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  });
  return result;
}

// `id` is either a plain title id (level 0, no numeral yet) or a `${baseId}_p${level}` prestige
// stack. Returns { baseId, level } for both cases so callers don't need two code paths.
function parsePrestigeId(id) {
  const match = PRESTIGE_ID_RE.exec(id);
  if (match) return { baseId: match[1], level: Number(match[2]) };
  return { baseId: id, level: 0 };
}

// `char` defaults to the current player but any character object works -- needed so a prestige or
// custom title equipped by (and living inside) one player's save can still be looked up correctly
// when a different client renders THAT player's badge (see displayBadgeMarkupFor in market.js).
function getItemDef(itemId, char = character) {
  if (GUN_ITEMS_BY_ID[itemId]) return GUN_ITEMS_BY_ID[itemId];
  if (MELEE_ITEMS_BY_ID[itemId]) return MELEE_ITEMS_BY_ID[itemId];
  if (AMMO_ITEMS_BY_ID[itemId]) return AMMO_ITEMS_BY_ID[itemId];
  if (DRUG_ITEMS_BY_ID[itemId]) return DRUG_ITEMS_BY_ID[itemId];
  if (WRESTLING_GEAR_ITEMS_BY_ID[itemId]) return WRESTLING_GEAR_ITEMS_BY_ID[itemId];
  if (ARMOR_ITEMS_BY_ID[itemId]) return ARMOR_ITEMS_BY_ID[itemId];

  // Checked before the plain prestige branch below since a graded PRESTIGED title's id wraps the
  // prestige id (`${baseId}_p2_nmg7`) -- the two regexes have disjoint literal markers (`_p` vs
  // `_nmg`) so trying this one first never misfires on a plain (non-graded) prestige id.
  const nmgMatch = NMG_ID_RE.exec(itemId);
  if (nmgMatch) {
    const [, baseId, gradeStr] = nmgMatch;
    const baseTitle = getItemDef(baseId, char);
    if (!baseTitle) return null;
    const grade = Number(gradeStr);
    const tier = NMG_GRADE_TIERS[grade];
    return {
      ...baseTitle,
      id: itemId,
      name: `${baseTitle.name} NMG ${grade}`,
      how: `${baseTitle.how} (New Milos Graded: ${tier.label} ${grade}.)`,
      type: 'title',
      nonEquippable: true,
      nmgGrade: grade,
      nmgBaseId: baseId,
    };
  }

  // Foil: base art plus a shimmer overlay. `cssClass` keeps the base title's art class and gains
  // the generic `title-foil` class alongside it (the shimmer is a ::after sweep layered over
  // whatever art is underneath -- see style.css), so no per-title foil art is ever needed. Ordering
  // versus the prestige/NMG branches above is not load-bearing (the three id shapes are mutually
  // exclusive), but it must come before the plain-title lookup at the bottom, which would otherwise
  // fail to resolve a foil id and return null everywhere.
  const foilMatch = FOIL_ID_RE.exec(itemId);
  if (foilMatch) {
    const baseId = foilMatch[1];
    const baseTitle = allTitleDefsFor(char).find((t) => t.id === baseId);
    if (!baseTitle) return null;
    return {
      ...baseTitle,
      id: itemId,
      name: `Foil ${baseTitle.name}`,
      cssClass: `${baseTitle.cssClass || ''} title-foil`.trim(),
      how: `${baseTitle.how} (Foil Ascension: forged from ${FOIL_ASCENSION_COPIES} copies.)`,
      type: 'title',
      foil: true,
      foilBaseId: baseId,
    };
  }

  // Leems Larudo x GOOD: prestiging swaps the art (cssClass) instead of appending a roman numeral
  // to the name -- checked before the generic branch below, same disjoint-marker reasoning as the
  // NMG branch above (both match the same `_p\d+` id shape, so this one must run first). Only
  // intercepts levels that actually have designed art (LLG_MAX_PRESTIGE); prestiging past that
  // falls through to the generic roman-numeral branch as a safe default rather than reusing stale art.
  const llgPrestigeMatch = PRESTIGE_ID_RE.exec(itemId);
  if (llgPrestigeMatch && LLG_MAX_PRESTIGE[llgPrestigeMatch[1]] >= Number(llgPrestigeMatch[2])) {
    const [, baseId, levelStr] = llgPrestigeMatch;
    const baseTitle = allTitleDefsFor(char).find((t) => t.id === baseId);
    if (!baseTitle) return null;
    const level = Number(levelStr);
    return {
      ...baseTitle,
      id: itemId,
      cssClass: `${baseTitle.cssClass}-p${level}`,
      how: `${baseTitle.how} (Prestige ${toRoman(level)}.)`,
      type: 'title',
      prestigeLevel: level,
      prestigeBaseId: baseId,
    };
  }

  const prestigeMatch = PRESTIGE_ID_RE.exec(itemId);
  if (prestigeMatch) {
    const [, baseId, levelStr] = prestigeMatch;
    const baseTitle = allTitleDefsFor(char).find((t) => t.id === baseId);
    if (!baseTitle) return null;
    const level = Number(levelStr);
    const roman = toRoman(level);
    // hideNameOnBadge carries over via the spread below, so a prestiged Anima title still stays
    // blank on the badge chip itself -- the numeral only needs to be appended to the one real
    // `name` field now, no separate hidden-vs-visible branching needed.
    return {
      ...baseTitle,
      id: itemId,
      name: `${baseTitle.name} ${roman}`,
      how: `${baseTitle.how} (Prestige ${roman}.)`,
      type: 'title',
      prestigeLevel: level,
      prestigeBaseId: baseId,
    };
  }

  // VISIONS are NOT titles, despite being won from a crate the same way -- they're a full
  // app-reskin, their own cosmetic category entirely (see js/visions.js). Checked before the
  // generic title fallback below so `type` ends up 'vision', never force-overwritten to 'title'
  // the way that fallback always does -- this is what keeps a Vision out of the Switch Title
  // dropdown/Cosmetics tab (both filter on type === 'title') while still resolving correctly for
  // type-agnostic consumers (itemLabel, the MTN trade picker) that just need a name/id.
  const visionMatch = VISIONS_TITLES.find((v) => v.id === itemId);
  if (visionMatch) return { ...visionMatch, type: 'vision' };

  const title = allTitleDefsFor(char).find((t) => t.id === itemId);
  // Spread the full def (not just id/name/cssClass) so custom titles keep their background/
  // border/text color fields when rendered from an inventory stack (js/inventory.js Cosmetics tab).
  if (title) return { ...title, type: 'title' };
  return null;
}

// Used for any admin/user-supplied free text that ends up in innerHTML (e.g. a custom title's
// label) so it can't break out of the markup it's interpolated into.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addToInventory(itemId, qty) {
  const existing = character.inventory.find((i) => i.id === itemId);
  if (existing) existing.qty += qty;
  else character.inventory.push({ id: itemId, qty });
}

function removeFromInventory(itemId, qty) {
  const existing = character.inventory.find((i) => i.id === itemId);
  if (!existing) return;
  existing.qty -= qty;
  if (existing.qty <= 0) character.inventory = character.inventory.filter((i) => i.id !== itemId);
}

function inventoryQty(itemId) {
  const existing = character.inventory.find((i) => i.id === itemId);
  return existing ? existing.qty : 0;
}

let serverSyncTimer = null;
let serverSyncPending = false;
let inFlightCharacterSync = null;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(character));

  // Everything except Work still runs client-side, so push the resulting character to the
  // server (best-effort, debounced) after every save -- otherwise other players' views of you
  // (like the online roster's title badge) go stale the moment you do anything but Work.
  if (typeof getAuthToken === 'function' && getAuthToken()) {
    clearTimeout(serverSyncTimer);
    serverSyncPending = true;
    serverSyncTimer = setTimeout(flushCharacterSync, 1000);
  }
}

// Fires the debounced sync early instead of waiting out the rest of the 1s timer. apiRequest()
// awaits this before every other request (see js/api.js) -- that's what actually fixes the false
// "session conflicted" reports: a client-side-only edit (a custom title, a stat tweak) used to sit
// queued here for up to a second while whatever the player clicked *next* (Work, a bank deposit,
// any server-authoritative action) ran against the character still on file on the server -- which
// didn't have the queued edit yet -- and then overwrote the client's copy with that edit-less
// result the moment its response came back. Flushing first guarantees the queued edit always
// reaches the server, and is reflected in the DB, before any later action can read past it.
//
// inFlightCharacterSync exists for the same reason: without it, two apiRequest calls dispatched
// close together (a quick double-click, or two different buttons) can each see serverSyncPending
// flip to false the instant the FIRST one claims it, and the second would then fire its own
// request without ever actually waiting for that first sync's response to land -- reopening the
// exact same race on a shorter fuse. Every caller that arrives while a sync is in flight shares
// this one promise instead, and re-checks for a newer edit once it settles (save() can queue
// another one while the first request was already on the wire, which that request's own snapshot
// of `character` can't have included).
const syncConflictToast = document.getElementById('syncConflictToast');
const syncConflictToastText = document.getElementById('syncConflictToastText');
let syncConflictToastTimer = null;

// Non-blocking replacement for alert() -- a rapid-click race landing here mid-hustle used to pop a
// native alert() that halts the whole page (rendering, timers, everything) until dismissed, which
// read as the game freezing. This just posts the message and auto-dismisses.
function showSyncConflictToast(text) {
  syncConflictToastText.textContent = text;
  syncConflictToast.classList.remove('hidden');
  clearTimeout(syncConflictToastTimer);
  syncConflictToastTimer = setTimeout(() => syncConflictToast.classList.add('hidden'), 5000);
}

// Non-blocking stand-in for alert() on the rapid-clickable action paths. A native alert() halts the
// main thread outright -- no rendering, no setInterval ticks, no promise continuations -- until it
// is dismissed. Rapid clicking produces a burst of server rejections ("still on cooldown", "not
// enough Floydbucks"), and one blocking dialog per rejection stacks into a wall of modals that
// reads as the game freezing. Reuses the same toast element, and later messages simply replace
// earlier ones instead of queueing.
function notify(text) {
  if (!text) return;
  showSyncConflictToast(text);
}

let staleSyncRecoveryInFlight = false;

// Reloads authoritative state after the server rejected our sync as stale (a second tab/device
// saved a newer version) -- rather than silently clobbering it, which is the exact bug that once
// cost a player their FC and titles.
//
// CRITICAL: this must never be awaited from inside flushCharacterSync's own .catch. apiMe() goes
// through apiRequest('/me'), which does `await flushCharacterSync()`. While that catch handler is
// still running, `inFlightCharacterSync` is necessarily still set -- its .finally cannot have run
// yet, because the promise it's attached to is the very one this handler is settling. So
// flushCharacterSync would return `inFlightCharacterSync.then(...)`, a promise that can only
// settle once this handler finishes: the handler ends up waiting on itself.
//
// That circular await was the rapid-click freeze. It deadlocked permanently, and because
// `inFlightCharacterSync` then never cleared, EVERY subsequent apiRequest blocked on it too --
// every button, every poll -- so the whole game froze until a page reload. Rapid clicking was
// merely the trigger: concurrent requests desynchronize characterRev, which produces the 409 that
// enters this path. Recovery is now chained strictly after the gate is released (see below).
async function recoverFromStaleSync() {
  if (staleSyncRecoveryInFlight) return;
  staleSyncRecoveryInFlight = true;
  try {
    const fresh = await apiMe();
    character = fresh.character;
    if (typeof fresh.rev === 'number') characterRev = fresh.rev;
    renderAll();
    showSyncConflictToast("Your progress here conflicted with another tab/device and couldn't be saved, so this session was reloaded to the latest saved state.");
  } catch { /* best-effort */ } finally {
    staleSyncRecoveryInFlight = false;
  }
}

function flushCharacterSync() {
  if (inFlightCharacterSync) return inFlightCharacterSync.then(flushCharacterSync);
  if (!serverSyncPending) return Promise.resolve();
  clearTimeout(serverSyncTimer);
  serverSyncPending = false;
  // This catch stays SYNCHRONOUS and only records the conflict -- it must not await anything that
  // routes through apiRequest(), or it deadlocks against its own gate (see recoverFromStaleSync).
  let sawStaleSync = false;
  const attempt = apiSyncCharacter(character).catch((err) => {
    if (err && err.reason === 'stale_sync') sawStaleSync = true;
  });
  inFlightCharacterSync = attempt.finally(() => { inFlightCharacterSync = null; });
  // Chained on the post-.finally promise: the .finally callback (which clears the gate) is
  // guaranteed to run before this .then callback, so recoverFromStaleSync's apiMe() passes through
  // flushCharacterSync freely instead of blocking on a promise that is waiting for it.
  inFlightCharacterSync.then(() => { if (sawStaleSync) recoverFromStaleSync(); });
  return inFlightCharacterSync;
}

// The 1s debounce above means anything saved right before the tab closes or backgrounds (a crate
// win, a title purchase) never reaches the server -- a real report of this: a player's crate title
// vanished because it never made it past their own browser. A normal fetch can't be trusted to
// finish once the page starts unloading, so flush with sendBeacon instead (same fallback shape as
// /milos/leave: it can't set an Authorization header, so the token rides in the body). sendBeacon
// can't read a response, so a stale rev here just silently fails to save rather than clobbering --
// the reconciliation above only needs to happen on the normal (non-beacon) path.
function flushCharacterSyncBeacon() {
  if (!serverSyncPending) return;
  clearTimeout(serverSyncTimer);
  serverSyncPending = false;
  const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (!token || typeof character === 'undefined' || !character) return;
  navigator.sendBeacon(
    `${API_BASE}/character/sync`,
    new Blob([JSON.stringify({ character, token, expectedRev: characterRev })], { type: 'application/json' })
  );
}

// sendBeacon can't read its own response, so characterRev is never updated by a background flush
// -- it's still whatever it was right before the tab was hidden. On a phone, backgrounding the
// tab (switching apps, locking the screen) is routine, so this is the other big source of false
// "session conflicted" reports: the player comes back, makes another client-side-only edit, and
// the debounced sync above rejects it as stale purely because *our own* characterRev bookkeeping
// fell behind -- not because anything else actually changed. Re-checking the rev on resume (only
// the rev -- not blindly adopting the server's character, which would risk masking a real
// conflict from another tab/device) fixes the bookkeeping in the common case where nothing else
// touched this character while we were away, and falls back to the normal conflict handling
// (reload + alert) on the rare occasion something genuinely did.
// Plain JSON.stringify is sensitive to key insertion order, which can legitimately differ between
// the server's copy (parsed straight from the stored blob) and the client's (built up through
// load()'s migrations) even when every value is identical -- sorting keys before comparing avoids
// mistaking that for a real conflict.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function resyncRevAfterResume() {
  if (serverSyncPending) return; // an edit queued right on resume -- let the normal flush handle it.
  if (typeof getAuthToken !== 'function' || !getAuthToken()) return;
  try {
    const fresh = await apiMe();
    if (stableStringify(fresh.character) === stableStringify(character)) {
      characterRev = fresh.rev;
    } else {
      character = fresh.character;
      characterRev = fresh.rev;
      renderAll();
      alert("Your progress here conflicted with another tab/device and couldn't be saved, so this session was reloaded to the latest saved state.");
    }
  } catch { /* best-effort */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushCharacterSyncBeacon();
  else if (document.visibilityState === 'visible') resyncRevAfterResume();
});
window.addEventListener('pagehide', flushCharacterSyncBeacon);

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const loaded = JSON.parse(raw);
  if (loaded.chips === undefined) loaded.chips = 0;
  if (loaded.gym.steroidTier === undefined) loaded.gym.steroidTier = loaded.gym.steroidsActive ? 'standard' : null;
  delete loaded.gym.steroidsActive;
  if (loaded.alliance === undefined) loaded.alliance = 50;
  if (loaded.settings === undefined) loaded.settings = { hideMilosWarning: false };
  if (loaded.cooldowns.milos11 === undefined) loaded.cooldowns.milos11 = 0;
  if (loaded.cooldowns.guzman === undefined) loaded.cooldowns.guzman = 0;
  if (loaded.cooldowns.combat === undefined) loaded.cooldowns.combat = 0;
  if (loaded.titles === undefined) loaded.titles = { owned: [], equipped: null };
  if (loaded.marriage === undefined) loaded.marriage = { proposedTo: null, spouseName: null };
  if (loaded.licenses === undefined) loaded.licenses = { gunSafety: false, concealedPermit: false, concealedPendingUntil: 0 };
  if (loaded.inventory === undefined) loaded.inventory = [];
  if (loaded.equipment === undefined) {
    loaded.equipment = { helmet: null, chest: null, pants: null, feet: null, holsterL: null, holsterR: null, openCarry: null, melee: null };
  }
  if (loaded.equipment.melee === undefined) loaded.equipment.melee = null;
  if (loaded.weaponSkills === undefined) loaded.weaponSkills = { shooting: 0, draw: 0, magReload: 0 };
  if (loaded.cooldowns.rangeShoot === undefined) loaded.cooldowns.rangeShoot = 0;
  if (loaded.cooldowns.rangeDraw === undefined) loaded.cooldowns.rangeDraw = 0;
  if (loaded.cooldowns.rangeReload === undefined) loaded.cooldowns.rangeReload = 0;
  if (loaded.cooldowns.robbery === undefined) loaded.cooldowns.robbery = 0;
  if (loaded.bank === undefined) {
    loaded.bank = { tier: 0, balance: 0, hasCreditCard: false, creditBalance: 0, lastBillTs: Date.now() };
  }
  if (loaded.arrestRecord === undefined) loaded.arrestRecord = [];
  if (loaded.jobs === undefined) loaded.jobs = { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 }, pizzaPerkGranted: false };
  if (loaded.jobs.pizzaPerkGranted === undefined) loaded.jobs.pizzaPerkGranted = false;
  if (loaded.badJobs === undefined) loaded.badJobs = { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 } };
  if (loaded.drugDealer === undefined) loaded.drugDealer = { unitsSold: 0 };
  if (loaded.cooldowns.jobWork === undefined) loaded.cooldowns.jobWork = 0;
  if (loaded.cooldowns.jobSkill1 === undefined) loaded.cooldowns.jobSkill1 = 0;
  if (loaded.cooldowns.jobSkill2 === undefined) loaded.cooldowns.jobSkill2 = 0;
  if (loaded.cooldowns.jobSkill3 === undefined) loaded.cooldowns.jobSkill3 = 0;
  if (loaded.cooldowns.jobSkill4 === undefined) loaded.cooldowns.jobSkill4 = 0;
  if (loaded.cooldowns.badJobWork === undefined) loaded.cooldowns.badJobWork = 0;
  if (loaded.cooldowns.badJobSkill1 === undefined) loaded.cooldowns.badJobSkill1 = 0;
  if (loaded.cooldowns.badJobSkill2 === undefined) loaded.cooldowns.badJobSkill2 = 0;
  if (loaded.cooldowns.badJobSkill3 === undefined) loaded.cooldowns.badJobSkill3 = 0;
  if (loaded.cooldowns.badJobSkill4 === undefined) loaded.cooldowns.badJobSkill4 = 0;
  DEALER_TIERS.forEach((d) => {
    const key = `dealer_${d.id}`;
    if (loaded.cooldowns[key] === undefined) loaded.cooldowns[key] = 0;
  });
  CRIME_TIERS.forEach((t) => {
    const key = `crime_${t.id}`;
    if (loaded.cooldowns[key] === undefined) loaded.cooldowns[key] = 0;
  });
  if (loaded.cooldowns.communityService === undefined) loaded.cooldowns.communityService = 0;
  if (loaded.cooldowns.jailWorkout === undefined) loaded.cooldowns.jailWorkout = 0;
  if (loaded.cooldowns.jailFight === undefined) loaded.cooldowns.jailFight = 0;
  if (loaded.crimeRecord === undefined) loaded.crimeRecord = { streak: 0 };
  if (loaded.moralsCenter === undefined) loaded.moralsCenter = { choice: null, lastTickTs: Date.now() };
  if (loaded.mtnHistory === undefined) loaded.mtnHistory = [];
  if (loaded.variety === undefined) loaded.variety = 0;
  if (loaded.varietyTimeout === undefined) loaded.varietyTimeout = { until: 0 };
  if (loaded.enjoyed === undefined) loaded.enjoyed = { active: false, until: 0, byName: null };
  if (loaded.secumax === undefined) loaded.secumax = { tier: null, lastBillTs: Date.now(), robBlocksUsed: 0, enjoyBlocksUsed: 0, slimeBlocksUsed: 0 };
  if (loaded.badges === undefined) loaded.badges = { equipped: null };
  if (loaded.visions === undefined) loaded.visions = { equipped: null };
  return loaded;
}

// character defaults to the global `character` -- optional param so this can also label another
// player's alliance (e.g. the online roster) by passing their character object.
function allianceLabel(score, char = character) {
  if (char && char.variety >= 50) return '💀 Dirty Bad'; // forced display, per Variety's "Dangers" ladder -- doesn't touch the real alliance number
  for (const tier of ALLIANCE_TIERS) {
    if (score <= tier.max) return tier.label;
  }
  return 'Dirty Bad';
}

function allianceBuff() {
  character.alliance = clampStat(character.alliance - ALLIANCE_BUFF);
}

function allianceDebuff() {
  character.alliance = clampStat(character.alliance + ALLIANCE_DEBUFF);
}

function allianceDebuffMinor() {
  character.alliance = clampStat(character.alliance + ALLIANCE_DEBUFF_MINOR);
}

// Getting caught is a hard alignment hit -- straight to Bad or worse, not a gradual nudge.
function allianceForceBad() {
  character.alliance = clampStat(Math.max(character.alliance, GUZMAN_MIN_ALLIANCE));
}

// The stand-in "account id" until real multiplayer accounts exist -- MTN listings key off this.
function characterFullName() {
  return `${character.firstName} ${character.lastName}`;
}

function formatHeight(inches) {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return `${ft}'${inch}"`;
}

function looksTier(v) {
  if (v >= 90) return 'Gigachad';
  if (v >= 70) return 'Chad';
  if (v >= 50) return 'Chad-lite';
  if (v >= 30) return 'Decent';
  if (v >= 10) return 'Normie';
  return 'Subhuman';
}

function computeLevel(char = character) {
  const s = char.stats;
  const avg = (s.health + s.attack + s.speed + s.defense + s.looks) / 5;
  return Math.max(1, Math.floor(avg / 10));
}

function computeRank() {
  const s = character.stats;
  const allMax = [s.health, s.attack, s.speed, s.defense, s.looks].every((v) => v >= STAT_CAP);
  return allMax ? 'PEAK CIVILIAN' : 'CIVILIAN';
}

function newCharacter(firstName, lastName) {
  return {
    firstName,
    lastName,
    stats: { health: 10, attack: 10, speed: 10, defense: 10, looks: 10 },
    height: 65,
    fatGained: 0,
    muscleGained: 0,
    cash: 0,
    chips: 0,
    alliance: 50,
    cooldowns: {
      work: 0, slut: 0, crime: 0, combat: 0, rangeShoot: 0, rangeDraw: 0, rangeReload: 0, robbery: 0,
      jobWork: 0, jobSkill1: 0, jobSkill2: 0, jobSkill3: 0, jobSkill4: 0,
      badJobWork: 0, badJobSkill1: 0, badJobSkill2: 0, badJobSkill3: 0, badJobSkill4: 0,
      communityService: 0, jailWorkout: 0, jailFight: 0,
      ...Object.fromEntries(DEALER_TIERS.map((d) => [`dealer_${d.id}`, 0])),
      ...Object.fromEntries(CRIME_TIERS.map((t) => [`crime_${t.id}`, 0])),
    },
    gym: {
      steroidTier: null,
      roidJailClicksRemaining: 0,
      bodyScore: 0,
    },
    jail: { inJail: false, crime: null, yearsRemaining: 0, serving: false },
    settings: { hideMilosWarning: false },
    titles: { owned: [], equipped: null },
    badges: { equipped: null },
    visions: { equipped: null },
    marriage: { proposedTo: null, spouseName: null, spouseUserId: null },
    licenses: { gunSafety: false, concealedPermit: false, concealedPendingUntil: 0 },
    inventory: [],
    equipment: { helmet: null, chest: null, pants: null, feet: null, holsterL: null, holsterR: null, openCarry: null, melee: null, armor: null },
    weaponSkills: { shooting: 0, draw: 0, magReload: 0 },
    bank: { tier: 0, balance: 0, hasCreditCard: false, creditBalance: 0, lastBillTs: Date.now() },
    arrestRecord: [],
    jobs: { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 }, pizzaPerkGranted: false },
    badJobs: { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 } },
    drugDealer: { unitsSold: 0 },
    crimeRecord: { streak: 0 },
    variety: 0,
    varietyTimeout: { until: 0 },
    enjoyed: { active: false, until: 0, byName: null },
    secumax: { tier: null, lastBillTs: Date.now(), robBlocksUsed: 0, enjoyBlocksUsed: 0, slimeBlocksUsed: 0 },
    moralsCenter: { choice: null, lastTickTs: Date.now() },
    mtnHistory: [],
  };
}

// ---------- character creation ----------
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const createError = document.getElementById('createError');

document.getElementById('btnCreate').addEventListener('click', () => {
  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();

  if (!firstName || !lastName) {
    createError.textContent = 'First and last name are required.';
    return;
  }
  if (firstName.length > 10 || lastName.length > 10) {
    createError.textContent = 'Names must be 10 characters or fewer.';
    return;
  }
  createError.textContent = '';

  character = newCharacter(firstName, lastName);
  save();
  showGame();
});

// ---------- game screen ----------
const charNameEl = document.getElementById('charName');
const rankBadgeEl = document.getElementById('rankBadge');
const levelBadgeEl = document.getElementById('levelBadge');
const statHealthEl = document.getElementById('statHealth');
const statAttackEl = document.getElementById('statAttack');
const statSpeedEl = document.getElementById('statSpeed');
const statDefenseEl = document.getElementById('statDefense');
const statLooksEl = document.getElementById('statLooks');
const looksTierEl = document.getElementById('looksTier');
const statHeightEl = document.getElementById('statHeight');
const statWeightEl = document.getElementById('statWeight');
const cashEl = document.getElementById('cash');
const statAllianceEl = document.getElementById('statAlliance');
const casinoChipCounterEl = document.getElementById('casinoChipCounter');
const walletCashEl = document.getElementById('walletCash');
const walletChipsEl = document.getElementById('walletChips');

const navBtns = document.querySelectorAll('.nav-btn');
const sidebar = document.getElementById('sidebar');
const jailNavBtn = document.getElementById('jailNavBtn');
const pageStreets = document.getElementById('page-streets');
const pageMarket = document.getElementById('page-market');
const pageCasino = document.getElementById('page-casino');
const pageMilos = document.getElementById('page-milos');
const pageJail = document.getElementById('page-jail');
const pageLeaderboard = document.getElementById('page-leaderboard');
const characterSidePanel = document.getElementById('characterSidePanel');
const pageWiki = document.getElementById('page-wiki');
const pageUpdates = document.getElementById('page-updates');
const pageReport = document.getElementById('page-report');
const pageProfile = document.getElementById('page-profile');
const pageCurios = document.getElementById('page-curios');

const activityLog = document.getElementById('activityLog');

const jailCrimeEl = document.getElementById('jailCrime');
const jailYearsEl = document.getElementById('jailYears');
const lawyerCostEl = document.getElementById('lawyerCost');
const jailStatus = document.getElementById('jailStatus');
const jailProgressEl = document.getElementById('jailProgress');
const btnServe = document.getElementById('btnServe');
const btnStopServe = document.getElementById('btnStopServe');
const btnLawyer = document.getElementById('btnLawyer');

let serveInterval = null;
let serveElapsedMs = 0;

function showGame() {
  screenCreate.classList.add('hidden');
  screenGame.classList.remove('hidden');
  buildFoodGrid();
  buildMaxxGrid();
  buildTitleGrid();
  buildGunClubGrids();
  buildJailContrabandGrid();
  renderAll();
  switchPage('profile');

  if (character.jail.inJail) {
    goToJail(false, false);
    if (character.jail.serving) startServing(false);
  }
}

function renderAll() {
  renderServerBanners();
  renderSlimedGate();
  if (typeof renderEnjoyedGate === 'function') renderEnjoyedGate();
  if (!isGamePaused()) {
    processBankBilling();
    processMoralsCenter();
    syncPenitentiaryRecord();
    if (typeof processInvestorL2Billing === 'function') processInvestorL2Billing();
  }
  charNameEl.innerHTML = styledNameHtml(character, `${character.firstName} ${character.lastName}`);
  levelBadgeEl.textContent = `⭐ Lvl ${computeLevel()}`;

  const s = character.stats;
  // Meter fills for the four core stats -- purely presentational, driven off the same values as the
  // numbers beside them, so they can never disagree with the text.
  setStatMeter('meterHealth', s.health);
  setStatMeter('meterAttack', s.attack);
  setStatMeter('meterSpeed', s.speed);
  setStatMeter('meterDefense', s.defense);

  statHealthEl.textContent = round1(s.health);
  statAttackEl.textContent = round1(s.attack);
  statSpeedEl.textContent = round1(s.speed);
  statDefenseEl.textContent = round1(s.defense);
  statLooksEl.textContent = round1(s.looks);
  looksTierEl.textContent = `(${looksTier(s.looks)})`;
  statHeightEl.textContent = formatHeight(character.height);
  statWeightEl.textContent = `${round1(150 + character.fatGained + character.muscleGained)} lbs`;
  updateCashDisplays(character.cash);
  casinoChipCounterEl.textContent = formatChips(character.chips);
  walletChipsEl.textContent = formatChips(character.chips);
  statAllianceEl.textContent = allianceLabel(character.alliance);
  if (typeof renderVarietyStatus === 'function') renderVarietyStatus();
  if (typeof renderSecumaxStatus === 'function') renderSecumaxStatus();
  if (typeof applyOwnVisionTheme === 'function') applyOwnVisionTheme();
  if (typeof renderVisionsGrid === 'function') renderVisionsGrid();

  jailNavBtn.disabled = !character.jail.inJail;
  jailNavBtn.classList.toggle('hidden', !character.jail.inJail);
  navBtns.forEach((btn) => {
    if (btn.dataset.page === 'streets' || btn.dataset.page === 'market' || btn.dataset.page === 'casino' || btn.dataset.page === 'milos') {
      btn.disabled = character.jail.inJail;
    }
  });

  if (character.jail.inJail) {
    jailCrimeEl.textContent = character.jail.crime || 'Crime';
    jailYearsEl.textContent = character.jail.yearsRemaining;
    lawyerCostEl.textContent = character.jail.yearsRemaining * 150;
  }

  renderRankBadge();
  buildInventoryGrid();
  renderEquipmentBoard();
  renderSkillsTab();
  renderAlignmentTab();
  if (typeof renderInvestorL2 === 'function') renderInvestorL2();

  // These three blocks are each expensive (gun club/bank/city hall/jobs/dealer/crime/combat/morals
  // center/MTN/penitentiary under Milos alone add up to 10+ full innerHTML rebuilds) and scoped
  // entirely to one page's own DOM -- skip them while that page isn't the one on screen, since
  // renderAll() runs after nearly every action in the ENTIRE app, not just actions on that page.
  // switchPage() calls the same functions once on entry so the tab is never stale on arrival.
  if (!pageJail.classList.contains('hidden')) {
    renderArrestRecord();
  }
  if (!pageMarket.classList.contains('hidden')) {
    renderGym();
    buildFoodGrid();
  }
  if (!pageMilos.classList.contains('hidden')) {
    renderBank();
    renderMilos();
    renderCityHall();
    buildGunClubGrids();
    renderGunClub();
    buildRangeWeaponSelect();
    renderGunRange();
    renderLawBanner();
  }
}

function renderArrestRecord() {
  const listEl = document.getElementById('arrestRecordList');
  if (!listEl) return;
  if (character.arrestRecord.length === 0) {
    listEl.innerHTML = '<p class="arrest-record-empty">No arrests on record. Keep it that way.</p>';
    return;
  }
  listEl.innerHTML = [...character.arrestRecord].reverse().map((entry) => `
    <div class="arrest-record-row">
      <span>${entry.crime}</span>
      <span>${entry.years} year(s)</span>
      <span>${new Date(entry.ts).toLocaleString()}</span>
    </div>
  `).join('');
}

function setStatMeter(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = `${Math.max(0, Math.min(100, (value / STAT_CAP) * 100))}%`;
}

// ---------- cooldown sweep bars ----------
// Shared by market.js's and milos.js's 250ms tick loops. No new DOM nodes/timers -- the tick loop
// already recomputes `remaining` every 250ms for the disabled-state check, so it just also hands
// that same number here and a CSS custom property (--cd, 0..1) drives a linear-gradient sweep.
// Buttons disabled for other reasons (is-pending, jailed, paused, insufficient cash) never call
// this with remaining > 0, so they never get a sweep.
function setCooldownSweep(btn, remaining, totalMs) {
  if (!btn) return;
  const inCooldown = remaining > 0 && totalMs > 0;
  if (!inCooldown) {
    if (btn.classList.contains('cooldown-sweep')) {
      // Was mid-cooldown last tick and just cleared -- that's the ready moment, fire the pulse.
      btn.classList.remove('cooldown-sweep');
      btn.style.removeProperty('--cd');
      btn.classList.remove('cooldown-ready');
      void btn.offsetWidth; // reflow so re-adding the class retriggers the animation
      btn.classList.add('cooldown-ready');
      setTimeout(() => btn.classList.remove('cooldown-ready'), 300);
    }
    return;
  }
  const progress = Math.max(0, Math.min(1, 1 - remaining / totalMs));
  btn.style.setProperty('--cd', progress.toFixed(4));
  btn.classList.add('cooldown-sweep');
}

// Money/chips formatting. character.cash used to render as a bare `452310.55` in the sidebar and
// the wallet widget while every shop price in the game used toLocaleString() -- the most-read
// number in the game was the one hardest to read. Matches the convention already used in
// js/stockMarket.js.
function formatMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatChips(n) {
  return Math.floor(n || 0).toLocaleString();
}

// ---------- cash tick animation + floating deltas ----------
// renderAll() runs 1-2x per click and rewrites cashEl/walletCashEl every time, even when the value
// hasn't moved. moneyAnimState tracks the last *displayed* value per element (not per character) so
// we only animate real changes -- first render and repeated renderAll() calls with an unchanged
// value just snap the text, no tween, no floater.
const moneyAnimState = new WeakMap();
let lastRenderedCash = null;
const MAX_CASH_FLOATERS = 3;
const activeCashFloaters = [];

function animateMoneyElement(el, newValue, skipAnimation) {
  if (!el) return;
  const prev = moneyAnimState.get(el);
  if (!prev || skipAnimation) {
    el.textContent = formatMoney(newValue);
    moneyAnimState.set(el, { displayed: newValue, raf: null });
    return;
  }
  if (prev.raf) cancelAnimationFrame(prev.raf);
  const from = prev.displayed;
  if (from === newValue) {
    el.textContent = formatMoney(newValue);
    moneyAnimState.set(el, { displayed: newValue, raf: null });
    return;
  }
  const duration = 400;
  const start = performance.now();
  const delta = newValue - from;
  const state = { displayed: from, raf: null };
  moneyAnimState.set(el, state);
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const current = from + delta * eased;
    el.textContent = formatMoney(current);
    if (t < 1) {
      state.displayed = current;
      state.raf = requestAnimationFrame(step);
    } else {
      state.displayed = newValue;
      state.raf = null;
      el.textContent = formatMoney(newValue);
    }
  }
  state.raf = requestAnimationFrame(step);
}

// Small "+$240.00" / "-$1,500.00" tag that drifts up and fades near the wallet widget. Capped at
// MAX_CASH_FLOATERS concurrent so a ×5/×10 batch action doesn't spam the corner.
function spawnCashFloater(delta) {
  if (!delta || !walletCashEl) return;
  const container = walletCashEl.closest('.wallet-widget-item');
  if (!container) return;
  while (activeCashFloaters.length >= MAX_CASH_FLOATERS) {
    const oldest = activeCashFloaters.shift();
    clearTimeout(oldest.timer);
    if (oldest.el.parentNode) oldest.el.parentNode.removeChild(oldest.el);
  }
  const isGain = delta > 0;
  const floater = document.createElement('span');
  floater.className = `cash-floater ${isGain ? 'cash-floater-gain' : 'cash-floater-loss'}`;
  floater.textContent = `${isGain ? '+' : '-'}$${formatMoney(Math.abs(delta))}`;
  container.appendChild(floater);
  const entry = { el: floater, timer: null };
  entry.timer = setTimeout(() => {
    if (floater.parentNode) floater.parentNode.removeChild(floater);
    const idx = activeCashFloaters.indexOf(entry);
    if (idx !== -1) activeCashFloaters.splice(idx, 1);
  }, 900);
  activeCashFloaters.push(entry);
}

// Single entry point renderAll() uses to write the cash figure -- keeps the tween + floater in sync
// with the exact same read/write path renderAll() already relies on, instead of a parallel loop.
// prefersReducedMotion folds into the same `paused` gate the game-pause banner already uses: both
// mean "snap straight to the new value, skip the tween and the drifting +/- floater".
function updateCashDisplays(newCash) {
  const paused = (typeof isGamePaused === 'function' && isGamePaused()) || prefersReducedMotion;
  if (lastRenderedCash !== null && !paused) {
    const delta = newCash - lastRenderedCash;
    if (Math.abs(delta) > 0.001) {
      spawnCashFloater(delta);
    }
  }
  lastRenderedCash = newCash;
  animateMoneyElement(cashEl, newCash, paused);
  animateMoneyElement(walletCashEl, newCash, paused);
}

// Cached once (not re-read per call) -- gates the typewriter reveal here and the cash tween/
// floaters in updateCashDisplays()/spawnCashFloater() below.
const prefersReducedMotion = typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Single append point for every .log element in the game (activityLog, and every per-page log --
// bankLog, cryptoLog, milosLog, etc. -- all funnel through this one function). Two things live
// here so every log entry gets them for free instead of per call site: a dimmed HH:MM timestamp,
// and a one-time typewriter reveal on the entry that was JUST added (never on the other 29 that
// scroll up beneath it, and never at all under prefers-reduced-motion).
function logTo(el, text, cls) {
  const p = document.createElement('p');
  if (cls) p.classList.add(cls);

  const now = new Date();
  const ts = document.createElement('span');
  ts.className = 'log-ts';
  ts.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  p.appendChild(ts);

  // textContent, not innerHTML -- log messages can contain arbitrary player-facing text (item
  // names, other players' usernames) and must never be interpreted as markup.
  const msg = document.createElement('span');
  msg.className = 'log-text';
  msg.textContent = text;
  p.appendChild(msg);

  if (!prefersReducedMotion) {
    p.classList.add('log-entry-new');
    p.addEventListener('animationend', () => p.classList.remove('log-entry-new'), { once: true });
  }

  el.prepend(p);
  while (el.children.length > 30) {
    el.removeChild(el.lastChild);
  }
}

function logMessage(text, cls) {
  logTo(activityLog, text, cls);
}

// Real presence in New Milos City: a heartbeat while the tab is active, plus a leave call the
// moment you navigate away (and a sendBeacon fallback in clientAuth.js for tab close/crash).
const MILOS_HEARTBEAT_MS = 10000;
let milosHeartbeatInterval = null;
let onMilosPage = false;

function switchPage(pageName) {
  navBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageName));
  pageStreets.classList.toggle('hidden', pageName !== 'streets');
  pageMarket.classList.toggle('hidden', pageName !== 'market');
  pageCasino.classList.toggle('hidden', pageName !== 'casino');
  pageMilos.classList.toggle('hidden', pageName !== 'milos');
  pageJail.classList.toggle('hidden', pageName !== 'jail');
  pageLeaderboard.classList.toggle('hidden', pageName !== 'leaderboard');
  pageWiki.classList.toggle('hidden', pageName !== 'wiki');
  pageUpdates.classList.toggle('hidden', pageName !== 'updates');
  pageReport.classList.toggle('hidden', pageName !== 'report');
  pageProfile.classList.toggle('hidden', pageName !== 'profile');
  pageCurios.classList.toggle('hidden', pageName !== 'curios');

  // profileNavTargetUsername lets viewProfile(username) (js/profile.js) jump straight to someone
  // else's profile through this same switchPage() call, instead of always loading your own and
  // then immediately re-fetching -- set right before calling switchPage('profile'), consumed here.
  if (pageName === 'profile' && typeof loadProfile === 'function') {
    const target = profileNavTargetUsername || (typeof getMyUsername === 'function' ? getMyUsername() : null);
    profileNavTargetUsername = null;
    if (target) loadProfile(target);
  }

  // Always visible except on Milos, which already uses that column for Players Online -- showing
  // both there would cram three columns into the same row.
  characterSidePanel.classList.toggle('hidden', pageName === 'milos');

  if (typeof setLeaderboardTabVisible === 'function') setLeaderboardTabVisible(pageName === 'leaderboard');

  // renderAll() skips rebuilding Jail/Market/Milos's own content while that page isn't visible (see
  // renderAll() in this file), so each one gets refreshed once here on the way in -- otherwise a
  // tab you haven't looked at in a while would show stale content until your next action.
  if (pageName === 'jail') renderArrestRecord();
  if (pageName === 'market') { renderGym(); buildFoodGrid(); }
  if (pageName === 'milos') {
    renderBank();
    renderMilos();
    renderCityHall();
    buildGunClubGrids();
    renderGunClub();
    buildRangeWeaponSelect();
    renderGunRange();
    renderLawBanner();
  }

  if (pageName === 'milos') {
    onMilosPage = true;
    renderPlayerList();
    if (!character.settings.hideMilosWarning) {
      milosWarningModal.classList.remove('hidden');
    }
    apiMilosEnter().catch(() => {});
    if (!milosHeartbeatInterval) {
      milosHeartbeatInterval = setInterval(() => apiMilosEnter().catch(() => {}), MILOS_HEARTBEAT_MS);
    }
  } else {
    if (onMilosPage) apiMilosLeave().catch(() => {});
    onMilosPage = false;
    if (milosHeartbeatInterval) {
      clearInterval(milosHeartbeatInterval);
      milosHeartbeatInterval = null;
    }
    playerListEl.innerHTML = '';
  }
}

// Catches tab close/refresh/crash, which a normal fetch-based leave call can't reliably survive.
// sendBeacon can't set an Authorization header, so the token rides in the body instead -- see the
// matching fallback in mfmmoserver's /milos/leave route.
window.addEventListener('pagehide', () => {
  if (!onMilosPage) return;
  const token = getAuthToken();
  if (!token) return;
  navigator.sendBeacon(`${API_BASE}/milos/leave`, new Blob([JSON.stringify({ token })], { type: 'application/json' }));
});

// Mobile off-canvas drawer -- #sidebar itself becomes position:fixed and slides on/off screen
// under the 900px breakpoint (style.css); on desktop these classes are never applied so this is
// a no-op there. switchPage() itself is untouched -- this only closes the drawer after it runs.
const btnMobileNavToggle = document.getElementById('btnMobileNavToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

function closeMobileNavDrawer() {
  sidebar.classList.remove('sidebar-open');
  sidebarBackdrop.classList.remove('visible');
}

function openMobileNavDrawer() {
  sidebar.classList.add('sidebar-open');
  sidebarBackdrop.classList.add('visible');
}

if (btnMobileNavToggle) {
  btnMobileNavToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('sidebar-open')) {
      closeMobileNavDrawer();
    } else {
      openMobileNavDrawer();
    }
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeMobileNavDrawer);
}

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    switchPage(btn.dataset.page);
    closeMobileNavDrawer();
  });
});

// Global modal Escape/backdrop-close -- applies uniformly to all .modal-overlay elements since
// none of them wire their own dismissal beyond an explicit button. Modals representing an
// active session, a choice the player must make explicitly, or a result that's only actually
// applied to `character` when their OK button is clicked (duel/marriage prompts, a live duel in
// progress, the slime duel result, the first-visit Milos warning) opt out via
// [data-no-backdrop-close] so closing them any other way can't silently skip that.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((modal) => {
    if (!modal.hasAttribute('data-no-backdrop-close')) modal.classList.add('hidden');
  });
});

document.querySelectorAll('.modal-overlay').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return;
    if (modal.hasAttribute('data-no-backdrop-close')) return;
    modal.classList.add('hidden');
  });
});

