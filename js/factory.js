// Task 21: same collision-safe id pattern as makeWorkerId() above, generalized
// with a prefix so Factory nodes/links get their own id namespace (node_.../
// link_...) without duplicating the generation logic. makeWorkerId() itself
// is left as-is so no existing id format/behavior changes.
function makeEntityId(prefix, existingIds){
  let id;
  do{
    id = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  } while(existingIds instanceof Set && existingIds.has(id));
  return id;
}
// ---------------------------------------------------------------------------
// Task 22: Factory Node placement validation — pure functions that answer
// "can this exact Node go here, right now, against this grid and these
// other Nodes?" with a plain boolean. This is a different job from the
// Task 21 sanitize helpers above: sanitizeFactoryNode() takes possibly-
// malformed SAVE DATA and coerces it into a safe default value; the
// functions below never coerce anything and never touch state — they just
// check. Nothing calls these yet: there is no addFactoryNode() and no
// Factory UI wired up this task.
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
  if(!isValidGridCoord(mine.x) || !isValidGridCoord(mine.y)) return false;
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
