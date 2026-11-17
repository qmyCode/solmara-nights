// Pedestrians: Solmara's walkers. Each one strolls a loop around a city block's sidewalk
// ring (or along the beach promenade), pauses now and then, flees in a panic when a shot is
// fired or a car bears down on them, and falls when hit — which the law notices. They keep
// the streets feeling lived-in in every screenshot.

import { BLOCKS, SAND_Y, WATER_Y, collideCircle } from './world.js';

const PED_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#a8dadc', '#e0aaff', '#ffb4a2'];
const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const TARGET_PEDS = 26;

let nextPedId = 1;

function makePed(state, rng) {
  const onBeach = rng.chance(0.25);
  let home;
  if (onBeach) {
    home = { x0: 120, x1: 3040, y0: SAND_Y + 16, y1: SAND_Y + 48 };
  } else {
    const block = rng.pick(BLOCKS);
    home = { x0: block.x0 + 13, x1: block.x1 - 13, y0: block.y0 + 13, y1: block.y1 - 13 };
  }
  // A loop of the ring's four corners, walked in order.
  const corners = [
    { x: home.x0, y: home.y0 },
    { x: home.x1, y: home.y0 },
    { x: home.x1, y: home.y1 },
    { x: home.x0, y: home.y1 },
  ];
  const startCorner = rng.int(0, 3);
  return {
    id: nextPedId++,
    x: corners[startCorner].x + rng.range(-8, 8),
    y: corners[startCorner].y + rng.range(-8, 8),
    corners,
    corner: (startCorner + 1) % 4,
    beach: onBeach,
    speed: rng.range(38, 62),
    phase: rng.range(0, 6),
    color: rng.pick(PED_COLORS),
    skin: rng.pick(SKIN_TONES),
    pauseT: 0,
    fleeT: 0,
    fleeX: 0,
    fleeY: 0,
    down: false,
    downT: 0,
    angle: 0,
  };
}

export function createPedestrians(state) {
  const peds = [];
  for (let i = 0; i < TARGET_PEDS; i += 1) peds.push(makePed(state, state.rng));
  return peds;
}

/** Send every pedestrian near a point running away from it (gunfire, a near miss). */
export function panicNear(state, x, y, radius) {
  for (const ped of state.peds) {
    if (ped.down) continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    if (dx * dx + dy * dy < radius * radius) {
      const d = Math.max(12, Math.hypot(dx, dy));
      ped.fleeX = (dx / d) * 150;
      ped.fleeY = (dy / d) * 150;
      ped.fleeT = state.rng.range(0.7, 1.4);
    }
  }
}

export function updatePedestrians(state, dt) {
  const rng = state.rng;
  for (const ped of state.peds) {
    if (ped.down) {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        // They get up, dust themselves off and walk away.
        ped.down = false;
        ped.fleeT = 1;
        ped.fleeX = rng.range(-90, 90);
        ped.fleeY = rng.range(-90, 90);
      }
      continue;
    }
    let vx = 0;
    let vy = 0;
    let speed = ped.speed;
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      vx = ped.fleeX;
      vy = ped.fleeY;
      speed = 150;
    } else if (ped.pauseT > 0) {
      ped.pauseT -= dt;
    } else {
      const target = ped.beach
        ? { x: ped.corners[ped.corner].x, y: ped.y }
        : ped.corners[ped.corner];
      const dx = target.x - ped.x;
      const dy = target.y - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 7) {
        ped.corner = (ped.corner + 1) % ped.corners.length;
        if (rng.chance(0.16)) ped.pauseT = rng.range(0.6, 2.2);
      } else {
        vx = (dx / d) * speed;
        vy = (dy / d) * speed;
      }
    }
    if (vx !== 0 || vy !== 0) {
      ped.angle = Math.atan2(vx, -vy);
      const [nx, ny] = collideCircle(state.world, ped.x + vx * dt, ped.y + vy * dt, 9);
      ped.x = nx;
      ped.y = ny;
      ped.phase += dt * (speed / 9);
    }
    // Cars bear down: step aside fast.
    for (const car of state.cars) {
      if (car.disabled || Math.abs(car.speed) < 40) continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      if (dx * dx + dy * dy < 52 * 52 && ped.fleeT <= 0) {
        const d = Math.max(10, Math.hypot(dx, dy));
        ped.fleeX = (dx / d) * 160;
        ped.fleeY = (dy / d) * 160;
        ped.fleeT = 0.55;
      }
    }
  }
  // Keep the population topped up near the player.
  if (state.peds.length < TARGET_PEDS) state.peds.push(makePed(state, rng));
}

/** A pedestrian is knocked down: a crime if a car did it at speed (handled by the caller). */
export function knockDown(state, ped) {
  if (ped.down) return;
  ped.down = true;
  ped.downT = state.rng.range(4, 7);
  ped.fleeT = 0;
}

export function drawPedestrian(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(60,30,10,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.down) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.fillRect(-4, -9, 8, 15);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(0, -12, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const swing = Math.sin(ped.phase * 6) * 3.4;
  ctx.strokeStyle = '#2d3142';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-swing, 9);
  ctx.moveTo(0, 2);
  ctx.lineTo(swing, 9);
  ctx.stroke();
  ctx.fillStyle = ped.color;
  ctx.fillRect(-4.4, -5, 8.8, 8.5);
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -8.6, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
