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
    EXPANSION_SITE_ORDER: ['abandonedMine','manaVein','ruins','spaceStation'],
    BASE_EXPANSION_COST: 250,
  },
  gacha: {
    FIRST_TICKET_GOLD_THRESHOLD: 50, // one-time gold milestone that grants the first ticket
    PULL_COST_GOLD: 50,              // gold cost of a direct gold-funded gacha pull
    PULL_COST_TICKET: 1,             // tickets consumed per ticket-funded gacha pull
    TICKET_TRICKLE_MS: 45000,        // passive automatic ticket grant interval
  },
};

