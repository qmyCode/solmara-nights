// The Policía de Solmara. Wanted stars summon interceptor cars that stream in from the
// edge of the action and hunt the player — steering freely across the city (they are not
// bound to lanes), ramming the player's car, and boxing the player in. Stay pinned at low
// speed next to an officer long enough and you are busted: a fine, a trip to the
// Comisaría, and a clean slate. Lose them — no crime, no eyes on you — and the heat fades.

import { WORLD_H, WORLD_W } from './world.js';
import { createPoliceCar, driveCar } from './vehicles.js';

const SPAWN_DISTANCE = 780;
const DESPAWN_DISTANCE = 1500;
const BUST_SECONDS = 2.4;

/** How many interceptors a wanted level fields. */
export function wantedCarCount(wanted) {
  return [0, 1, 2, 3, 4, 5][Math.max(0, Math.min(5, wanted))];
}

function spawnInterceptor(state) {
  const angle = state.rng.range(0, Math.PI * 2);
  const x = Math.max(60, Math.min(WORLD_W - 60, state.player.x + Math.cos(angle) * SPAWN_DISTANCE));
  const y = Math.max(60, Math.min(WORLD_H - 60, state.player.y + Math.sin(angle) * SPAWN_DISTANCE));
  const car = createPoliceCar(x, y, 0);
  state.cars.push(car);
}

/** Raise (or set) the heat. Crime severity also feeds the HUD toast in main.js. */
export function addWanted(state, amount) {
  state.wanted = Math.max(0, Math.min(5, state.wanted + amount));
  state.lastCrimeAt = state.time;
}

export function updatePolice(state, dt) {
  const police = state.cars.filter((c) => c.kind === 'police');
  const want = wantedCarCount(state.wanted);
  if (police.length < want) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnInterceptor(state);
      state.spawnTimer = 1.6;
    }
  }
  let anyNear = false;
  let busting = false;
  for (const car of police) {
    const dx = state.player.x - car.x;
    const dy = state.player.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist > DESPAWN_DISTANCE && police.length > want) {
      state.cars.splice(state.cars.indexOf(car), 1);
      continue;
    }
    if (dist < 460) anyNear = true;
    if (car.disabled) continue;
    // Steer at the player's near-future position; ram speed scales with the heat.
    const target = state.player.car ?? state.player;
    const lead = Math.min(0.55, dist / 700);
    const tx = target.x + (target.vx ?? 0) * lead;
    const ty = target.y + (target.vy ?? 0) * lead;
    const wantAngle = Math.atan2(tx - car.x, -(ty - car.y));
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const close = dist < 90;
    const throttle = close && Math.abs(diff) > 2.2 ? -1 : 1;
    driveCar(state, car, { throttle, steer }, dt, 0.86 + state.wanted * 0.045);
    // Bust pressure: pinned next to an officer while barely moving.
    const playerSpeed = state.player.car ? Math.abs(state.player.car.speed) : Math.hypot(state.player.vx ?? 0, state.player.vy ?? 0);
    if (dist < 74 && playerSpeed < 42) {
      car.bustTime += dt;
      if (car.bustTime > 0.4) busting = true;
      if (car.bustTime >= BUST_SECONDS && !state.player.dead) {
        bustPlayer(state);
        car.bustTime = 0;
      }
    } else {
      car.bustTime = Math.max(0, car.bustTime - dt * 2);
    }
  }
  state.policeNear = anyNear;
  state.busting = busting;
  // Heat fades when nothing criminal has happened for a while and nobody is watching.
  if (state.wanted > 0 && state.time - state.lastCrimeAt > 26 && !anyNear) {
    state.wanted -= 1;
    state.lastCrimeAt = state.time - 12;
    state.toast = state.wanted === 0 ? 'You lost the heat.' : 'The heat is fading…';
    state.toastT = 2.4;
  }
}

/** Busted: fine, respawn outside the Comisaría, wanted cleared, car left where it was. */
export function bustPlayer(state) {
  const fine = Math.min(state.cash, Math.max(50, Math.round(state.cash * 0.2)));
  state.cash -= fine;
  if (state.player.car) {
    state.player.car.kind = 'parked';
    state.player.car = null;
  }
  state.player.x = 3080;
  state.player.y = 480;
  state.player.health = Math.max(state.player.health, 70);
  state.wanted = 0;
  state.bustedFlash = 1.6;
  state.toast = `BUSTED — the Policía fined you $${fine}.`;
  state.toastT = 3.4;
  state.audio.busted();
  state.onBusted?.();
}
