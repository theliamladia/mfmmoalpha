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

// Looks is a derived stat: 90% Body (5 body parts x 4 exercises each, 0-100) + 10% Face (Maxx items).
const BODY_PARTS = ['chest', 'arms', 'legs', 'abs', 'back'];
const BODY_PART_LABELS = { chest: '🫁 Chest', arms: '💪 Arms', legs: '🦵 Legs', abs: '🍫 Abs', back: '🔙 Back' };
const BODY_EXERCISE_KEYS = ['ex1', 'ex2', 'ex3', 'ex4'];
const BODY_EXERCISE_LABELS = {
  chest: ['Bench Press', 'Push-ups', 'Dips', 'Flyes'],
  arms: ['Curls', 'Tricep Extensions', 'Hammer Curls', 'Skull Crushers'],
  legs: ['Squats', 'Lunges', 'Leg Press', 'Calf Raises'],
  abs: ['Crunches', 'Planks', 'Leg Raises', 'Russian Twists'],
  back: ['Deadlifts', 'Pull-ups', 'Rows', 'Lat Pulldowns'],
};
const BODY_EXERCISE_COOLDOWN_MS = 8000;
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
// Pay ranges are 10% above their original values (Drugs & Rugs balance pass -- Good Hustle pay up).
// Must match JOB_RANKS in mfmmoserver/gameLogic.js exactly -- this copy only drives the client's
// pay-range preview, the server computes the actual payout.
const JOB_RANKS = [
  { minAvg: 0, title: 'Trainee', payMin: 0.11, payMax: 0.55, cooldownMs: 2000 },
  { minAvg: 15, title: 'Associate', payMin: 0.22, payMax: 0.83, cooldownMs: 1800 },
  { minAvg: 35, title: 'Senior Associate', payMin: 0.44, payMax: 1.21, cooldownMs: 1600 },
  { minAvg: 55, title: 'Supervisor', payMin: 0.77, payMax: 1.98, cooldownMs: 1400 },
  { minAvg: 75, title: 'Manager', payMin: 1.27, payMax: 3.03, cooldownMs: 1200 },
  { minAvg: 95, title: 'Regional Manager', payMin: 1.98, payMax: 4.40, cooldownMs: 1000 },
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

const DRUG_ITEMS = [
  { id: 'drugWeed', name: '🌿 Weed', type: 'drug', wholesaleCost: 20, sellMin: 30, sellMax: 50, jailYearsPerUnit: 0.2, riskBase: 0.05, riskPerUnit: 0.02 },
  { id: 'drugPills', name: '💊 Pills', type: 'drug', wholesaleCost: 60, sellMin: 90, sellMax: 140, jailYearsPerUnit: 0.5, riskBase: 0.12, riskPerUnit: 0.03 },
  { id: 'drugMeth', name: '🧪 Meth', type: 'drug', wholesaleCost: 100, sellMin: 160, sellMax: 260, jailYearsPerUnit: 1.5, riskBase: 0.25, riskPerUnit: 0.05 },
  { id: 'drugCoke', name: '❄️ Cocaine', type: 'drug', wholesaleCost: 150, sellMin: 220, sellMax: 320, jailYearsPerUnit: 1, riskBase: 0.2, riskPerUnit: 0.04 },
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
  { id: 'grandtheft', name: '🚗 Grand Theft Auto', desc: 'Boost a car off the street and flip it.', minReward: 3200, maxReward: 4800, jailYears: 10, baseRisk: 0.6 },
];
const CRIME_COOLDOWN_MS = 12000;
const CRIME_RISK_MIN = 0.05;
const CRIME_STAT_MITIGATION = 0.5; // max reduction to a tier's baseRisk from Attack/Speed at 100/100
const CRIME_STREAK_MAX = 12; // cap on how much a record can escalate a sentence
const COMMUNITY_SERVICE_COOLDOWN_MS = 60000;
const COMMUNITY_SERVICE_BASE_COST = 750; // scales with current streak
const COMMUNITY_SERVICE_STREAK_REDUCTION = 4;

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
  { id: 'betaSpin2026', name: 'Beta 2026', cssClass: 'title-beta2026', weight: 50, how: 'Won from an OPEN BETA spin in Cosmetixxx (common).' },
  { id: 'betaSpin2k26', name: 'Beta 2k26', cssClass: 'title-beta2k26', weight: 30, how: 'Won from an OPEN BETA spin in Cosmetixxx (uncommon).' },
  { id: 'betaSpinTester', name: 'Beta Tester', cssClass: 'title-betatester', weight: 15, how: 'Won from an OPEN BETA spin in Cosmetixxx (rare).' },
  { id: 'betaSpinOpen', name: 'OPEN BETA', cssClass: 'title-openbeta', weight: 5, how: 'Won from an OPEN BETA spin in Cosmetixxx (exclusive!).' },
];

const GOOD_SEASON1_COST = 10000;
const GOOD_SEASON1_TITLES = [
  { id: 'gs1CommonA', name: 'GS1®', cssClass: 'title-gs1-common', weight: 30, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1CommonB', name: 'G®', cssClass: 'title-g-common', weight: 25, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1Uncommon', name: 'G®1', cssClass: 'title-g1-uncommon', weight: 25, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (uncommon).' },
  { id: 'gs1RareFull', name: 'GOOD® Season 1', cssClass: 'title-gs1-rare', weight: 8, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
  { id: 'gs1RareGewd', name: 'Gewd', cssClass: 'title-gewd-rare', weight: 8, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
  { id: 'gs1Mythic', name: 'I\'m SOWWY', cssClass: 'title-sowwy-mythic', weight: 4, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (mythic!).' },
  { id: 'gs1Common2', name: 'G Wagon®', cssClass: 'title-gwagon-common', weight: 20, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1RareBless', name: 'GOD IS GOOD®', cssClass: 'title-godisgood-rare', weight: 6, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
];

// Anima Crate: every item's real name is hidden (invisible LTR-mark characters over the splash
// art), including the Mega Hyper Rare tier -- only the rainbow-gradient border/name-recolor perk
// marks it as special, the badge label itself stays blank like every other tier.
const ANIMA_HIDDEN_NAME = '<span style="color:transparent;">&#8206; &#8206; &#8206; &#8206; &#8206;</span>';

// displayName is the real character name -- never shown on the badge itself (that stays blank
// per the mystery-pull convention), only used for plain-text listings where a blank label would
// be confusing: the Inventory/Cosmetics tab, the Trade dropdown, MTN listings, admin lookups, and
// the "you won X" crate-result toast. See itemLabel() below.
const ANIMA_CRATE_COST = 4500;
const ANIMA_CRATE_TITLES = [
  { id: 'animaCommonGoku', name: ANIMA_HIDDEN_NAME, displayName: 'Goku', cssClass: 'title-anima-common-goku', weight: 31.67, how: 'Won from an Anima Crate spin (common).' },
  { id: 'animaCommonZoro', name: ANIMA_HIDDEN_NAME, displayName: 'Zoro', cssClass: 'title-anima-common-zoro', weight: 31.67, how: 'Won from an Anima Crate spin (common).' },
  { id: 'animaCommonHatsune', name: ANIMA_HIDDEN_NAME, displayName: 'Hatsune', cssClass: 'title-anima-common-hatsune', weight: 31.66, how: 'Won from an Anima Crate spin (common).' },
  { id: 'animaRareYujiro', name: ANIMA_HIDDEN_NAME, displayName: 'Yujiro', cssClass: 'title-anima-rare-yujiro', weight: 1.5, how: 'Won from an Anima Crate spin (Anima Rare).' },
  { id: 'animaRareCreator', name: ANIMA_HIDDEN_NAME, displayName: 'The Creator', cssClass: 'title-anima-rare-creator', weight: 1.5, how: 'Won from an Anima Crate spin (Anima Rare).' },
  { id: 'animaRareJinwoo', name: ANIMA_HIDDEN_NAME, displayName: 'Jinwoo Mog', cssClass: 'title-anima-rare-jinwoo', weight: 1.5, how: 'Won from an Anima Crate spin (Anima Rare).' },
  { id: 'animaMegaKirito', name: ANIMA_HIDDEN_NAME, displayName: 'Kirito', cssClass: 'title-anima-mega-kirito', weight: 0.075, how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  { id: 'animaMegaItachi', name: ANIMA_HIDDEN_NAME, displayName: 'Itachi', cssClass: 'title-anima-mega-itachi', weight: 0.075, how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  { id: 'animaMegaGodGoku', name: ANIMA_HIDDEN_NAME, displayName: 'God Goku', cssClass: 'title-anima-mega-godgoku', weight: 0.075, how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  { id: 'animaMegaLuffy', name: ANIMA_HIDDEN_NAME, displayName: 'Luffy', cssClass: 'title-anima-mega-luffy', weight: 0.075, how: 'Won from an Anima Crate spin (Anima Mega Rare).' },
  // Once equipped, also recolors the player's actual display name with a rainbow gradient
  // everywhere it renders -- see js/nameStyle.js.
  { id: 'animaHyperGear5', name: ANIMA_HIDDEN_NAME, displayName: 'Gear 5 Luffy', cssClass: 'title-anima-hyper-gear5', weight: 0.05, how: 'Won from an Anima Crate spin (Anima Mega Hyper Rare!). Recolors your name everywhere with a rainbow gradient while equipped.' },
  { id: 'animaHyperMakima', name: ANIMA_HIDDEN_NAME, displayName: 'Makima', cssClass: 'title-anima-hyper-makima', weight: 0.05, how: 'Won from an Anima Crate spin (Anima Mega Hyper Rare!). Recolors your name everywhere with a rainbow gradient while equipped.' },
];

// Counterfinish Crate: skins/finishes, not characters -- item label text is always visible.
const COUNTERFINISH_CRATE_COST = 3000;
const COUNTERFINISH_CRATE_TITLES = [
  { id: 'cfSafari', name: 'Safari', cssClass: 'title-cf-safari', weight: 15, how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfTiger', name: 'Tiger', cssClass: 'title-cf-tiger', weight: 15, how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfTronic', name: 'Tronic', cssClass: 'title-cf-tronic', weight: 15, how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfFree', name: 'Free', cssClass: 'title-cf-free', weight: 15, how: 'Won from a Counterfinish Crate spin (common).' },
  { id: 'cfLore', name: 'Lore', cssClass: 'title-cf-lore', weight: 15, how: 'Won from a Counterfinish Crate spin (rare).' },
  { id: 'cfHowl', name: 'Howl', cssClass: 'title-cf-howl', weight: 15, how: 'Won from a Counterfinish Crate spin (rare).' },
  { id: 'cfFade', name: 'Fade', cssClass: 'title-cf-fade', weight: 15, how: 'Won from a Counterfinish Crate spin (rare).' },
  { id: 'cfSapphire', name: 'Sapphire', cssClass: 'title-cf-sapphire', weight: 1.5, how: 'Won from a Counterfinish Crate spin (Gem).' },
  { id: 'cfRuby', name: 'Ruby', cssClass: 'title-cf-ruby', weight: 1.5, how: 'Won from a Counterfinish Crate spin (Gem).' },
  { id: 'cfEmerald', name: 'Emerald', cssClass: 'title-cf-emerald', weight: 1.5, how: 'Won from a Counterfinish Crate spin (Gem).' },
  // Hyper Gems: item label always reads "HYPER" (neutral white glow) -- the gem-colored,
  // cursive-font name recolor is a separate equipped perk, see js/nameStyle.js.
  { id: 'cfHyperSapphire', name: 'HYPER', cssClass: 'title-cf-hyper-sapphire', weight: 0.17, how: 'Won from a Counterfinish Crate spin (Hyper Gem!). Recolors your name everywhere in Sapphire blue with a cursive font while equipped.' },
  { id: 'cfHyperRuby', name: 'HYPER', cssClass: 'title-cf-hyper-ruby', weight: 0.17, how: 'Won from a Counterfinish Crate spin (Hyper Gem!). Recolors your name everywhere in Ruby red with a cursive font while equipped.' },
  { id: 'cfHyperEmerald', name: 'HYPER', cssClass: 'title-cf-hyper-emerald', weight: 0.16, how: 'Won from a Counterfinish Crate spin (Hyper Gem!). Recolors your name everywhere in Emerald green with a cursive font while equipped.' },
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
// MTN listings, admin lookups, crate-result toasts). Falls back to `name` for every item type
// except the Anima Crate's hidden-name titles, which need their real `displayName` here instead
// -- `name` there is invisible-span markup meant only for the badge, and would otherwise render
// as literal blank/garbled text in a plain-text context.
function itemLabel(item) {
  return item.displayName || item.name;
}

function getItemDef(itemId) {
  if (GUN_ITEMS_BY_ID[itemId]) return GUN_ITEMS_BY_ID[itemId];
  if (MELEE_ITEMS_BY_ID[itemId]) return MELEE_ITEMS_BY_ID[itemId];
  if (AMMO_ITEMS_BY_ID[itemId]) return AMMO_ITEMS_BY_ID[itemId];
  if (DRUG_ITEMS_BY_ID[itemId]) return DRUG_ITEMS_BY_ID[itemId];
  if (WRESTLING_GEAR_ITEMS_BY_ID[itemId]) return WRESTLING_GEAR_ITEMS_BY_ID[itemId];
  if (ARMOR_ITEMS_BY_ID[itemId]) return ARMOR_ITEMS_BY_ID[itemId];
  const title = allTitleDefs().find((t) => t.id === itemId);
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

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(character));

  // Everything except Work still runs client-side, so push the resulting character to the
  // server (best-effort, debounced) after every save -- otherwise other players' views of you
  // (like the online roster's title badge) go stale the moment you do anything but Work.
  if (typeof getAuthToken === 'function' && getAuthToken()) {
    clearTimeout(serverSyncTimer);
    serverSyncTimer = setTimeout(() => {
      apiSyncCharacter(character).catch(() => {});
    }, 1000);
  }
}

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
  return loaded;
}

function allianceLabel(score) {
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

function computeLevel() {
  const s = character.stats;
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
      bodyExercises: Object.fromEntries(BODY_PARTS.map((part) => [part, { ex1: 0, ex2: 0, ex3: 0, ex4: 0 }])),
    },
    jail: { inJail: false, crime: null, yearsRemaining: 0, serving: false },
    settings: { hideMilosWarning: false },
    titles: { owned: [], equipped: null },
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

const navBtns = document.querySelectorAll('.nav-btn');
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

  if (character.jail.inJail) {
    goToJail(false, false);
    if (character.jail.serving) startServing(false);
  }
}

function renderAll() {
  renderServerBanners();
  if (!isGamePaused()) {
    processBankBilling();
    processMoralsCenter();
    syncPenitentiaryRecord();
  }
  charNameEl.textContent = `${character.firstName} ${character.lastName}`;
  levelBadgeEl.textContent = `⭐ Lvl ${computeLevel()}`;

  const s = character.stats;
  statHealthEl.textContent = round1(s.health);
  statAttackEl.textContent = round1(s.attack);
  statSpeedEl.textContent = round1(s.speed);
  statDefenseEl.textContent = round1(s.defense);
  statLooksEl.textContent = round1(s.looks);
  looksTierEl.textContent = `(${looksTier(s.looks)})`;
  statHeightEl.textContent = formatHeight(character.height);
  statWeightEl.textContent = `${round1(150 + character.fatGained + character.muscleGained)} lbs`;
  cashEl.textContent = character.cash.toFixed(2);
  casinoChipCounterEl.textContent = Math.floor(character.chips);
  statAllianceEl.textContent = allianceLabel(character.alliance);

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

  renderArrestRecord();
  renderGym();
  renderBody();
  buildFoodGrid();
  renderBank();
  renderMilos();
  renderRankBadge();
  renderCityHall();
  buildGunClubGrids();
  renderGunClub();
  buildRangeWeaponSelect();
  renderGunRange();
  buildInventoryGrid();
  renderEquipmentBoard();
  renderSkillsTab();
  renderAlignmentTab();
  renderLawBanner();
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

function logTo(el, text, cls) {
  const p = document.createElement('p');
  p.textContent = text;
  if (cls) p.classList.add(cls);
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

  // Always visible except on Milos, which already uses that column for Players Online -- showing
  // both there would cram three columns into the same row.
  characterSidePanel.classList.toggle('hidden', pageName === 'milos');

  if (typeof setLeaderboardTabVisible === 'function') setLeaderboardTabVisible(pageName === 'leaderboard');

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

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    switchPage(btn.dataset.page);
  });
});

