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
const DEFENSE_PER_LB = 1;
const SPEED_LOSS_PER_LB = 1;

const GYM_BURN_LBS = 0.5;
const GYM_COST = 20;
const GYM_LOOKS_GAIN = 0.5;
const GYM_SPEED_GAIN = 0.6; // > SPEED_LOSS_PER_LB * GYM_BURN_LBS (0.5), so a full cycle nets +speed
const STEROID_MULT = 3;
const ROID_JAIL_CHANCE = 0.4;
const ROID_JAIL_CLICKS = 5;
const ROID_ESCAPE_COST = GYM_COST * 4;

const ALLIANCE_BUFF = 2; // legal work nudges toward Holy Good
const ALLIANCE_DEBUFF = 4; // getting caught nudges toward Dirty Bad
const ALLIANCE_TIERS = [
  { max: 19, label: 'Holy Good' },
  { max: 39, label: 'Good' },
  { max: 59, label: 'Neutral' },
  { max: 79, label: 'Bad' },
  { max: 100, label: 'Dirty Bad' },
];

const GUZMAN_MIN_ALLIANCE = 60; // Bad Hustles (jobs, dealing, robbery) require Bad or worse

const GOOD_HUSTLE_MAX_ALLIANCE = 59; // Good Hustles allowed for Neutral or better, blocked for Bad
const COMBAT_GOOD_MAX_ALLIANCE = 39; // Combat: Good alignment (not Neutral) fights Gangsters/Thugs

const GOOD_HUSTLE_COOLDOWN_MS = 2000; // shared cooldown for job Work/Train clicks, good and bad
const GOOD_HUSTLE_MIN = 0.10;
const GOOD_HUSTLE_MAX = 0.50;

// Skill training is intentionally slow — 4 skills per job, each 0-100, ground out in tiny increments.
const JOB_SKILL_TRAIN_MIN = 0.02;
const JOB_SKILL_TRAIN_MAX = 0.06;
const JOB_WAGE_MAX_MULT = 3; // wage multiplier ranges from 1x (base rank) to 1+this (all 4 skills maxed)

const GOOD_JOBS = [
  {
    id: 'milos11',
    name: 'Milos11',
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
    name: "Pete'sza Delivery",
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
    name: 'Krogue Wrestler Gear',
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
    name: 'Getaway Driver',
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
    name: 'The Fence',
    desc: 'Move stolen goods for cash, no questions asked.',
    skills: [
      { key: 'skill1', label: 'Appraisal' },
      { key: 'skill2', label: 'Negotiation' },
      { key: 'skill3', label: 'Discretion' },
      { key: 'skill4', label: 'Contacts' },
    ],
  },
];

const BAD_JOB_MIN = 5;
const BAD_JOB_MAX = 25;
const BAD_JOB_BUST_BASE = 0.08; // bust chance at base rank (0 skill)
const BAD_JOB_BUST_MIN = 0.02; // bust chance at maxed-out skill
const BAD_JOB_JAIL_YEARS = 1;

const DRUG_ITEMS = [
  { id: 'drugWeed', name: 'Weed', type: 'drug', wholesaleCost: 20, sellMin: 30, sellMax: 50, jailYearsPerUnit: 0.2, riskBase: 0.05, riskPerUnit: 0.02 },
  { id: 'drugPills', name: 'Pills', type: 'drug', wholesaleCost: 60, sellMin: 90, sellMax: 140, jailYearsPerUnit: 0.5, riskBase: 0.12, riskPerUnit: 0.03 },
  { id: 'drugMeth', name: 'Meth', type: 'drug', wholesaleCost: 100, sellMin: 160, sellMax: 260, jailYearsPerUnit: 1.5, riskBase: 0.25, riskPerUnit: 0.05 },
  { id: 'drugCoke', name: 'Cocaine', type: 'drug', wholesaleCost: 150, sellMin: 220, sellMax: 320, jailYearsPerUnit: 1, riskBase: 0.2, riskPerUnit: 0.04 },
];
const DRUG_ITEMS_BY_ID = {};
DRUG_ITEMS.forEach((d) => { DRUG_ITEMS_BY_ID[d.id] = d; });

// Guzman is the street-level entry point: cheap product, marginal profit. Selling more units on
// the street raises your drug dealing rank and introduces higher-end dealers with better product.
const DEALER_TIERS = [
  { id: 'guzman', name: 'Guzman Nestor', drugId: 'drugWeed', unlockUnits: 0 },
  { id: 'esteban', name: 'Esteban Vico', drugId: 'drugPills', unlockUnits: 40 },
  { id: 'ramon', name: 'Ramon Castillo', drugId: 'drugMeth', unlockUnits: 100 },
  { id: 'dmitri', name: 'Dmitri Kovash', drugId: 'drugCoke', unlockUnits: 200 },
];
const DEALER_QUICK_MIN = 3;
const DEALER_QUICK_MAX = 12;
const DEALER_QUICK_COOLDOWN_MS = 15000;
const DEALER_QUICK_SUCCESS_CHANCE = 0.85;

const ROBBERY_COOLDOWN_MS = 10000;
const ROBBERY_MIN = 20;
const ROBBERY_MAX = 150;
const ROBBERY_JAIL_YEARS = 1;

const BANK_TIERS = [
  { name: 'New Milos Discovery', cardName: 'NMB Discovery', maxBalance: 5000, upgradeCost: 0 },
  { name: 'New Milos Bank Card', cardName: 'NMB Advantage Standard', maxBalance: 25000, upgradeCost: 10000 },
  { name: 'New Milos Phalanx', cardName: 'NMB Advantage Elevated', maxBalance: 100000, upgradeCost: 50000 },
  { name: 'New Milos Praetorian', cardName: 'NMB Endeavor Credit', maxBalance: 500000, upgradeCost: 250000 },
  { name: 'New Milos Caesar Titanum', cardName: 'NMB Ti Casear', maxBalance: 2000000, upgradeCost: 1000000 },
];
const BANK_CREDIT_LIMIT_PCT = 0.5;
const BANK_BILLING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BANK_DEFAULT_JAIL_YEARS = 2;

const COMBAT_COOLDOWN_MS = 5000;
const NPC_TYPES = {
  citizen: { name: 'Citizen', hp: 20, attack: 5, defense: 2, minReward: 15, maxReward: 50 },
  cop: { name: 'Cop', hp: 50, attack: 14, defense: 9, minReward: 50, maxReward: 130 },
  thug: { name: 'Thug', hp: 30, attack: 8, defense: 4, minReward: 35, maxReward: 90 },
  gangster: { name: 'Gangster', hp: 45, attack: 12, defense: 7, minReward: 70, maxReward: 170 },
};

const FOOD_ITEMS = [
  { id: 'pizza', name: 'Pizza Slice', cost: 1, calories: 285 },
  { id: 'calzone', name: 'Calzone', cost: 2, calories: 650 },
  { id: 'pizzamax', name: 'Pizzamax (Whole Pie)', cost: 10, calories: 2000 },
];

const MAXX_ITEMS = [
  { id: 'mewing', name: 'Mewing Course', cost: 500, looks: 1, desc: '+1 Looks' },
  { id: 'bonesmash', name: 'Bone Smashing Kit', cost: 1500, looks: 2, desc: '+2 Looks' },
  { id: 'hairline', name: 'Hair Transplant', cost: 2000, looks: 3, desc: '+3 Looks' },
  { id: 'jaw', name: 'Jawline Filler', cost: 3500, looks: 4, desc: '+4 Looks' },
  { id: 'canthal', name: 'Canthal Tilt Surgery', cost: 6000, looks: 6, desc: '+6 Looks' },
  { id: 'limblength', name: 'Limb Lengthening Surgery', cost: 10000, height: 1, speed: 1, desc: '+1" Height, +1 Speed' },
];

const TITLES = [
  { id: 'title10k', name: '$10k$', cost: 10000, cssClass: 'title-10k', how: 'Spend $10,000 in Cosmetixxx in Market.' },
  { id: 'title100k', name: '$100k$', cost: 100000, cssClass: 'title-100k', how: 'Spend $100,000 in Cosmetixxx in Market.' },
  { id: 'titleMillion', name: '$MILLION$', cost: 1000000, cssClass: 'title-million', how: 'Spend $1,000,000 in Cosmetixxx in Market.' },
];

const PEAK_TITLE = { id: 'peakCivilian', name: 'PEAK CIVILIAN', cssClass: 'title-peak', how: 'Max all 5 stats (Health, Attack, Speed, Defense, Looks) to 100.' };

const CAESAR_TI_TITLE = { id: 'caesarTi', name: 'CAESAR Ti', cssClass: 'title-caesarti', how: 'Unlock the New Milos Caesar Titanum bank tier.' };

const ADMIN_TITLE = { id: 'adminTitle', name: 'ADMIN', cssClass: 'title-admin', how: 'Granted by an admin.' };

const BETA_SPIN_COST = 5000;
const BETA_SPIN_TITLES = [
  { id: 'betaSpin2026', name: 'Beta 2026', cssClass: 'title-beta2026', weight: 50, how: 'Won from an OPEN BETA spin in Cosmetixxx (common).' },
  { id: 'betaSpin2k26', name: 'Beta 2k26', cssClass: 'title-beta2k26', weight: 30, how: 'Won from an OPEN BETA spin in Cosmetixxx (uncommon).' },
  { id: 'betaSpinTester', name: 'Beta Tester', cssClass: 'title-betatester', weight: 15, how: 'Won from an OPEN BETA spin in Cosmetixxx (rare).' },
  { id: 'betaSpinOpen', name: 'OPEN BETA', cssClass: 'title-openbeta', weight: 5, how: 'Won from an OPEN BETA spin in Cosmetixxx (exclusive!).' },
];

const GOOD_SEASON1_COST = 5000;
const GOOD_SEASON1_TITLES = [
  { id: 'gs1CommonA', name: 'GS1®', cssClass: 'title-gs1-common', weight: 30, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1CommonB', name: 'G®', cssClass: 'title-g-common', weight: 25, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (common).' },
  { id: 'gs1Uncommon', name: 'G®1', cssClass: 'title-g1-uncommon', weight: 25, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (uncommon).' },
  { id: 'gs1RareFull', name: 'GOOD® Season 1', cssClass: 'title-gs1-rare', weight: 8, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
  { id: 'gs1RareGewd', name: 'Gewd', cssClass: 'title-gewd-rare', weight: 8, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (super rare).' },
  { id: 'gs1Mythic', name: 'I\'m SOWWY', cssClass: 'title-sowwy-mythic', weight: 4, how: 'Won from a GOOD® Season 1 spin in Cosmetixxx (mythic!).' },
];

const RENAME_COST = 10000;

const PISTOL_ITEMS = [
  { id: 'glock19', name: 'Glock 19', type: 'pistol', caliber: '9mm', cost: 500 },
  { id: 'm9', name: 'Beretta M9', type: 'pistol', caliber: '9mm', cost: 650 },
];
const RIFLE_ITEMS = [
  { id: 'ar15', name: 'AR-15', type: 'rifle', caliber: '5.56', cost: 2500 },
  { id: 'm4', name: 'M4 Carbine', type: 'rifle', caliber: '5.56', cost: 3200 },
];
const GUN_ITEMS_BY_ID = {};
[...PISTOL_ITEMS, ...RIFLE_ITEMS].forEach((item) => { GUN_ITEMS_BY_ID[item.id] = item; });

const AMMO_ITEMS = [
  { id: 'ammo9mm', name: '9mm Ammo Box', type: 'ammo', caliber: '9mm', cost: 50 },
  { id: 'ammo556', name: '5.56 Ammo Box', type: 'ammo', caliber: '5.56', cost: 80 },
];
const AMMO_ITEMS_BY_ID = {};
AMMO_ITEMS.forEach((item) => { AMMO_ITEMS_BY_ID[item.id] = item; });

const CONCEALED_APPLY_COST = 2000;
const CONCEALED_WAIT_MS = 10 * 60 * 1000;
const JAIL_YEARS_WEAPON = 20;
const RANGE_COOLDOWN_MS = 3000;

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
  return Math.max(0, Math.min(STAT_CAP, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function getItemDef(itemId) {
  if (GUN_ITEMS_BY_ID[itemId]) return GUN_ITEMS_BY_ID[itemId];
  if (AMMO_ITEMS_BY_ID[itemId]) return AMMO_ITEMS_BY_ID[itemId];
  if (DRUG_ITEMS_BY_ID[itemId]) return DRUG_ITEMS_BY_ID[itemId];
  const title = allTitleDefs().find((t) => t.id === itemId);
  if (title) return { id: title.id, name: title.name, type: 'title', cssClass: title.cssClass };
  return null;
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

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(character));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const loaded = JSON.parse(raw);
  if (loaded.chips === undefined) loaded.chips = 0;
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
    loaded.equipment = { helmet: null, chest: null, pants: null, feet: null, holsterL: null, holsterR: null, openCarry: null };
  }
  if (loaded.weaponSkills === undefined) loaded.weaponSkills = { shooting: 0, draw: 0, magReload: 0 };
  if (loaded.cooldowns.rangeShoot === undefined) loaded.cooldowns.rangeShoot = 0;
  if (loaded.cooldowns.rangeDraw === undefined) loaded.cooldowns.rangeDraw = 0;
  if (loaded.cooldowns.rangeReload === undefined) loaded.cooldowns.rangeReload = 0;
  if (loaded.cooldowns.robbery === undefined) loaded.cooldowns.robbery = 0;
  if (loaded.bank === undefined) {
    loaded.bank = { tier: 0, balance: 0, hasCreditCard: false, creditBalance: 0, lastBillTs: Date.now() };
  }
  if (loaded.arrestRecord === undefined) loaded.arrestRecord = [];
  if (loaded.jobs === undefined) loaded.jobs = { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 } };
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
    weightGained: 0,
    cash: 0,
    chips: 0,
    alliance: 50,
    cooldowns: {
      work: 0, slut: 0, crime: 0, combat: 0, rangeShoot: 0, rangeDraw: 0, rangeReload: 0, robbery: 0,
      jobWork: 0, jobSkill1: 0, jobSkill2: 0, jobSkill3: 0, jobSkill4: 0,
      badJobWork: 0, badJobSkill1: 0, badJobSkill2: 0, badJobSkill3: 0, badJobSkill4: 0,
      ...Object.fromEntries(DEALER_TIERS.map((d) => [`dealer_${d.id}`, 0])),
    },
    gym: { steroidsActive: false, roidJailClicksRemaining: 0 },
    jail: { inJail: false, crime: null, yearsRemaining: 0, serving: false },
    settings: { hideMilosWarning: false },
    titles: { owned: [], equipped: null },
    marriage: { proposedTo: null, spouseName: null },
    licenses: { gunSafety: false, concealedPermit: false, concealedPendingUntil: 0 },
    inventory: [],
    equipment: { helmet: null, chest: null, pants: null, feet: null, holsterL: null, holsterR: null, openCarry: null },
    weaponSkills: { shooting: 0, draw: 0, magReload: 0 },
    bank: { tier: 0, balance: 0, hasCreditCard: false, creditBalance: 0, lastBillTs: Date.now() },
    arrestRecord: [],
    jobs: { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 } },
    badJobs: { currentJob: null, skills: { skill1: 0, skill2: 0, skill3: 0, skill4: 0 } },
    drugDealer: { unitsSold: 0 },
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
const pageInventory = document.getElementById('page-inventory');
const pageJail = document.getElementById('page-jail');
const pageWiki = document.getElementById('page-wiki');

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
  renderAll();

  if (character.jail.inJail) {
    goToJail(false, false);
    if (character.jail.serving) startServing(false);
  }
}

function renderAll() {
  processBankBilling();
  charNameEl.textContent = `${character.firstName} ${character.lastName}`;
  levelBadgeEl.textContent = `Lvl ${computeLevel()}`;

  const s = character.stats;
  statHealthEl.textContent = round1(s.health);
  statAttackEl.textContent = round1(s.attack);
  statSpeedEl.textContent = round1(s.speed);
  statDefenseEl.textContent = round1(s.defense);
  statLooksEl.textContent = round1(s.looks);
  looksTierEl.textContent = `(${looksTier(s.looks)})`;
  statHeightEl.textContent = formatHeight(character.height);
  statWeightEl.textContent = `${round1(150 + character.weightGained)} lbs`;
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
  renderBank();
  renderMilos();
  renderRankBadge();
  renderCityHall();
  renderGunClub();
  buildRangeWeaponSelect();
  renderGunRange();
  buildInventoryGrid();
  renderEquipmentBoard();
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

function switchPage(pageName) {
  navBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageName));
  pageStreets.classList.toggle('hidden', pageName !== 'streets');
  pageMarket.classList.toggle('hidden', pageName !== 'market');
  pageCasino.classList.toggle('hidden', pageName !== 'casino');
  pageMilos.classList.toggle('hidden', pageName !== 'milos');
  pageInventory.classList.toggle('hidden', pageName !== 'inventory');
  pageJail.classList.toggle('hidden', pageName !== 'jail');
  pageWiki.classList.toggle('hidden', pageName !== 'wiki');

  if (pageName === 'milos') {
    renderPlayerList();
    if (!character.settings.hideMilosWarning) {
      milosWarningModal.classList.remove('hidden');
    }
  } else {
    playerListEl.innerHTML = '';
  }
}

navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    switchPage(btn.dataset.page);
  });
});

