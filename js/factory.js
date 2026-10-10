// ---------------------------------------------------------------------------
// Task 22: Factory Node placement validation — pure functions that answer
// "can this exact Node go here, right now, against this grid and these
// other Nodes?" with a plain boolean. This is a different job from the
// Task 21 sanitize helpers above: sanitizeFactoryNode() takes possibly-
// malformed SAVE DATA and coerces it into a safe default value; the
// functions below never coerce anything and never touch state — they just
// check. addFactoryNode() lives below; there is still no Factory UI.
//
// A Node occupies the half-open rectangle x <= cell.x < x+width,
// y <= cell.y < y+height, so two Nodes that only share an edge or a corner
// do not overlap (see doFactoryNodesOverlap below).
// ---------------------------------------------------------------------------
function isFactoryNodeSizeValid(width, height){
  return isValidNodeSize(width) && isValidNodeSize(height);
}
function isFactoryNodeWithinGrid(node, grid){
  if(!isPlainObject(node) || !isPlainObject(grid)) return false;
  if(!isValidGridCoord(node.x) || !isValidGridCoord(node.y)) return false;
  if(!isFactoryNodeSizeValid(node.width, node.height)) return false;
  return (node.x + node.width) <= grid.width && (node.y + node.height) <= grid.height;
}
function doFactoryNodesOverlap(a, b){
  if(a.x + a.width <= b.x || b.x + b.width <= a.x) return false;
  if(a.y + a.height <= b.y || b.y + b.height <= a.y) return false;
  return true;
}
function factoryNodeOverlapsExisting(node, existingNodes){
  if(!Array.isArray(existingNodes)) return false;
  return existingNodes.some(n => doFactoryNodesOverlap(node, n));
}
function canPlaceFactoryNode(node, grid, existingNodes){
  if(!isFactoryNodeWithinGrid(node, grid)) return false;
  if(factoryNodeOverlapsExisting(node, existingNodes)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Task 23: Factory Node placement action — the one place allowed to actually
// push into state.factory.nodes. Reuses the Task 22 validation functions
// as-is (isFactoryNodeWithinGrid/factoryNodeOverlapsExisting already cover
// bounds, size range, and integer coordinates); no placement rule is
// re-derived here. Id handling mirrors sanitizeFactoryNodes()'s collision-safe
// pattern: an existing valid, non-colliding id is kept, otherwise a fresh one
// is generated via makeEntityId() — never array-index-based.
//
// Returns the added Node (a plain object, always truthy) on success, or null
// on any validation failure — that single truthy/null split is all callers
// need ("added" vs "rejected"); id collisions are resolved automatically
// rather than surfaced as a distinct failure, the same way sanitize already
// treats them. On failure, state.factory (nodes and links) and the rest of
// run state are left completely untouched — this function does not call
// canPlaceFactoryNode() itself so it can reject bad `type`/shape before ever
// forming a candidate rectangle to validate.
// ---------------------------------------------------------------------------
function addFactoryNode(rawNode){
  if(!isPlainObject(rawNode)) return null;
  if(!FACTORY_NODE_TYPES.includes(rawNode.type)) return null;
  const candidate = { type: rawNode.type, x: rawNode.x, y: rawNode.y, width: rawNode.width, height: rawNode.height };
  if(!isFactoryNodeWithinGrid(candidate, state.factory.grid)) return null;
  if(factoryNodeOverlapsExisting(candidate, state.factory.nodes)) return null;

  const existingIds = new Set(state.factory.nodes.map(n=>n.id));
  const id = (typeof rawNode.id === 'string' && rawNode.id.length > 0 && !existingIds.has(rawNode.id))
    ? rawNode.id
    : makeEntityId('node_', existingIds);

  const node = { id, type: candidate.type, x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
  state.factory.nodes.push(node);
  return node;
}


// ---------------------------------------------------------------------------
// Task 25: Factory Link connection validation/action.
// A Link is the abstract directed connection between two existing Factory
// Nodes. Belt geometry, throughput, item movement, splitter/merger behavior,
// and production simulation are intentionally outside this task.
// ---------------------------------------------------------------------------
function isFactoryLinkEndpointValid(nodeId, nodes){
  if(typeof nodeId !== 'string' || nodeId.length === 0) return false;
  if(!Array.isArray(nodes)) return false;
  return nodes.some(node => node && node.id === nodeId);
}

function isFactoryLinkValid(link, nodes, existingLinks){
  if(!isPlainObject(link)) return false;
  if(!isFactoryLinkEndpointValid(link.from, nodes)) return false;
  if(!isFactoryLinkEndpointValid(link.to, nodes)) return false;
  if(link.from === link.to) return false;
  if(!Array.isArray(existingLinks)) return false;
  return !existingLinks.some(existing => existing && existing.from === link.from && existing.to === link.to);
}

function addFactoryLink(rawLink){
  if(!isPlainObject(rawLink)) return null;

  const candidate = {
    from: rawLink.from,
    to: rawLink.to,
  };

  if(!isFactoryLinkValid(candidate, state.factory.nodes, state.factory.links)) return null;

  const existingIds = new Set(state.factory.links.map(link => link.id));
  const id = (typeof rawLink.id === 'string' && rawLink.id.length > 0 && !existingIds.has(rawLink.id))
    ? rawLink.id
    : makeEntityId('link_', existingIds);

  const link = { id, from: candidate.from, to: candidate.to };
  state.factory.links.push(link);
  return link;
}

// ---------------------------------------------------------------------------
// Task 26: Factory Link removal — the one place allowed to actually splice
// state.factory.links. Deletes by id only (never by array index, matching
// every other Factory identity rule in this file); an id that doesn't match
// any existing Link is a no-op failure, not an error. Nodes, other Links,
// and the rest of run state are left completely untouched on both success
// and failure. Once a Link is removed, its exact from->to pair is no longer
// present in state.factory.links, so addFactoryLink() (whose duplicate check
// only looks at existingLinks) will accept that same from->to pair again —
// no separate "allow re-creation" logic is needed here.
// ---------------------------------------------------------------------------
function removeFactoryLink(linkId){
  if(typeof linkId !== 'string' || linkId.length === 0) return null;
  const index = state.factory.links.findIndex(link => link && link.id === linkId);
  if(index === -1) return null;
  const [removed] = state.factory.links.splice(index, 1);
  return removed;
}

// ---------------------------------------------------------------------------
// Task 28: World Mine registration.
// A Mine is a world point, not a Factory node. Registration validates the
// minimal world data only; mining, yield, region unlocks, and UI are separate
// tasks. A coordinate can contain only one Mine, while id collisions are
// resolved by generating a fresh mine_... id.
function isMineResourceValid(resource){
  return typeof resource === 'string' && RESOURCES.some(r => r.key === resource);
}

function isMineDevelopmentStateValid(developmentState){
  return typeof developmentState === 'string' && MINE_DEVELOPMENT_STATES.includes(developmentState);
}

function isMineValid(mine, existingMines){
  if(!isPlainObject(mine)) return false;
  if(!isValidWorldX(mine.x) || !isValidWorldY(mine.y)) return false; // Task 62: integer inside the world bounds (may be negative)
  if(!isMineResourceValid(mine.resource)) return false;
  if(!isNonNegativeInt(mine.grade) || mine.grade < 1) return false;
  if(!isNonNegativeFinite(mine.miningPower) || mine.miningPower <= 0) return false;
  if(!isMineDevelopmentStateValid(mine.developmentState)) return false;
  if(!Array.isArray(existingMines)) return false;
  return !existingMines.some(existing => existing && existing.x === mine.x && existing.y === mine.y);
}

function addMine(rawMine){
  if(!isPlainObject(rawMine)) return null;

  const candidate = {
    x: rawMine.x,
    y: rawMine.y,
    resource: rawMine.resource,
    grade: rawMine.grade,
    miningPower: rawMine.miningPower,
    developmentState: rawMine.developmentState,
  };

  if(!isMineValid(candidate, state.world.mines)) return null;

  const existingIds = new Set(state.world.mines.map(mine => mine.id));
  const id = (typeof rawMine.id === 'string' && rawMine.id.length > 0 && !existingIds.has(rawMine.id))
    ? rawMine.id
    : makeEntityId('mine_', existingIds);

  const mine = { id, ...candidate };
  state.world.mines.push(mine);
  return mine;
}

// ---------------------------------------------------------------------------
// Task 37: Workshop registration.
// A Workshop is a world/base facility, separate from the legacy Factory Node
// data model. Placement is currently only unique within the workshop
// collection. Construction cost UI is not in this prototype; recipe
// assignment uses setWorkshopRecipe().
function isWorkshopRecipeValid(recipeKey){
  return recipeKey === null || (typeof recipeKey === 'string' && RECIPES.some(recipe => recipe.key === recipeKey));
}

function isWorkshopValid(workshop, existingWorkshops){
  if(!isPlainObject(workshop)) return false;
  if(!isValidWorldX(workshop.x) || !isValidWorldY(workshop.y)) return false; // Task 62: integer inside the world bounds (may be negative)
  if(!isNonNegativeInt(workshop.level) || workshop.level < 1) return false;
  if(!isWorkshopRecipeValid(workshop.recipeKey)) return false;
  if(!(workshop.progress === null || (isNonNegativeFinite(workshop.progress) && workshop.progress > 0))) return false;
  if(!Array.isArray(existingWorkshops)) return false;
  return !existingWorkshops.some(existing => existing && existing.x === workshop.x && existing.y === workshop.y);
}

function addWorkshop(rawWorkshop){
  if(!isPlainObject(rawWorkshop)) return null;
  const candidate = {
    x: rawWorkshop.x,
    y: rawWorkshop.y,
    level: rawWorkshop.level,
    recipeKey: rawWorkshop.recipeKey === undefined ? null : rawWorkshop.recipeKey,
    auto: typeof rawWorkshop.auto === 'boolean' ? rawWorkshop.auto : false,
    progress: rawWorkshop.progress === undefined ? null : rawWorkshop.progress,
  };
  if(!isWorkshopValid(candidate, state.world.workshops)) return null;

  const existingIds = new Set(state.world.workshops.map(workshop => workshop.id));
  const id = (typeof rawWorkshop.id === 'string' && rawWorkshop.id.length > 0 && !existingIds.has(rawWorkshop.id))
    ? rawWorkshop.id
    : makeEntityId('workshop_', existingIds);

  const workshop = { id, ...candidate };
  state.world.workshops.push(workshop);
  return workshop;
}

// Task 71: building a workshop. Needs the 'workshopBuild' research, a free
// spot near the base, and gold. The spot is the first open cell of the rings
// around the base (clear of rock, mines, the base and other workshops).
function workshopBuildCost(){
  const b = BALANCE.workshop;
  return Math.ceil(b.BUILD_COST_BASE * Math.pow(b.BUILD_COST_GROWTH, state.world.workshops.length));
}

function workshopBuildSpot(){
  const base = state.world.base;
  const taken = (x, y) =>
    (x === base.x && y === base.y) ||
    state.world.mines.some(m => m.x === x && m.y === y) ||
    state.world.workshops.some(w => w.x === x && w.y === y);
  for(let r = 1; r <= 4; r++){
    for(let dy = -r; dy <= r; dy++){
      for(let dx = -r; dx <= r; dx++){
        if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = base.x + dx, y = base.y + dy;
        if(!isValidWorldX(x) || !isValidWorldY(y)) continue;
        if(!isCellOpenForMines(x, y) || taken(x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

function canBuildWorkshop(){
  if(!isWorkshopBuildUnlocked()) return false;
  if(state.world.workshops.length >= maxWorkshops()) return false;
  if(state.gold < workshopBuildCost()) return false;
  return workshopBuildSpot() !== null;
}

function buildWorkshop(){
  if(!canBuildWorkshop()) return null;
  const spot = workshopBuildSpot();
  const cost = workshopBuildCost();
  const workshop = addWorkshop({ x: spot.x, y: spot.y, level: 1 });
  if(!workshop) return null;
  state.gold -= cost;
  log('제작소를 지었습니다. (' + spot.x + ', ' + spot.y + ')');
  return workshop;
}

// Task 79: upgrading a workshop. Costs gold (growing with the level) and, for
// the highest levels, some high-tier products (BALANCE.workshop.UPGRADE_PRODUCTS).
function workshopUpgradeCost(workshop){
  if(!workshop || workshop.level >= BALANCE.workshop.MAX_LEVEL) return null;
  const b = BALANCE.workshop;
  return {
    gold: expCost(b.UPGRADE_COST_BASE, b.UPGRADE_COST_GROWTH, workshop.level - 1),
    products: { ...(b.UPGRADE_PRODUCTS[workshop.level + 1] || {}) },
  };
}

function canUpgradeWorkshop(workshopId){
  const workshop = workshopById(workshopId);
  const cost = workshopUpgradeCost(workshop);
  if(!cost || state.gold < cost.gold) return false;
  return Object.keys(cost.products).every(k => (state.products[k] || 0) >= cost.products[k]);
}

function upgradeWorkshop(workshopId){
  if(!canUpgradeWorkshop(workshopId)) return false;
  const workshop = workshopById(workshopId);
  const cost = workshopUpgradeCost(workshop);
  state.gold -= cost.gold;
  Object.keys(cost.products).forEach(k => { state.products[k] -= cost.products[k]; });
  workshop.level += 1;
  log('제작소가 Lv.' + workshop.level + '이 되었습니다.');
  return true;
}

// Task 81: bottleneck report. What a recipe is short of, what each workshop is
// doing, and which items are missing across the workshops that are stuck.
function itemName(key){
  const res = resourceByKey(key);
  if(res) return res.name;
  const rec = recipeByKey(key);
  return rec ? rec.name : key;
}
function recipeShortages(recipe){
  if(!recipe) return [];
  return Object.entries(recipe.need)
    .map(([k, v]) => ({ key: k, name: itemName(k), need: v, have: Math.floor(stockOf(k) || 0) }))
    .filter(s => s.have < s.need);
}
// 'working' | 'noRecipe' | 'blocked' (short of inputs) | 'waiting' (can start, nobody told it to)
function workshopStatus(workshop){
  const recipe = recipeByKey(workshop.recipeKey);
  if(workshop.progress !== null && recipe) return { state: 'working', recipe, shortages: [] };
  if(!recipe) return { state: 'noRecipe', recipe: null, shortages: [] };
  const shortages = recipeShortages(recipe);
  if(shortages.length) return { state: 'blocked', recipe, shortages };
  return { state: workshop.auto && isAutoCraftUnlocked() ? 'working' : 'waiting', recipe, shortages: [] };
}
function bottleneckReport(){
  const idle = [];
  const missing = {};
  state.world.workshops.forEach((w, i) => {
    const st = workshopStatus(w);
    if(st.state === 'working') return;
    idle.push({ index: i + 1, id: w.id, state: st.state, recipe: st.recipe, shortages: st.shortages });
    st.shortages.forEach(s => {
      const m = missing[s.key] || (missing[s.key] = { key: s.key, name: s.name, short: 0, workshops: 0 });
      m.short += s.need - s.have;
      m.workshops += 1;
    });
  });
  const items = Object.keys(missing).map(k => missing[k]).sort((a, b) => b.workshops - a.workshops || b.short - a.short);
  return { idle, items };
}

function workshopRecipe(workshopId){
  if(typeof workshopId !== 'string' || workshopId.length === 0) return null;
  const workshop = workshopById(workshopId);
  if(!workshop || typeof workshop.recipeKey !== 'string') return null;
  return recipeByKey(workshop.recipeKey);
}

function workshopCraftTime(workshop, recipe){
  if(!workshop || !recipe) return 0;
  if(recipe.craftTime <= 0) return 0;
  const speed = 1 + Math.max(0, workshop.level - 1) * BALANCE.crafting.WORKSHOP_LEVEL_SPEED_PER_LEVEL;
  return recipe.craftTime / (speed * (1 + reputationEffect('craftSpeed')));
}

function craftWorkshop(workshopId){
  const workshop = workshopById(workshopId);
  if(!workshop) return false;
  if(workshop.progress !== null) return false;
  const recipe = workshopRecipe(workshopId);
  if(!recipe || !canCraft(recipe)) return false;
  consumeRecipeInputs(recipe, stockOf, setStock);
  const time = workshopCraftTime(workshop, recipe);
  if(time > 0){
    workshop.progress = time;
  } else {
    state.products[recipe.key] += recipe.out;
  }
  return true;
}

function tickWorkshops(){
  state.world.workshops.forEach(workshop=>{
    if(!workshop || workshop.progress === null) return;
    const recipe = workshopRecipe(workshop.id);
    if(!recipe){
      workshop.progress = null;
      return;
    }
    workshop.progress -= 1 / TICKS_PER_SECOND;
    if(workshop.progress <= 0){
      workshop.progress = null;
      state.products[recipe.key] += recipe.out;
    }
  });
  state.world.workshops.forEach(workshop=>{
    if(!workshop || !workshop.auto || workshop.progress !== null) return;
    if(!isAutoCraftUnlocked()) return; // Task 71: the device research gates auto-craft
    craftWorkshop(workshop.id);
  });
}

function setWorkshopRecipe(workshopId, recipeKey){
  if(typeof workshopId !== 'string' || workshopId.length === 0) return false;
  if(!isWorkshopRecipeValid(recipeKey)) return false;
  const workshop = workshopById(workshopId);
  if(!workshop) return false;
  if(workshop.progress !== null) return false;
  if(workshop.recipeKey === recipeKey) return false;
  workshop.recipeKey = recipeKey;
  return true;
}

// ---------------------------------------------------------------------------
// Task 30: Mine securing.
// Securing is only the development-state transition for now. Costs and
// expansion rules are intentionally deferred to later design/implementation
// Tasks.
// Task 64: region requirement — a mine can only be secured once its
// resource's site is unlocked. New worlds now place rarer mines in the far
// rings from the start; without this they could be secured before their site
// is reached, skipping the site-unlock progression.
function isMineSiteUnlocked(mine){
  const res = mine ? resourceByKey(mine.resource) : null;
  return !!res && !!state.unlockedSites[res.site];
}

function secureMine(mineId){
  if(typeof mineId !== 'string' || mineId.length === 0) return false;
  const mine = mineById(mineId);
  if(!mine || mine.developmentState !== 'unsecured') return false;
  if(!isMineDiscovered(mine)) return false; // Task 65: find it before securing it
  if(!isMineSiteUnlocked(mine)) return false;
  mine.developmentState = 'secured';
  return true;
}

// ---------------------------------------------------------------------------
// Task 31: Manual mining from a secured Mine.
// The mine's miningPower is the direct amount added to the shared resource
// pool for one manual mining action. Grade remains descriptive data until a
// later balance Task defines how it modifies output.
function mineMine(mineId){
  if(typeof mineId !== 'string' || mineId.length === 0) return false;
  const mine = mineById(mineId);
  if(!mine || mine.developmentState !== 'secured') return false;
  if(!isMineResourceValid(mine.resource) || !isNonNegativeFinite(mine.miningPower) || mine.miningPower <= 0) return false;
  state.resources[mine.resource] += mine.miningPower;
  return true;
}

// ---------------------------------------------------------------------------
// Task 68/69: Tunnel opening.
// Opening the tunnel is a one-way state change: it lets the player walk
// through the mountain to the land beyond (js/terrain.js) and, Task 69, brings
// that land's mines into the world: generateBeyondMines() runs once here and
// the new mines are added undiscovered (the player finds them by walking, as
// with every ring mine). This function is the only place that opens the
// tunnel and has no condition of its own — the research "tunnelWork"
// (js/research.js, Task 70) is what makes it openable in play.
// Returns true when the tunnel was closed and is now open, false when it was
// already open. Callers re-render (renderAll) like they do after expandBase().
// `options.random` is for tests (a () => [0,1) source).
// ---------------------------------------------------------------------------
function populateBeyondMines(options){
  const world = state.world;
  if(!Array.isArray(world.hiddenMineIds)) world.hiddenMineIds = [];
  const added = [];
  generateBeyondMines(world.mines, options).forEach(raw => {
    const mine = addMine(raw);
    if(!mine) return;
    world.hiddenMineIds.push(mine.id);
    added.push(mine);
  });
  return added;
}

function unlockTunnel(options){
  if(state.world.tunnelUnlocked === true) return false;
  state.world.tunnelUnlocked = true;
  if(state.research) researchSyncFromState(state.research, state.world, state.autoCraft); // Task 70: the tunnel research counts as done
  populateBeyondMines(options);
  log('터널이 열렸습니다. 산 너머로 갈 수 있어요.');
  return true;
}
