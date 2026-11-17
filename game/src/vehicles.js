// Cars: the shared entity every driver in Solmara uses — traffic, parked cars waiting to be
// stolen, police interceptors and whatever the player is driving right now. This module
// builds cars, places the parked ones along the curbs, steps the driving physics (throttle,
// steering, friction, surface grip, collision damage) and draws a car with its wheels,
// windows, lights and damage smoke.

import { BLOCKS, H_ROADS, SAND_Y, V_ROADS, collideCircle, surfaceAt } from './world.js';

export const CAR_W = 36;
export const CAR_L = 64;

/** Body styles: name, paint choices and how lively the car is. */
export const CAR_TYPES = [
  { kind: 'compact', label: 'Brisa Compact', colors: ['#d94f30', '#3f88c5', '#f2b134', '#7fb069'], maxSpeed: 300, accel: 250 },
  { kind: 'sedan', label: 'Coral Sedan', colors: ['#ece5d8', '#40434a', '#8c2f39', '#26547c'], maxSpeed: 330, accel: 265 },
  { kind: 'taxi', label: 'Taxi Sol', colors: ['#ffc61a'], maxSpeed: 315, accel: 255 },
  { kind: 'van', label: 'Duna Van', colors: ['#e8e3d9', '#5b8e7d', '#bc4b51'], maxSpeed: 275, accel: 220 },
  { kind: 'sport', label: 'Vela GT', colors: ['#ef476f', '#118ab2', '#06d6a0', '#ffd166'], maxSpeed: 395, accel: 330 },
  { kind: 'pickup', label: 'Costa Pickup', colors: ['#6a4c93', '#1982c4', '#8ac926'], maxSpeed: 320, accel: 260 },
];

let nextCarId = 1;

/** A fresh car of the given type at a pose. kind tags who owns its behaviour. */
export function createCar(type, x, y, angle, color) {
  return {
    id: nextCarId++,
    type,
    kind: 'parked', // 'parked' | 'traffic' | 'police' | 'player'
    x,
    y,
    angle,
    speed: 0,
    steer: 0,
    color,
    health: 100,
    w: CAR_W,
    l: CAR_L,
    // traffic brain (traffic.js): current road, heading and the junction it aims for
    road: null,
    heading: 0,
    decidedAt: null,
    // police brain (police.js)
    bustTime: 0,
    disabled: false,
    sirenPhase: Math.random() * 6,
  };
}

export function createPoliceCar(x, y, angle) {
  const car = createCar(CAR_TYPES[1], x, y, angle, '#f4f6f8');
  car.kind = 'police';
  car.maxSpeedBonus = 26;
  return car;
}

/** Parked, stealable cars along the curbs of every block, plus a few at the beach. */
export function createParkedCars(world, rng) {
  const cars = [];
  const spots = [];
  for (const block of BLOCKS) {
    // In the block's parking bay (the clear ring inside the sidewalk), never in a lane.
    spots.push({ x: block.x0 + 27, y: (block.y0 + block.y1) / 2 - 90, angle: 0 });
    spots.push({ x: block.x1 - 27, y: (block.y0 + block.y1) / 2 + 90, angle: Math.PI });
    spots.push({ x: (block.x0 + block.x1) / 2 - 110, y: block.y0 + 27, angle: Math.PI / 2 });
    spots.push({ x: (block.x0 + block.x1) / 2 + 110, y: block.y1 - 27, angle: -Math.PI / 2 });
  }
  spots.push({ x: 420, y: SAND_Y + 34, angle: Math.PI / 2 });
  spots.push({ x: 2350, y: SAND_Y + 34, angle: Math.PI / 2 });
  for (const spot of spots) {
    if (cars.length >= 24) break;
    if (rng.chance(0.22)) continue;
    const type = rng.pick(CAR_TYPES);
    const car = createCar(type, spot.x, spot.y, spot.angle, rng.pick(type.colors));
    cars.push(car);
  }
  return cars;
}

/** The car's four corners in world space (for collision and drawing checks). */
export function carCorners(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const hl = car.l / 2;
  const hw = car.w / 2;
  return [
    { x: car.x + c * hl - s * hw, y: car.y + s * hl + c * hw },
    { x: car.x + c * hl + s * hw, y: car.y + s * hl - c * hw },
    { x: car.x - c * hl + s * hw, y: car.y - s * hl - c * hw },
    { x: car.x - c * hl - s * hw, y: car.y - s * hl + c * hw },
  ];
}

export function carsOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < 58 * 58;
}

/**
 * Step one driven car. input is {throttle: -1..1, steer: -1..1}; maxScale lets traffic and
 * police cap their pace. Returns the impact speed when the car struck something, else 0.
 */
export function driveCar(state, car, input, dt, maxScale = 1) {
  const surface = surfaceAt(car.x, car.y);
  const grip = surface === 'sand' ? 0.55 : surface === 'ground' ? 0.8 : 1;
  const maxSpeed = car.type.maxSpeed * grip * maxScale + (car.maxSpeedBonus ?? 0);
  const maxReverse = 120 * grip;
  if (input.throttle > 0) car.speed += car.type.accel * grip * dt;
  else if (input.throttle < 0) car.speed -= (car.speed > 0 ? 420 : car.type.accel * 0.7) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 130 * dt);
  car.speed = Math.max(-maxReverse, Math.min(maxSpeed, car.speed));
  if (car.speed > maxSpeed) car.speed = Math.max(maxSpeed, car.speed - 300 * dt);
  car.steer = input.steer;
  const turnRate = 2.35 * Math.min(1, Math.abs(car.speed) / 130) * (car.speed < 0 ? -1 : 1);
  car.angle += input.steer * turnRate * dt;

  const vx = Math.sin(car.angle) * car.speed;
  const vy = -Math.cos(car.angle) * car.speed;
  car.vx = vx;
  car.vy = vy;
  const nx = car.x + vx * dt;
  const ny = car.y + vy * dt;
  const [cx, cy, hit] = collideCircle(state.world, nx, ny, 27);
  let impact = 0;
  if (hit) {
    const lost = Math.abs(car.speed) * (Math.abs(cx - nx) + Math.abs(cy - ny) > 2 ? 0.55 : 0.25);
    if (Math.abs(car.speed) > 90) impact = Math.abs(car.speed);
    car.health -= lost * 0.12;
    car.speed *= 0.45;
    if (cx !== nx) car.x = cx;
    if (cy !== ny) car.y = cy;
  } else {
    car.x = nx;
    car.y = ny;
  }
  if (car.health <= 0 && !car.disabled) {
    car.disabled = true;
    car.speed = 0;
  }
  return impact;
}

/** Draw one car, top-down, nose toward its angle. Police get a light bar that flashes. */
export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(60,30,10,0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 5, car.w / 2 + 3, car.l / 2 + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1c1c1e';
  const wy = car.l / 2 - 13;
  const wx = car.w / 2 - 3;
  ctx.fillRect(-wx - 3, -wy - 5, 7, 12);
  ctx.fillRect(wx - 4, -wy - 5, 7, 12);
  ctx.fillRect(-wx - 3, wy - 7, 7, 12);
  ctx.fillRect(wx - 4, wy - 7, 7, 12);
  // Body.
  ctx.fillStyle = car.disabled ? '#55504c' : car.color;
  roundRect(ctx, -car.w / 2, -car.l / 2, car.w, car.l, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  roundRect(ctx, -car.w / 2 + 3, -car.l / 2 + 4, car.w - 6, 13, 6);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = '#22303c';
  roundRect(ctx, -car.w / 2 + 4, -car.l / 2 + 17, car.w - 8, 15, 4);
  ctx.fill();
  roundRect(ctx, -car.w / 2 + 4, 2, car.w - 8, 12, 4);
  ctx.fill();
  ctx.fillStyle = car.disabled ? '#3a3a3a' : shade(car.color, -28);
  roundRect(ctx, -car.w / 2 + 3, -car.l / 2 + 33, car.w - 6, car.l / 2 - 26, 5);
  ctx.fill();
  if (car.type.kind === 'taxi') {
    ctx.fillStyle = '#20242a';
    ctx.fillRect(-8, -6, 16, 9);
    ctx.fillStyle = '#ffc61a';
    ctx.font = '700 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 1);
  }
  if (car.kind === 'police') {
    ctx.fillStyle = '#26547c';
    ctx.fillRect(-car.w / 2, -8, car.w, 15);
    ctx.fillStyle = '#f4f6f8';
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICÍA', 0, 2);
    // Light bar: red and blue alternate with the siren phase.
    const phase = Math.floor(time * 5 + car.sirenPhase) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#5e5ce6';
    ctx.fillRect(-11, -13, 10, 6);
    ctx.fillStyle = phase ? '#5e5ce6' : '#ff3b30';
    ctx.fillRect(1, -13, 10, 6);
    ctx.fillStyle = phase ? 'rgba(255,59,48,0.20)' : 'rgba(94,92,230,0.20)';
    ctx.beginPath();
    ctx.arc(0, -10, 44, 0, Math.PI * 2);
    ctx.fill();
  }
  // Headlights and tail lights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(-car.w / 2 + 3, -car.l / 2, 7, 3.4);
  ctx.fillRect(car.w / 2 - 10, -car.l / 2, 7, 3.4);
  ctx.fillStyle = '#c1272d';
  ctx.fillRect(-car.w / 2 + 3, car.l / 2 - 3.4, 7, 3.4);
  ctx.fillRect(car.w / 2 - 10, car.l / 2 - 3.4, 7, 3.4);
  ctx.restore();
  if (car.disabled) {
    ctx.fillStyle = 'rgba(40,40,40,0.5)';
    ctx.beginPath();
    ctx.arc(car.x + Math.sin(time * 2 + car.id) * 3, car.y - 16 - (time * 9 + car.id * 7) % 14, 6 + ((time * 9 + car.id * 7) % 14) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 0xff) + amount);
  const b = clamp((n & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}
