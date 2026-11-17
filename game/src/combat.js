// Combat: Rico's pistol, the bullets it fires, the crew shooters who guard the pier job,
// and the particle sparks every impact throws off. Shooting is loud — pedestrians panic,
// and if the police or a crowd see it, the heat rises. Bullets stop on buildings, bend cars
// (a shot-out interceptor is a serious crime), knock down pedestrians and drop guards.

import { buildingAt } from './world.js';
import { damagePlayer } from './player.js';
import { knockDown, panicNear } from './pedestrians.js';
import { addWanted } from './police.js';

const BULLET_SPEED = 950;
const FIRE_INTERVAL = 0.17;
const GUARD_RANGE = 330;

/** A crew shooter who holds a spot and fires on Rico when he closes in. */
export function createGuard(x, y) {
  return { x, y, health: 100, angle: 0, fireT: 1 + Math.random(), down: false, phase: Math.random() * 6 };
}

export function spawnParticles(state, x, y, color, count, speed = 120) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng.range(0, Math.PI * 2);
    const v = state.rng.range(speed * 0.3, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: state.rng.range(0.25, 0.6),
      maxLife: 0.6,
      color,
      size: state.rng.range(1.6, 3.6),
    });
  }
}

function fireBullet(state, fromX, fromY, angle, hostile) {
  state.bullets.push({
    x: fromX + Math.sin(angle) * 14,
    y: fromY - Math.cos(angle) * 14,
    vx: Math.sin(angle) * BULLET_SPEED,
    vy: -Math.cos(angle) * BULLET_SPEED,
    life: 0.5,
    hostile,
  });
}

function playerShoot(state) {
  const player = state.player;
  fireBullet(state, player.x, player.y, player.angle, false);
  player.fireCooldown = FIRE_INTERVAL;
  state.audio.shot();
  spawnParticles(state, player.x + Math.sin(player.angle) * 16, player.y - Math.cos(player.angle) * 16, '#ffd166', 3, 60);
  panicNear(state, player.x, player.y, 210);
  // Witnessed gunfire is a crime.
  const policeWatching = state.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - player.x, c.y - player.y) < 470);
  const crowdWatching = state.peds.filter((p) => !p.down && Math.hypot(p.x - player.x, p.y - player.y) < 250).length >= 2;
  if ((policeWatching || crowdWatching) && state.time - (state.lastShotCrimeAt ?? -99) > 3) {
    state.lastShotCrimeAt = state.time;
    addWanted(state, 1);
    state.toast = 'Shots fired — witnesses are calling it in!';
    state.toastT = 2.2;
  }
}

function guardShoot(state, guard) {
  const player = state.player;
  const spread = state.rng.range(-0.09, 0.09);
  const angle = Math.atan2(player.x - guard.x, -(player.y - guard.y)) + spread;
  fireBullet(state, guard.x, guard.y, angle, true);
  state.audio.shot();
}

function hitCar(state, bullet, car) {
  car.health -= bullet.hostile ? 4 : 16;
  spawnParticles(state, bullet.x, bullet.y, '#ffd166', 4, 130);
  state.audio.hit();
  if (!bullet.hostile && car.kind === 'police') {
    if (state.time - (state.lastCopShotAt ?? -99) > 2.5) {
      state.lastCopShotAt = state.time;
      addWanted(state, 1);
      state.toast = 'You shot at the Policía!';
      state.toastT = 2.2;
    }
    if (car.health <= 0 && !car.disabled) {
      car.disabled = true;
      car.speed = 0;
      addWanted(state, 1);
      state.toast = 'Interceptor disabled!';
      state.toastT = 2.2;
    }
  }
  if (car.health <= 0 && !car.disabled && car.kind !== 'police') {
    car.disabled = true;
    car.speed = 0;
  }
}

function stepBullet(state, bullet, dt) {
  const steps = 3;
  for (let s = 0; s < steps; s += 1) {
    bullet.x += (bullet.vx * dt) / steps;
    bullet.y += (bullet.vy * dt) / steps;
    if (buildingAt(state.world, bullet.x, bullet.y)) {
      spawnParticles(state, bullet.x, bullet.y, '#d9c9a8', 3, 90);
      return false;
    }
    if (bullet.hostile) {
      const p = state.player;
      const target = p.car ?? p;
      const rr = p.car ? 34 : 12;
      if (Math.hypot(target.x - bullet.x, target.y - bullet.y) < rr) {
        damagePlayer(state, 7);
        spawnParticles(state, bullet.x, bullet.y, '#e4572e', 4, 110);
        return false;
      }
    } else {
      for (const guard of state.guards) {
        if (guard.down) continue;
        if (Math.hypot(guard.x - bullet.x, guard.y - bullet.y) < 12) {
          guard.health -= 34;
          spawnParticles(state, bullet.x, bullet.y, '#e4572e', 5, 120);
          if (guard.health <= 0) {
            guard.down = true;
            state.cashDrops.push({ x: guard.x, y: guard.y, amount: 60, t: 0 });
            state.toast = 'Crew member down — he dropped cash.';
            state.toastT = 2.2;
          }
          return false;
        }
      }
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 10) {
          knockDown(state, ped);
          addWanted(state, 1);
          state.toast = 'You shot a bystander!';
          state.toastT = 2.4;
          return false;
        }
      }
      for (const car of state.cars) {
        if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 32) {
          hitCar(state, bullet, car);
          return false;
        }
      }
    }
  }
  return true;
}

export function updateCombat(state, dt) {
  const player = state.player;
  // Rico fires while the mouse is held, on foot, alive.
  if (!player.car && !player.dead && state.input.mouse.down && player.fireCooldown <= 0 && state.screen === 'play') {
    playerShoot(state);
  }
  // Guards hold their ground and shoot at Rico inside their range.
  for (const guard of state.guards) {
    if (guard.down) continue;
    const target = player.car ?? player;
    const d = Math.hypot(target.x - guard.x, target.y - guard.y);
    guard.angle = Math.atan2(target.x - guard.x, -(target.y - guard.y));
    if (d < GUARD_RANGE && !player.dead && state.mission.index >= 2) {
      guard.fireT -= dt;
      if (guard.fireT <= 0) {
        guard.fireT = state.rng.range(0.7, 1.3);
        guardShoot(state, guard);
      }
    }
  }
  state.bullets = state.bullets.filter((b) => {
    b.life -= dt;
    return b.life > 0 && stepBullet(state, b, dt);
  });
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  // Dropped cash waits to be walked over.
  for (const drop of state.cashDrops) drop.t += dt;
  state.cashDrops = state.cashDrops.filter((drop) => {
    const d = Math.hypot(state.player.x - drop.x, state.player.y - drop.y);
    if (d < 26 && !state.player.car) {
      state.cash += drop.amount;
      state.audio.cash();
      state.toast = `Picked up $${drop.amount}.`;
      state.toastT = 1.6;
      return false;
    }
    return drop.t < 40;
  });
}

export function drawCombat(ctx, state) {
  // Guards: dark clothes, red bandanas, guns toward Rico.
  for (const guard of state.guards) {
    ctx.save();
    ctx.translate(guard.x, guard.y);
    ctx.fillStyle = 'rgba(60,30,10,0.28)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (guard.down) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#33393f';
      ctx.fillRect(-4, -9, 8, 15);
      ctx.fillStyle = '#c68642';
      ctx.beginPath();
      ctx.arc(0, -12, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.rotate(guard.angle);
    ctx.fillStyle = '#33393f';
    ctx.fillRect(-5, -5.5, 10, 9.5);
    ctx.strokeStyle = '#c68642';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(3, -2);
    ctx.lineTo(5, -10);
    ctx.stroke();
    ctx.fillStyle = '#20242a';
    ctx.fillRect(3.8, -15, 2.4, 6);
    ctx.fillStyle = '#c68642';
    ctx.beginPath();
    ctx.arc(0, -8.8, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c1272d';
    ctx.fillRect(-4.6, -11.5, 9.2, 3);
    ctx.restore();
  }
  // Bullets: bright streaks with a soft glow, readable even in a shrunken screenshot.
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? 'rgba(255,190,80,0.35)' : '#fff3c4';
    ctx.lineWidth = pass === 0 ? 6 : 2.6;
    ctx.beginPath();
    for (const b of state.bullets) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    }
    ctx.stroke();
  }
  // Particles.
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Dropped cash.
  for (const drop of state.cashDrops) {
    const bob = Math.sin(state.time * 4 + drop.x) * 2.4;
    ctx.fillStyle = '#2f9e44';
    ctx.fillRect(drop.x - 8, drop.y - 5 + bob, 16, 10);
    ctx.fillStyle = '#e8f5e9';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', drop.x, drop.y + 3 + bob);
  }
}
