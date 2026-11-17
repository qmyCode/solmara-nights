// The player: Rico Solano, a wheelman new in Solmara. On foot he walks where WASD points
// him and aims with the mouse; near a car, E gets in — parked cars are a quiet theft, a
// traffic car pulled from its driver is a loud one, and both are crimes the city notices.
// Driving delegates to the shared car physics, but this module owns what a driven car hits:
// other cars (bent metal, rising heat) and pedestrians (much worse). Death means waking up
// outside the Clínica Solmara, poorer.

import { collideCircle } from './world.js';
import { carsOverlap, driveCar } from './vehicles.js';
import { knockDown } from './pedestrians.js';
import { addWanted } from './police.js';

export const WALK_SPEED = 178;
export const PLAYER_RADIUS = 11;
const CLINIC_DOOR = { x: 80, y: 1080 };

export function createPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0, // facing, for drawing and shooting
    health: 100,
    car: null,
    walkPhase: 0,
    dead: false,
    deadT: 0,
    fireCooldown: 0,
  };
}

/** The nearest car the player could get into, or null. */
export function nearestCar(state, maxDist = 52) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.disabled) continue;
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(state, car) {
  const wasTraffic = car.kind === 'traffic';
  car.kind = 'player';
  car.speed = 0;
  state.player.car = car;
  state.audio.door();
  if (wasTraffic) {
    addWanted(state, 1);
    state.toast = 'You yanked a driver out — the city saw that!';
    state.toastT = 2.6;
  } else {
    // A quiet theft still counts once anyone is watching.
    state.stealCooldown = 6;
    state.pendingSteal = true;
    state.toast = `You are driving the ${car.type.label}.`;
    state.toastT = 2.2;
  }
  state.onEnterCar?.(car);
}

function exitCar(state) {
  const car = state.player.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  state.player.car = null;
  // Step out beside the driver's door.
  const side = car.angle + Math.PI / 2;
  const [nx, ny] = collideCircle(state.world, car.x + Math.sin(side) * 34, car.y - Math.cos(side) * 34, PLAYER_RADIUS);
  state.player.x = nx;
  state.player.y = ny;
  state.audio.door();
}

export function updatePlayer(state, dt) {
  const player = state.player;
  if (player.dead) {
    player.deadT -= dt;
    if (player.deadT <= 0) respawn(state);
    return;
  }
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  state.stealCooldown = Math.max(0, (state.stealCooldown ?? 0) - dt);
  if (state.pendingSteal && state.stealCooldown <= 0) {
    state.pendingSteal = false;
    addWanted(state, 1);
    state.toast = 'A witness reported the stolen car!';
    state.toastT = 2.4;
  }

  if (player.car) {
    updateDriving(state, dt);
    return;
  }

  // On foot.
  const axis = state.input.moveAxis();
  const mouse = state.mouseWorld;
  player.angle = Math.atan2(mouse.x - player.x, -(mouse.y - player.y));
  let vx = 0;
  let vy = 0;
  if (axis.x !== 0 || axis.y !== 0) {
    const d = Math.hypot(axis.x, axis.y);
    vx = (axis.x / d) * WALK_SPEED;
    vy = (axis.y / d) * WALK_SPEED;
    player.walkPhase += dt * 9;
  }
  player.vx = vx;
  player.vy = vy;
  const [nx, ny] = collideCircle(state.world, player.x + vx * dt, player.y + vy * dt, PLAYER_RADIUS);
  player.x = nx;
  player.y = ny;
  // Cars are solid on foot: step out of any overlap.
  for (const car of state.cars) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 40 * 40 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      player.x = car.x + (dx / d) * 40;
      player.y = car.y + (dy / d) * 40;
    }
  }
}

function updateDriving(state, dt) {
  const player = state.player;
  const car = player.car;
  const input = state.input.driveAxis();
  const before = Math.abs(car.speed);
  const impact = driveCar(state, car, input, dt);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  if (impact > 120) {
    state.audio.crash();
    player.health -= (impact - 110) * 0.05;
    shake(state, Math.min(9, impact / 45));
    if (impact > 200) addWanted(state, 1);
  }
  // Hitting other cars: shove them, bend both, and the law notices a hard hit.
  for (const other of state.cars) {
    if (other === car || !carsOverlap(car, other)) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.max(20, Math.hypot(dx, dy));
    other.x += (dx / d) * (58 - d) * 0.6;
    other.y += (dy / d) * (58 - d) * 0.6;
    if (before > 60) {
      other.health -= before * 0.09;
      car.health -= before * 0.05;
      if (other.kind === 'police') {
        addWanted(state, 1);
        state.toast = 'You rammed a police interceptor!';
        state.toastT = 2.2;
      } else if (before > 150) {
        addWanted(state, 1);
      }
      state.audio.hit();
      shake(state, 3.5);
      car.speed *= 0.55;
    }
  }
  // Running down a pedestrian is the city's most serious everyday crime.
  for (const ped of state.peds) {
    if (ped.down) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy < 40 * 40 && Math.abs(car.speed) > 34) {
      knockDown(state, ped);
      addWanted(state, 1);
      state.toast = 'You ran someone down!';
      state.toastT = 2.6;
      state.audio.hit();
      car.speed *= 0.7;
    }
  }
  if (car.disabled) {
    state.toast = 'This car is wrecked — find another.';
    state.toastT = 2;
    exitCar(state);
  }
  if (player.health <= 0) killPlayer(state);
}

/** E key handling, called from main.js when the interact action fires. */
export function toggleCar(state) {
  if (state.player.dead) return;
  if (state.player.car) {
    if (Math.abs(state.player.car.speed) < 26) exitCar(state);
    return;
  }
  const car = nearestCar(state);
  if (car) enterCar(state, car);
}

export function damagePlayer(state, amount) {
  const player = state.player;
  if (player.dead || player.car) {
    if (player.car) player.car.health -= amount * 0.7;
    return;
  }
  player.health -= amount;
  if (player.health <= 0) killPlayer(state);
}

export function killPlayer(state) {
  const player = state.player;
  if (player.dead) return;
  player.dead = true;
  player.deadT = 2.2;
  if (player.car) {
    player.car.kind = 'parked';
    player.car = null;
  }
}

function respawn(state) {
  const player = state.player;
  const fee = Math.min(state.cash, 100);
  state.cash -= fee;
  player.x = CLINIC_DOOR.x;
  player.y = CLINIC_DOOR.y;
  player.health = 100;
  player.dead = false;
  state.wanted = Math.max(0, state.wanted - 2);
  state.toast = `Clínica Solmara patched you up — $${fee} for the stitches.`;
  state.toastT = 3.2;
}

function shake(state, amount) {
  state.shakeT = Math.max(state.shakeT ?? 0, 0.25);
  state.shakeAmp = Math.max(state.shakeAmp ?? 0, amount);
}

/** Draw Rico: a sun-shirted figure who faces his aim, gun out when he has fired lately. */
export function drawPlayer(ctx, player, time) {
  if (player.car || player.dead) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  // A golden "you are here" ring, so Rico reads at a glance in any crowd or screenshot.
  ctx.strokeStyle = 'rgba(255,209,102,0.9)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14.5 + Math.sin(time * 5) * 1.4, 8.5 + Math.sin(time * 5) * 0.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(60,30,10,0.28)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle);
  const swing = Math.sin(player.walkPhase * 6) * 3.6;
  ctx.strokeStyle = '#274156';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-swing, 10);
  ctx.moveTo(0, 2);
  ctx.lineTo(swing, 10);
  ctx.stroke();
  // Sunset shirt.
  ctx.fillStyle = '#ff7b3d';
  ctx.fillRect(-5, -5.5, 10, 9.5);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(-5, -5.5, 10, 3);
  // Gun arm toward the aim.
  ctx.strokeStyle = '#8d5524';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(3, -2);
  ctx.lineTo(5, -10);
  ctx.stroke();
  ctx.fillStyle = '#20242a';
  ctx.fillRect(3.8, -15, 2.4, 6);
  // Head with a cap.
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(0, -8.8, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#118ab2';
  ctx.beginPath();
  ctx.arc(0, -9.6, 4.6, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-4.6, -10.4, 9.2, 1.8);
  ctx.restore();
}
