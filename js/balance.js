// ---------------------------------------------------------------------------
// BALANCE — every gameplay-tunable number that lives in a function body
// (rather than in RESOURCES/RECIPES/RARITY/SITES, which are already
// content-data and stay untouched). Values are copied verbatim from the
// prior hardcoded literals; nothing here changes game balance.
// TICK_MS is kept separate: it's an engine timing constant, not a balance
// knob (see tickLoop's use of TICKS_PER_SECOND below, which preserves the
// existing rate/10 and -0.1 relationships bit-for-bit).
// ---------------------------------------------------------------------------
const TICK_MS = 100;
const TICKS_PER_SECOND = 1000/TICK_MS; // exactly 10 — used to derive per-tick fractions bit-identically to the prior /10 and -0.1 literals
const BALANCE = {
  prestige: {
    MULTIPLIER_PER_POINT: 0.15, // mult(): permanent multiplier gained per prestige point
    GOLD_DIVISOR: 200,          // prestigeGain(): floor(sqrt(runGold / GOLD_DIVISOR))
  },
  hq: {
    MULTIPLIER_PER_LEVEL: 0.08, // hqMult(): run-scoped multiplier gained per HQ level
    COST_BASE: 150,             // hqCost(): base cost of HQ level 0
    COST_GROWTH: 1.6,           // hqCost(): cost growth factor per level
  },
  mining: {
    WORKFORCE_BONUS_MULTIPLIER: 1.5, // autoRate(): auto-mining bonus per workforce level
    FACILITY_COST_BASE: 20,          // facilityCost(): base cost of facility level 0
    FACILITY_COST_GROWTH: 1.4,       // facilityCost(): cost growth factor per level
    FACILITY_BONUS_PER_LEVEL: 1,     // manual-yield bonus added per facility level purchased
    WORKFORCE_COST_BASE: 15,         // workforceCost(): base cost of workforce level 0
    WORKFORCE_COST_GROWTH: 1.35,     // workforceCost(): cost growth factor per level
    WORKFORCE_BONUS_PER_LEVEL: 1,    // auto-mining bonus added per workforce level purchased
  },
  worker: {
    EFFECTIVE_DIVISOR: 16,       // workerEffective(): (mining*carry*move) / EFFECTIVE_DIVISOR
    STAT_COST_BASE: {mining:40, carry:60, move:50}, // workerUpgradeCost(): base cost per stat
    STAT_COST_GROWTH: 1.35,      // workerUpgradeCost(): cost growth factor per stat level
    STAT_INCREMENT_PER_UPGRADE: 1, // stat gain per upgrade purchase
    MIN_REQUIRED: 1,             // minimum workers needed for prestige / auto-craft unlock
  },
  selling: {
    AUTO_SELL_COST_MULTIPLIER: 20, // autoSellCost(): recipe.sell * AUTO_SELL_COST_MULTIPLIER
  },
  crafting: {
    WORKSHOP_LEVEL_SPEED_PER_LEVEL: 0.25,
    FACILITY_COST_BASE: 100,          // craftFacilityCost(): base gold cost of the first upgrade (level 1 → 2)
    FACILITY_COST_GROWTH: 1.5,        // craftFacilityCost(): cost growth factor per facility level
    FACILITY_SPEED_PER_LEVEL: 0.1,    // craftSpeed(): +10% timed-craft speed per level above 1
  },
  world: {
    // expandBase/unlockSite spend SITES[key].unlockCost, not a separate world cost.
    EXPANSION_SITE_ORDER: ['abandonedMine','manaVein','ruins','spaceStation'],
    PLAYER_SPEED: 3, // world units per second; tickPlayer divides by TICKS_PER_SECOND
    // Task 62: base-centred world. Coordinates may be negative or positive;
    // the walkable area is BOUNDS_* (can be widened later without touching
    // any other code). The base starts slightly east of the world centre.
    BOUNDS_MIN_X: -10,
    BOUNDS_MIN_Y: -10,
    BOUNDS_MAX_X: 10,
    BOUNDS_MAX_Y: 10,
    START_BASE_X: 2,
    START_BASE_Y: 0,
    // Task 65: a hidden mine is discovered when the player comes this close (world units).
    DISCOVERY_RADIUS: 2.5,
  },
  worldGen: {
    // Task 63: new-game mine layout (js/worldgen.js). Starter iron/coal are
    // placed at a random cell this far from the base (world units). Max 3
    // keeps them a ~1 s walk away and clear of the expansion seeds (>= 4 out).
    STARTER_MIN_DIST: 2,
    STARTER_MAX_DIST: 3,
    STARTER_MIN_SPACING: 2, // starter mines are at least this far apart
    EXTRA_MINES: 0,         // Task 63 extra mines anywhere (unused now that rings set the counts)
    // Task 64: distance rings around the base, [minDist, maxDist) in world
    // units. Each ring places `count` mines (the iron/coal starters count
    // toward the first ring) with resources picked by weight. Farther rings:
    // fewer mines, rarer resources. With the base at (2,0) in a -10..10 world
    // the farthest cell is ~15.6 away, so the last ring reaches the edges.
    MIN_SPACING: 2, // preferred minimum distance between mines (falls back if a ring is full)
    RINGS: [
      { key: 'near',  minDist: 2,  maxDist: 4,        count: 5, resources: { iron: 1, coal: 1 } },
      // Task 65: at most one mid-tier (mana/crystal) mine in the mid ring; the rest iron/coal.
      { key: 'mid',   minDist: 4,  maxDist: 7,        count: 4, resources: { iron: 2, coal: 2, mana: 1, crystal: 1 },
        limits: [{ resources: ['mana', 'crystal'], max: 1 }] },
      { key: 'far',   minDist: 7,  maxDist: 10,       count: 3, resources: { mana: 2, crystal: 2, rareMetal: 1, relic: 1 } },
      { key: 'outer', minDist: 10, maxDist: Infinity, count: 2, resources: { rareMetal: 2, relic: 2, cosmicShard: 1, plasma: 1 } },
    ],
    // Task 69: the land beyond the mountain. It is not a separate generator:
    // each environment zone (WORLD_TERRAIN.BEYOND.ZONES) borrows the resource
    // pool of a distance ring above — the whole land is far from the base, the
    // mine/rare zones are in the outermost ring. Farther from the tunnel exit =
    // fewer mines. These mines are generated once, when the tunnel is opened
    // (unlockTunnel), and are saved like any other mine.
    BEYOND: {
      MIN_SPACING: 2, // preferred minimum distance between mines (falls back if a zone is full)
      ZONES: [
        { zone: 'deepForest',  ring: 'far',   count: 3 },
        { zone: 'rockyGround', ring: 'far',   count: 2 },
        { zone: 'halfDugMine', ring: 'outer', count: 2 },
        { zone: 'rareDeep',    ring: 'outer', count: 1 },
      ],
    },
  },
  gacha: {
    FIRST_TICKET_GOLD_THRESHOLD: 50, // one-time gold milestone that grants the first ticket
    PULL_COST_GOLD: 50,              // gold cost of a direct gold-funded gacha pull
    PULL_COST_TICKET: 1,             // tickets consumed per ticket-funded gacha pull
    TICKET_TRICKLE_MS: 45000,        // passive automatic ticket grant interval
  },
};

