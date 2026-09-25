(function test_T23_overlapValidation() {
  const win = newDom(makeMemoryStorage()).window;
  const existing = win.addFactoryNode({ type: 'production', x: 5, y: 5, width: 2, height: 2 }); // occupies (5,5)-(6,6)
  check('Task23: existing base node placed for overlap tests', !!existing);

  check('Task23: full overlap (identical rect) rejected', win.addFactoryNode({ type: 'production', x: 5, y: 5, width: 2, height: 2 }) === null);
  check('Task23: partial overlap rejected', win.addFactoryNode({ type: 'production', x: 6, y: 6, width: 2, height: 2 }) === null);
  check('Task23: single-cell overlap rejected', win.addFactoryNode({ type: 'production', x: 6, y: 6, width: 1, height: 1 }) === null);
  check('Task23: only the existing node remains after the rejected overlaps', win.state.factory.nodes.length === 1);

  const rightOf = win.addFactoryNode({ type: 'production', x: 7, y: 5, width: 1, height: 2 }); // shares only the (7,x) edge
  check('Task23: side-by-side placement (edge touch) succeeds', !!rightOf);

  const below = win.addFactoryNode({ type: 'production', x: 5, y: 7, width: 2, height: 1 }); // shares only the y=7 edge
  check('Task23: above/below adjacent placement (edge touch) succeeds', !!below);

  const diagonal = win.addFactoryNode({ type: 'production', x: 7, y: 7, width: 1, height: 1 }); // touches only at the (7,7) corner
  check('Task23: diagonal corner-touch placement succeeds', !!diagonal);

  check('Task23: 4 nodes total after the 3 valid adjacent placements', win.state.factory.nodes.length === 4);
})();

(function test_T23_idHandling() {
  const win = newDom(makeMemoryStorage()).window;

  const n1 = win.addFactoryNode({ type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task23: a node with no id gets a non-empty string id', typeof n1.id === 'string' && n1.id.length > 0);

  const n2 = win.addFactoryNode({ type: 'production', x: 1, y: 0, width: 1, height: 1 });
  check('Task23: two consecutive additions get distinct ids', n1.id !== n2.id);

  // Supplying an id that collides with an existing node's id must be handled
  // safely (a fresh id assigned), not rejected as a validation failure and
  // not allowed to silently overwrite/duplicate the existing node's id.
  const n3 = win.addFactoryNode({ id: n1.id, type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  check('Task23: a colliding supplied id is accepted (placement still succeeds)', !!n3);
  check('Task23: the colliding id was replaced with a fresh, different id', n3.id !== n1.id);
  check('Task23: all three nodes now have mutually distinct ids', new Set([n1.id, n2.id, n3.id]).size === 3);
  check('Task23: the original node (n1) was left completely untouched by the collision', win.state.factory.nodes.find((n) => n.id === n1.id).type === 'production');

  // A non-colliding, well-formed supplied id is kept as-is.
  const n4 = win.addFactoryNode({ id: 'node_keepme_custom', type: 'production', x: 3, y: 0, width: 1, height: 1 });
  check('Task23: a valid non-colliding supplied id is preserved exactly', n4.id === 'node_keepme_custom');

  // Ids must not be array-index-based: reordering the array must not change
  // which node a given id refers to.
  const idsInOrder = win.state.factory.nodes.map((n) => n.id);
  win.state.factory.nodes.reverse();
  const found = win.state.factory.nodes.find((n) => n.id === idsInOrder[0]);
  check('Task23: node identity survives array reordering (id-based, not index-based)', !!found && found.id === idsInOrder[0]);
})();

(function test_T23_invalidInputLeavesStateUntouched() {
  const win = newDom(makeMemoryStorage()).window;
  const existingNode = win.addFactoryNode({ type: 'production', x: 5, y: 5, width: 2, height: 2 });
  check('Task23: baseline node placed before failure attempts', !!existingNode);

  const linkBefore = win.sanitizeFactoryLink({ from: existingNode.id, to: existingNode.id });
  win.state.factory.links.push(linkBefore);
  const nodesBefore = JSON.stringify(win.state.factory.nodes);
  const linksBefore = JSON.stringify(win.state.factory.links);
  const gridBefore = JSON.stringify(win.state.factory.grid);

  const badAttempts = [
    { type: 'belt', x: 0, y: 0, width: 1, height: 1 },       // invalid type
    { type: 'production', y: 0, width: 1, height: 1 },        // missing x
    { type: 'production', x: 0, width: 1, height: 1 },        // missing y
    { type: 'production', x: 0, y: 0, height: 1 },            // missing width
    { type: 'production', x: 0, y: 0, width: 1 },              // missing height
    { type: 'production', x: 0.5, y: 0, width: 1, height: 1 },// non-integer x
    { type: 'production', x: 0, y: 0, width: 4, height: 1 },  // out-of-range width
    { type: 'production', x: -1, y: 0, width: 1, height: 1 }, // negative x
    { type: 'production', x: 5, y: 5, width: 2, height: 2 },  // overlaps existing
    null,
    'not an object',
    42,
  ];
  const results = badAttempts.map((n) => win.addFactoryNode(n));
  check('Task23: every invalid attempt returns null', results.every((r) => r === null));
  check('Task23: state.factory.nodes unchanged after every invalid attempt', JSON.stringify(win.state.factory.nodes) === nodesBefore);
  check('Task23: state.factory.links unchanged after every invalid attempt', JSON.stringify(win.state.factory.links) === linksBefore);
  check('Task23: state.factory.grid unchanged after every invalid attempt', JSON.stringify(win.state.factory.grid) === gridBefore);
})();

(function test_T23_existingRegressionUntouched() {
  // Sanity check that Task 22's pure validators are unaffected by Task 23's
  // new action function existing alongside them.
  const win = newDom(makeMemoryStorage()).window;
  const grid = { width: 25, height: 25 };
  check('Task23: canPlaceFactoryNode still works standalone (unrelated to addFactoryNode)', win.canPlaceFactoryNode(gridNode(0, 0, 1, 1), grid, []) === true);
  check('Task23: saveVersion is still 1', (() => { win.saveGame(); return JSON.parse(win.localStorage.getItem('gachaFactorySave')).saveVersion === 1; })());
})();

// =============================================================================
// TASK 25 — Factory Link model and connection validation/action.
// A Link connects two existing Factory Nodes by directed from/to ids.
// Belt geometry, throughput, item movement, splitter/merger behavior, and
// production simulation are intentionally outside this task.
// =============================================================================

(function test_T25_validLinkSucceeds() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });

  const link = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: valid Node -> Node link succeeds', !!link);
  check('Task25: valid link preserves from/to ids', !!link && link.from === source.id && link.to === target.id);
  check('Task25: valid link is stored in state.factory.links', win.state.factory.links.length === 1 && win.state.factory.links[0].id === link.id);
})();

(function test_T25_invalidEndpointsRejected() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const before = JSON.stringify(win.state.factory.links);

  check('Task25: nonexistent source is rejected', win.addFactoryLink({ from: 'node_missing', to: target.id }) === null);
  check('Task25: nonexistent target is rejected', win.addFactoryLink({ from: source.id, to: 'node_missing' }) === null);
  check('Task25: missing source is rejected', win.addFactoryLink({ to: target.id }) === null);
  check('Task25: missing target is rejected', win.addFactoryLink({ from: source.id }) === null);
  check('Task25: empty source is rejected', win.addFactoryLink({ from: '', to: target.id }) === null);
  check('Task25: empty target is rejected', win.addFactoryLink({ from: source.id, to: '' }) === null);
  check('Task25: invalid endpoint attempts leave links unchanged', JSON.stringify(win.state.factory.links) === before);
})();

(function test_T25_selfLinkRejected() {
  const win = newDom(makeMemoryStorage()).window;
  const node = win.addFactoryNode({ id: 'node_self', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  check('Task25: self-link is rejected', win.addFactoryLink({ from: node.id, to: node.id }) === null);
  check('Task25: self-link rejection leaves links empty', win.state.factory.links.length === 0);
})();

(function test_T25_duplicateDirectionRejectedAndReverseAllowed() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });

  const forward = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: first A -> B link succeeds', !!forward);
  const beforeDuplicate = JSON.stringify(win.state.factory.links);

  check('Task25: duplicate A -> B link is rejected', win.addFactoryLink({ from: source.id, to: target.id }) === null);
  check('Task25: duplicate same-direction rejection leaves links unchanged', JSON.stringify(win.state.factory.links) === beforeDuplicate);

  const reverse = win.addFactoryLink({ from: target.id, to: source.id });
  check('Task25: reverse B -> A link is allowed', !!reverse);
  check('Task25: forward and reverse links coexist', win.state.factory.links.length === 2);
})();

(function test_T25_idHandling() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });

  const generated = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: link without id gets a non-empty string id', typeof generated.id === 'string' && generated.id.length > 0);

  const secondTarget = win.addFactoryNode({ id: 'node_c', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  const supplied = win.addFactoryLink({ id: 'link_keepme_custom', from: target.id, to: secondTarget.id });
  check('Task25: non-colliding supplied link id is preserved', !!supplied && supplied.id === 'link_keepme_custom');

  const thirdTarget = win.addFactoryNode({ id: 'node_d', type: 'storage', x: 6, y: 0, width: 1, height: 1 });
  const colliding = win.addFactoryLink({ id: generated.id, from: source.id, to: thirdTarget.id });
  check('Task25: colliding supplied link id does not reject the valid connection', !!colliding);
  check('Task25: colliding supplied link id is replaced with a fresh id', !!colliding && colliding.id !== generated.id);
  check('Task25: all three link ids are distinct', new Set([generated.id, supplied.id, colliding.id]).size === 3);
})();

(function test_T25_invalidInputLeavesStateUntouched() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const valid = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task25: baseline link exists before failure tests', !!valid);

  const linksBefore = JSON.stringify(win.state.factory.links);
  const nodesBefore = JSON.stringify(win.state.factory.nodes);
  const badAttempts = [
    null,
    'not an object',
    42,
    {},
    { from: source.id, to: source.id },
    { from: 'missing', to: target.id },
    { from: source.id, to: 'missing' },
    { from: source.id, to: target.id },
  ];

  const results = badAttempts.map((link) => win.addFactoryLink(link));
  check('Task25: every invalid link attempt returns null', results.every((result) => result === null));
  check('Task25: invalid link attempts leave links unchanged', JSON.stringify(win.state.factory.links) === linksBefore);
  check('Task25: invalid link attempts leave nodes unchanged', JSON.stringify(win.state.factory.nodes) === nodesBefore);
})();

(function test_T25_saveLoadRoundTrip() {
  const storage = makeMemoryStorage();
  let win = newDom(storage).window;
  const source = win.addFactoryNode({ id: 'node_save_source', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_save_target', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const reverseTarget = win.addFactoryNode({ id: 'node_save_reverse', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  win.addFactoryLink({ id: 'link_save_forward', from: source.id, to: target.id });
  win.addFactoryLink({ id: 'link_save_reverse', from: reverseTarget.id, to: source.id });

  // Compared with sorted object keys, not raw JSON.stringify(): addFactoryLink()
  // builds a link as {id, from, to} while sanitizeFactoryLink() (used on
  // reload) builds it as {from, to, id}. Both are the same link with the
  // same field values — only the key insertion order differs — so a raw
  // JSON.stringify() comparison would report a false mismatch here. This
  // normalization was already the established pattern elsewhere in this file
  // (e.g. the worker save/load tests above use the same
  // JSON.stringify(x, Object.keys(x).sort()) technique for the same reason).
  const normalizeLinks = (links) => JSON.stringify(links.map((l) => JSON.stringify(l, Object.keys(l).sort())));
  const before = normalizeLinks(win.state.factory.links);
  const saved = win.saveGame();
  check('Task25: saveGame succeeds with Factory Links present', saved === true);

  win = newDom(storage).window;
  check('Task25: saved links are restored after reload', normalizeLinks(win.state.factory.links) === before);
  check('Task25: restored link count is preserved', win.state.factory.links.length === 2);
  check('Task25: restored link fields are preserved', win.state.factory.links.every((link) => typeof link.id === 'string' && typeof link.from === 'string' && typeof link.to === 'string'));
})();

// =============================================================================
// TASK 26 — Factory Link removal (removeFactoryLink). Deletes exactly one
// Link by id; belt geometry, throughput, splitter/merger behavior, tick
// simulation, and UI remain intentionally outside this task.
// =============================================================================

(function test_T26_removeExistingLinkSucceeds() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const link = win.addFactoryLink({ from: source.id, to: target.id });
  check('Task26: baseline link created before removal', !!link);

  const removed = win.removeFactoryLink(link.id);
  check('Task26: removeFactoryLink returns the removed link (truthy)', !!removed);
  check('Task26: removed link matches the requested id', removed && removed.id === link.id);
  check('Task26: state.factory.links is empty after removing the only link', win.state.factory.links.length === 0);
})();

(function test_T26_removeNonexistentLinkFails() {
  const win = newDom(makeMemoryStorage()).window;
  const source = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const target = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  win.addFactoryLink({ from: source.id, to: target.id });
  const before = win.state.factory.links.length;

  check('Task26: removing an id that was never used fails', win.removeFactoryLink('link_never_existed') === null);
  check('Task26: removing an empty string id fails', win.removeFactoryLink('') === null);
  check('Task26: removing a non-string id fails (no throw)', win.removeFactoryLink(42) === null);
  check('Task26: removing null fails (no throw)', win.removeFactoryLink(null) === null);
  check('Task26: removing undefined fails (no throw)', win.removeFactoryLink(undefined) === null);
  check('Task26: failed removals leave the existing link untouched', win.state.factory.links.length === before);
})();

(function test_T26_removeOnlyTargetedLinkLeavesOthersIntact() {
  const win = newDom(makeMemoryStorage()).window;
  const a = win.addFactoryNode({ id: 'node_a', type: 'production', x: 0, y: 0, width: 1, height: 1 });
  const b = win.addFactoryNode({ id: 'node_b', type: 'storage', x: 2, y: 0, width: 1, height: 1 });
  const c = win.addFactoryNode({ id: 'node_c', type: 'storage', x: 4, y: 0, width: 1, height: 1 });
  const linkAB = win.addFactoryLink({ from: a.id, to: b.id });
  const linkBC = win.addFactoryLink({ from: b.id, to: c.id });
  const linkCA = win.addFactoryLink({ from: c.id, to: a.id });
  check('Task26: three links exist before removal', win.state.factory.links.length === 3);

  const removed = win.removeFactoryLink(linkBC.id);
  check('Task26: the targeted link is removed', !!removed && removed.id === linkBC.id);
  check('Task26: exactly two links remain', win.state.factory.links.length === 2);
  check('Task26: the untargeted links are still present, unchanged', win.state.factory.links.some((l) => l.id === linkAB.id) && win.state.factory.links.some((l) => l.id === linkCA.id));
  check('Task26: the removed link is no longer present', !win.state.factory.links.some((l) => l.id === linkBC.id));

  // Nodes are a completely separate concern from Link removal.
  check('Task26: removing a Link does not touch state.factory.nodes', win.state.factory.nodes.length === 3);
})();

