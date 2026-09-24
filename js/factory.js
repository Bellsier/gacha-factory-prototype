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

