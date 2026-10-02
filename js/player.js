// Task 56: one player avatar in the existing world coordinate space.
// No wandering AI, no collision with mines, no pathfinding.
// Task 66: the mountain range (js/terrain.js) blocks movement — see tickPlayer.
const playerHeld = { up: false, down: false, left: false, right: false };

function playerDirFromKey(key){
  if(key === 'w' || key === 'W' || key === 'ArrowUp') return 'up';
  if(key === 's' || key === 'S' || key === 'ArrowDown') return 'down';
  if(key === 'a' || key === 'A' || key === 'ArrowLeft') return 'left';
  if(key === 'd' || key === 'D' || key === 'ArrowRight') return 'right';
  return null;
}

function setPlayerHeld(dir, down){
  if(!Object.prototype.hasOwnProperty.call(playerHeld, dir)) return false;
  playerHeld[dir] = !!down;
  return true;
}

function clearPlayerHeld(){
  playerHeld.up = false;
  playerHeld.down = false;
  playerHeld.left = false;
  playerHeld.right = false;
}

function clampPlayerPosition(x, y){
  return {
    x: clampPlayerAxis(x, BALANCE.world.BOUNDS_MIN_X, BALANCE.world.BOUNDS_MAX_X),
    y: clampPlayerAxis(y, BALANCE.world.BOUNDS_MIN_Y, BALANCE.world.BOUNDS_MAX_Y),
  };
}

function tickPlayer(){
  const player = state.world.player;
  let dx = (playerHeld.right ? 1 : 0) - (playerHeld.left ? 1 : 0);
  let dy = (playerHeld.down ? 1 : 0) - (playerHeld.up ? 1 : 0);
  if(dx === 0 && dy === 0){
    player.pose = 'idle';
    return;
  }
  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;
  const step = BALANCE.world.PLAYER_SPEED / TICKS_PER_SECOND;
  const next = clampPlayerPosition(player.x + dx * step, player.y + dy * step);
  // Task 66: terrain collision. X and Y are resolved separately, each moving
  // as far toward its target as the rock allows: pushing into the face stops
  // that axis flush against it while the other axis keeps going, so the
  // player slides along the mountain instead of bouncing or teleporting.
  // (If a position is somehow already inside rock, movement is not blocked,
  // so the player can always walk back out.)
  const startX = player.x, startY = player.y;
  if(isWorldPointWalkable(startX, startY)){
    player.x = terrainAdvance(startX, next.x, (x) => isWorldPointWalkable(x, startY));
    player.y = terrainAdvance(startY, next.y, (y) => isWorldPointWalkable(player.x, y));
  } else {
    player.x = next.x;
    player.y = next.y;
  }
  if(Math.abs(dx) >= Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
  else player.facing = dy > 0 ? 'down' : 'up';
  player.pose = (player.x !== startX || player.y !== startY) ? 'walk' : 'idle';
}
