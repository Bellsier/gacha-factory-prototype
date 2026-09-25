(function test_T21_freshRunStateHasFactory() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task21: freshRunState() produces a state.factory object', typeof win.state.factory === 'object' && win.state.factory !== null);
  check('Task21: factory has grid/nodes/links', 'grid' in win.state.factory && 'nodes' in win.state.factory && 'links' in win.state.factory);
})();

(function test_T21_defaultGridIs25x25() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task21: default grid width is 25', win.state.factory.grid.width === 25);
  check('Task21: default grid height is 25', win.state.factory.grid.height === 25);
})();

(function test_T21_productionNodeRepresentable() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  win.state.factory.nodes.push({ id: 'node_test1', type: 'production', x: 3, y: 4, width: 2, height: 2 });
  const saved = win.saveGame();
  check('Task21: a production node saves successfully', saved === true);
  win = newDom(storage).window;
  const node = win.state.factory.nodes.find((n) => n.id === 'node_test1');
  check('Task21: production node survives sanitize/reload with type intact', !!node && node.type === 'production' && node.x === 3 && node.y === 4 && node.width === 2 && node.height === 2);
})();

(function test_T21_storageNodeRepresentable() {
  const win = newDom(makeMemoryStorage()).window;
  const sanitized = win.sanitizeFactoryNode({ id: 'node_s1', type: 'storage', x: 0, y: 0, width: 1, height: 1 });
  check('Task21: storage node type is representable', !!sanitized && sanitized.type === 'storage');
})();

(function test_T21_nodeIdIndependentOfArrayIndex() {
  const win = newDom(makeMemoryStorage()).window;
  const raw = [
    { id: 'node_first', type: 'production', x: 0, y: 0, width: 1, height: 1 },
    { id: 'node_second', type: 'storage', x: 1, y: 1, width: 1, height: 1 },
  ];
  const nodes = win.sanitizeFactoryNodes(raw);
  // Reverse the array — if code used array index as identity, "the node at
  // index 0" would now be the wrong node; id-based lookup must still work.
  nodes.reverse();
  const found = nodes.find((n) => n.id === 'node_second');
  check('Task21: node id survives array reordering (not index-based)', !!found && found.type === 'storage' && found.x === 1);
})();

(function test_T21_nodeSizeSanitizeClampsTo1to3() {
  const win = newDom(makeMemoryStorage()).window;
  const tooSmall = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 0, height: -1 });
  const tooBig = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 4, height: 99 });
  const valid1 = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const valid3 = win.sanitizeFactoryNode({ type: 'production', x: 0, y: 0, width: 3, height: 3 });
  check('Task21: width/height <= 0 falls back to a safe default (not 0 or negative)', tooSmall.width >= 1 && tooSmall.height >= 1);
  check('Task21: width/height >= 4 falls back to a safe default (not left oversized)', tooBig.width <= 3 && tooBig.height <= 3);
  check('Task21: width/height = 1 (min valid) passes through unchanged', valid1.width === 1 && valid1.height === 1);
  check('Task21: width/height = 3 (max valid) passes through unchanged', valid3.width === 3 && valid3.height === 3);
})();

(function test_T21_legacySaveWithoutFactoryLoadsFine() {
  const storage = makeMemoryStorage();
  const legacyPayload = {
    saveVersion: 1,
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: true },
    run: {
      // Pre-Task-21 shape: no `factory` key at all.
      resources: { iron: 5 }, products: {}, gold: 42, runGold: 0,
      characters: [], lastPull: null,
      facility: {}, workforce: {}, unlockedSites: { abandonedMine: true },
      autoCraft: {}, autoSell: {}, autoSellOn: {}, craftQueue: {}, hqLevel: 0, craftFacility: 1,
    },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(legacyPayload));
  const win = newDom(storage).window;
  check('Task21: legacy save (no factory field) still loads other fields correctly', win.state.gold === 42 && win.state.resources.iron === 5);
  check('Task21: legacy save gets a fresh default factory state', win.state.factory.grid.width === 25 && win.state.factory.grid.height === 25 && win.state.factory.nodes.length === 0 && win.state.factory.links.length === 0);
})();

(function test_T21_prestigeResetsFactory() {
  const win = newDom(makeMemoryStorage()).window;
  win.permanent.tickets = 1;
  win.pullGacha();
  win.state.factory.nodes.push({ id: 'node_beforeReset', type: 'production', x: 1, y: 1, width: 1, height: 1 });
  check('Task21: factory node present before prestige', win.state.factory.nodes.length === 1);
  win.state.runGold = 5000;
  win.document.getElementById('prestigeBtn').onclick();
  check('Task21: factory nodes cleared after prestige', win.state.factory.nodes.length === 0);
  check('Task21: factory grid still defaults to 25x25 after prestige', win.state.factory.grid.width === 25 && win.state.factory.grid.height === 25);
})();

(function test_T21_linksRepresentFromTo() {
  const win = newDom(makeMemoryStorage()).window;
  const link = win.sanitizeFactoryLink({ id: 'link_test1', from: 'node_a', to: 'node_b' });
  check('Task21: a link represents from/to node ids', !!link && link.from === 'node_a' && link.to === 'node_b');
  const links = win.sanitizeFactoryLinks([{ from: 'node_a', to: 'node_b' }]); // no id supplied
  check('Task21: a link missing an id gets one backfilled', links.length === 1 && typeof links[0].id === 'string' && links[0].id.length > 0);
})();

// =============================================================================
// TASK 22 — Factory Node placement validation (pure functions only; no
// addFactoryNode()/removeFactoryNode()/UI exists yet). isFactoryNodeWithinGrid/
// isFactoryNodeSizeValid/doFactoryNodesOverlap/factoryNodeOverlapsExisting/
// canPlaceFactoryNode are exercised directly and never read/write win.state.
// =============================================================================

function gridNode(x, y, width, height, id) {
  return { id: id || 'node_test', type: 'production', x, y, width, height };
}

(function test_T22_gridBoundaryTopLeftAndBottomRight() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task22: 1x1 fits at top-left (0,0)', win.canPlaceFactoryNode(gridNode(0, 0, 1, 1), grid, []) === true);
  check('Task22: 1x1 fits at bottom-right (24,24)', win.canPlaceFactoryNode(gridNode(24, 24, 1, 1), grid, []) === true);
  check('Task22: 3x3 fits at top-left (0,0)', win.canPlaceFactoryNode(gridNode(0, 0, 3, 3), grid, []) === true);
  check('Task22: 3x3 fits exactly at bottom-right (22,22)', win.canPlaceFactoryNode(gridNode(22, 22, 3, 3), grid, []) === true);
})();

(function test_T22_gridBoundaryOverflowAndNegative() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task22: 2x2 at (24,24) overflows the grid by 1 cell -> invalid', win.canPlaceFactoryNode(gridNode(24, 24, 2, 2), grid, []) === false);
  check('Task22: 3x3 at (23,23) overflows the grid by 1 cell -> invalid', win.canPlaceFactoryNode(gridNode(23, 23, 3, 3), grid, []) === false);
  check('Task22: 4x1 at (23,23) overflows -> invalid', win.canPlaceFactoryNode(gridNode(23, 23, 4, 1), grid, []) === false);
  check('Task22: negative x is invalid', win.canPlaceFactoryNode(gridNode(-1, 0, 1, 1), grid, []) === false);
  check('Task22: negative y is invalid', win.canPlaceFactoryNode(gridNode(0, -1, 1, 1), grid, []) === false);
})();

(function test_T22_nodeSizeRange() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task22: 1x1 size is valid', win.isFactoryNodeSizeValid(1, 1) === true);
  check('Task22: 2x2 size is valid', win.isFactoryNodeSizeValid(2, 2) === true);
  check('Task22: 3x3 size is valid', win.isFactoryNodeSizeValid(3, 3) === true);
  check('Task22: 0-width size is invalid', win.isFactoryNodeSizeValid(0, 1) === false);
  check('Task22: 0-height size is invalid', win.isFactoryNodeSizeValid(1, 0) === false);
  check('Task22: 4x1 size is invalid', win.isFactoryNodeSizeValid(4, 1) === false);
  check('Task22: 1x4 size is invalid', win.isFactoryNodeSizeValid(1, 4) === false);
  check('Task22: 3x4 size is invalid', win.isFactoryNodeSizeValid(3, 4) === false);
})();

(function test_T22_nonIntegerRejectedByPlacementValidation() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task22: non-integer width is rejected', win.isFactoryNodeSizeValid(1.5, 1) === false);
  check('Task22: non-integer height is rejected', win.isFactoryNodeSizeValid(1, 2.5) === false);
  check('Task22: non-integer x is rejected by isFactoryNodeWithinGrid', win.isFactoryNodeWithinGrid(gridNode(0.5, 0, 1, 1), grid) === false);
  check('Task22: non-integer y is rejected by isFactoryNodeWithinGrid', win.isFactoryNodeWithinGrid(gridNode(0, 2.5, 1, 1), grid) === false);
  check('Task22: non-integer coords are rejected by canPlaceFactoryNode', win.canPlaceFactoryNode(gridNode(0.5, 0.5, 1, 1), grid, []) === false);
})();

(function test_T22_overlapDetection() {
  const win = newDom(makeMemoryStorage()).window;
  const base = gridNode(5, 5, 2, 2, 'node_base'); // occupies (5,5)-(6,6)

  check('Task22: identical rectangle fully overlaps', win.doFactoryNodesOverlap(base, gridNode(5, 5, 2, 2)) === true);
  check('Task22: partially overlapping rectangle overlaps', win.doFactoryNodesOverlap(base, gridNode(6, 6, 2, 2)) === true);
  check('Task22: sharing exactly one cell overlaps', win.doFactoryNodesOverlap(gridNode(0, 0, 2, 2), gridNode(1, 1, 1, 1)) === true);
  check('Task22: adjacent horizontally (edge touch) does not overlap', win.doFactoryNodesOverlap(gridNode(0, 0, 2, 1), gridNode(2, 0, 1, 1)) === false);
  check('Task22: adjacent vertically (edge touch) does not overlap', win.doFactoryNodesOverlap(gridNode(0, 0, 1, 2), gridNode(0, 2, 1, 1)) === false);
  check('Task22: diagonal corner touch does not overlap', win.doFactoryNodesOverlap(gridNode(0, 0, 1, 1), gridNode(1, 1, 1, 1)) === false);
})();

(function test_T22_overlapExistingList() {
  const win = newDom(makeMemoryStorage()).window;
  const existing = [gridNode(5, 5, 2, 2, 'node_a'), gridNode(10, 10, 1, 1, 'node_b')];
  check('Task22: overlaps when colliding with any existing node', win.factoryNodeOverlapsExisting(gridNode(6, 6, 1, 1), existing) === true);
  check('Task22: no overlap when clear of every existing node', win.factoryNodeOverlapsExisting(gridNode(0, 0, 1, 1), existing) === false);
  check('Task22: empty existing list never overlaps', win.factoryNodeOverlapsExisting(gridNode(5, 5, 2, 2), []) === false);
})();

(function test_T22_canPlaceFactoryNodeComposite() {
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  const existing = [gridNode(5, 5, 2, 2, 'node_a')];

  check('Task22: valid grid + valid size + no overlap -> true', win.canPlaceFactoryNode(gridNode(10, 10, 2, 2), grid, existing) === true);
  check('Task22: out of grid range -> false', win.canPlaceFactoryNode(gridNode(24, 24, 2, 2), grid, existing) === false);
  check('Task22: invalid node size -> false', win.canPlaceFactoryNode(gridNode(10, 10, 4, 1), grid, existing) === false);
  check('Task22: invalid (negative) coordinate -> false', win.canPlaceFactoryNode(gridNode(-1, 10, 1, 1), grid, existing) === false);
  check('Task22: overlapping an existing node -> false', win.canPlaceFactoryNode(gridNode(6, 6, 1, 1), grid, existing) === false);
  check('Task22: adjacent to an existing node (edge touch only) -> true', win.canPlaceFactoryNode(gridNode(7, 5, 1, 2), grid, existing) === true);
})();

(function test_T22_validationIsPure() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.factory.nodes.push(gridNode(5, 5, 2, 2, 'node_real'));
  const nodesBefore = JSON.stringify(win.state.factory.nodes);
  const gridBefore = JSON.stringify(win.state.factory.grid);

  win.canPlaceFactoryNode(gridNode(0, 0, 1, 1), win.state.factory.grid, win.state.factory.nodes);
  win.canPlaceFactoryNode(gridNode(5, 5, 3, 3), win.state.factory.grid, win.state.factory.nodes); // overlapping call too
  win.isFactoryNodeWithinGrid(gridNode(100, 100, 1, 1), win.state.factory.grid);
  win.factoryNodeOverlapsExisting(gridNode(5, 5, 1, 1), win.state.factory.nodes);

  check('Task22: placement validation never mutates state.factory.nodes', JSON.stringify(win.state.factory.nodes) === nodesBefore);
  check('Task22: placement validation never mutates state.factory.grid', JSON.stringify(win.state.factory.grid) === gridBefore);
})();

(function test_T22_realFactoryGridDefaultUsedDirectly() {
  // Sanity check: the real default factory state (from Task 21) works
  // directly with these validators without any adaptation.
  const win = newDom(makeMemoryStorage()).window;
  check('Task22: a node fits in the fresh default 25x25 grid with no existing nodes', win.canPlaceFactoryNode(gridNode(0, 0, 3, 3), win.state.factory.grid, win.state.factory.nodes) === true);
})();

// =============================================================================
// TASK 23 — Factory Node placement action (addFactoryNode). Reuses Task 22's
// validation functions directly; this only exercises the actual state.factory
// mutation, id assignment, and failure-leaves-state-untouched behavior.
// =============================================================================

(function test_T23_basicPlacementSucceeds() {
  const win = newDom(makeMemoryStorage()).window;

  const n1 = win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task23: 1x1 placement succeeds (truthy return)', !!n1);
  check('Task23: nodes length is 1 after first add', win.state.factory.nodes.length === 1);

  const n2 = win.addFactoryNode({ type: 'storage', x: 5, y: 5, width: 2, height: 2 });
  check('Task23: 2x2 placement succeeds', !!n2);
  check('Task23: nodes length is 2 after second add', win.state.factory.nodes.length === 2);

  const n3 = win.addFactoryNode({ type: 'production', x: 10, y: 10, width: 3, height: 3 });
  check('Task23: 3x3 placement succeeds', !!n3);
  check('Task23: nodes length is 3 after third add', win.state.factory.nodes.length === 3);

  check('Task23: added node preserves x/y/width/height/type (n2)', n2.x === 5 && n2.y === 5 && n2.width === 2 && n2.height === 2 && n2.type === 'storage');
  const stored = win.state.factory.nodes.find((n) => n.id === n2.id);
  check('Task23: added node is actually present in state.factory.nodes with same fields', !!stored && stored.x === 5 && stored.y === 5 && stored.width === 2 && stored.height === 2 && stored.type === 'storage');
})();

(function test_T23_gridValidation() {
  const win = newDom(makeMemoryStorage()).window;

  check('Task23: negative x rejected', win.addFactoryNode({ type: 'production', x: -1, y: 0, width: 1, height: 1 }) === null);
  check('Task23: negative y rejected', win.addFactoryNode({ type: 'production', x: 0, y: -1, width: 1, height: 1 }) === null);
  check('Task23: out-of-grid placement rejected (24,24 2x2 overflows)', win.addFactoryNode({ type: 'production', x: 24, y: 24, width: 2, height: 2 }) === null);
  check('Task23: nothing was added by the rejected attempts above', win.state.factory.nodes.length === 0);

  const fitExact = win.addFactoryNode({ type: 'production', x: 22, y: 22, width: 3, height: 3 });
  check('Task23: 3x3 at (22,22) on a 25x25 grid succeeds (exact fit)', !!fitExact);

  const win2 = newDom(makeMemoryStorage()).window;
  check('Task23: 3x3 at (23,23) on a 25x25 grid fails (overflows by 1)', win2.addFactoryNode({ type: 'production', x: 23, y: 23, width: 3, height: 3 }) === null);
})();

(function test_T23_sizeValidation() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task23: 0x1 size rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 0, height: 1 }) === null);
  check('Task23: 4x1 size rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 4, height: 1 }) === null);
  check('Task23: 1x4 size rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 4 }) === null);
  check('Task23: non-integer width rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1.5, height: 1 }) === null);
  check('Task23: non-integer height rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 2.5 }) === null);
  check('Task23: non-integer x rejected', win.addFactoryNode({ type: 'production', x: 0.5, y: 0, width: 1, height: 1 }) === null);
  check('Task23: non-integer y rejected', win.addFactoryNode({ type: 'production', x: 0, y: 0.5, width: 1, height: 1 }) === null);
  check('Task23: nothing was added by any of the invalid-size attempts', win.state.factory.nodes.length === 0);
})();

