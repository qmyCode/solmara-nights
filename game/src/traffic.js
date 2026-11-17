// Traffic: civilian cars that drive Solmara's road grid forever. Each one follows the
// right-hand lane of its road, chooses at every junction whether to go straight or turn
// (the avenue ends at the beach, so the last junction south always turns), brakes for
// whatever is ahead of it — another car, a pedestrian, or the player standing in the road —
// and quietly despawns far away to respawn near the player, so the streets around the
// action are always alive.

import { H_ROADS, SAND_Y, V_ROADS, WORLD_W } from './world.js';
import { CAR_TYPES, createCar } from './vehicles.js';

export const HEADING_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // N, E, S, W
const HEADING_VEC = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
const TARGET_TRAFFIC = 11;
const CRUISE = [135, 185];

function laneOffset(heading) {
  // Right-hand traffic: southbound and eastbound lanes sit at +118, the others at +42.
  return heading === 2 || heading === 1 ? 118 : 42;
}

function spawnTrafficCar(state, rng) {
  const vertical = rng.chance(0.5);
  const heading = vertical ? rng.pick([0, 2]) : rng.pick([1, 3]);
  let x;
  let y;
  if (vertical) {
    const road = rng.pick(V_ROADS);
    x = road.x0 + laneOffset(heading);
    y = state.player.y + rng.range(-950, 950);
    if (y < 200 || y > SAND_Y - 200) y = rng.range(240, SAND_Y - 240);
  } else {
    const road = rng.pick(H_ROADS);
    y = road.y0 + laneOffset(heading);
    x = state.player.x + rng.range(-950, 950);
    if (x < 200 || x > WORLD_W - 200) x = rng.range(240, WORLD_W - 240);
  }
  const type = rng.pick(CAR_TYPES);
  const car = createCar(type, x, y, HEADING_ANGLE[heading], rng.pick(type.colors));
  car.kind = 'traffic';
  car.heading = heading;
  car.cruise = rng.range(CRUISE[0], CRUISE[1]);
  car.decidedAt = null;
  return car;
}

/** The junction centre lines a car travelling its heading will cross, as distances ahead. */
function nextJunction(car) {
  if (car.heading === 0) {
    let best = null;
    for (const h of H_ROADS) {
      const cy = h.y0 + 80;
      if (cy < car.y - 2 && (best === null || cy > best)) best = cy;
    }
    return best === null ? null : { axis: 'y', at: best };
  }
  if (car.heading === 2) {
    let best = null;
    for (const h of H_ROADS) {
      const cy = h.y0 + 80;
      if (cy > car.y + 2 && (best === null || cy < best)) best = cy;
    }
    return best === null ? null : { axis: 'y', at: best };
  }
  if (car.heading === 1) {
    let best = null;
    for (const v of V_ROADS) {
      const cx = v.x0 + 80;
      if (cx > car.x + 2 && (best === null || cx < best)) best = cx;
    }
    return best === null ? null : { axis: 'x', at: best };
  }
  let best = null;
  for (const v of V_ROADS) {
    const cx = v.x0 + 80;
    if (cx < car.x - 2 && (best === null || cx > best)) best = cx;
  }
  return best === null ? null : { axis: 'x', at: best };
}

/** Is the junction at the edge of the drivable grid, where going straight is impossible? */
function mustTurn(car, junction) {
  if (car.heading === 2 && junction.at >= 2360) return true; // beach avenue ends
  if (car.heading === 0 && junction.at <= 80) return true;
  if (car.heading === 1 && junction.at >= 3080) return true;
  if (car.heading === 3 && junction.at <= 80) return true;
  return false;
}

function turnOnto(car, junction, rng) {
  const left = (car.heading + 3) % 4;
  const right = (car.heading + 1) % 4;
  const newHeading = mustTurn(car, junction) ? (rng.chance(0.5) ? left : right) : rng.chance(0.5) ? left : right;
  if (car.heading === 0 || car.heading === 2) {
    // Crossing a horizontal road: the new lane is that road's, at the junction's y band.
    const road = H_ROADS.find((h) => h.y0 + 80 === junction.at);
    car.y = road.y0 + laneOffset(newHeading);
  } else {
    const road = V_ROADS.find((v) => v.x0 + 80 === junction.at);
    car.x = road.x0 + laneOffset(newHeading);
  }
  car.heading = newHeading;
  car.decidedAt = junction.at;
}

/** Something solid ahead in this car's lane? Returns the gap in pixels, or Infinity. */
function obstacleAhead(state, car) {
  const vec = HEADING_VEC[car.heading];
  let gap = Infinity;
  const probe = (ox, oy, radius) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const along = dx * vec.x + dy * vec.y;
    const across = Math.abs(dx * vec.y - dy * vec.x);
    if (along > 0 && along < 120 && across < 22 + radius) gap = Math.min(gap, along - radius);
  };
  for (const other of state.cars) {
    if (other === car || other.disabled) continue;
    probe(other.x, other.y, 24);
  }
  if (!state.player.car) probe(state.player.x, state.player.y, 12);
  for (const ped of state.peds) {
    if (ped.down) continue;
    probe(ped.x, ped.y, 10);
  }
  return gap;
}

export function updateTraffic(state, dt) {
  const rng = state.rng;
  // Keep the population steady around the player.
  const traffic = state.cars.filter((c) => c.kind === 'traffic');
  for (const car of traffic) {
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    if (dx * dx + dy * dy > 1600 * 1600) {
      state.cars.splice(state.cars.indexOf(car), 1);
    }
  }
  let count = state.cars.reduce((n, c) => n + (c.kind === 'traffic' ? 1 : 0), 0);
  while (count < TARGET_TRAFFIC) {
    const car = spawnTrafficCar(state, rng);
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    if (dx * dx + dy * dy < 420 * 420) break;
    state.cars.push(car);
    count += 1;
  }

  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.disabled) continue;
    const junction = nextJunction(car);
    if (junction) {
      const pos = junction.axis === 'y' ? car.y : car.x;
      const vec = HEADING_VEC[car.heading];
      const along = junction.axis === 'y' ? vec.y : vec.x;
      const crossed = along > 0 ? pos >= junction.at : pos <= junction.at;
      if (crossed && car.decidedAt !== junction.at) {
        if (mustTurn(car, junction) || rng.chance(0.42)) turnOnto(car, junction, rng);
        else car.decidedAt = junction.at;
      }
    }
    const gap = obstacleAhead(state, car);
    const target = gap < 52 ? 0 : gap < 110 ? car.cruise * 0.45 : car.cruise;
    car.speed += Math.max(-380 * dt, Math.min(150 * dt, target - car.speed));
    const vec = HEADING_VEC[car.heading];
    car.x += vec.x * car.speed * dt;
    car.y += vec.y * car.speed * dt;
    const want = HEADING_ANGLE[car.heading];
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += diff * Math.min(1, dt * 7);
  }
}
