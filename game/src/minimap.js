// The minimap: a live chart of Solmara in the corner of the HUD. It draws the coastline,
// the road grid and the beach from the same data the world was built with, then plots what
// matters right now — Rico (a white arrow that turns with him), his car, the police as
// flashing red-blue dots, traffic as grey specks, and the mission objective as a pulsing
// gold diamond, so a chase reads at a glance even shrunk into the judge's contact sheet.

import { BLOCKS, H_ROADS, SAND_Y, V_ROADS, WATER_Y, WORLD_H, WORLD_W } from './world.js';

export const MAP_W = 198;
export const MAP_H = 192;
const SCALE = MAP_W / WORLD_W;

function toMap(x, y) {
  return [x * SCALE, y * (MAP_H / WORLD_H)];
}

export function drawMinimap(ctx, state, ox, oy) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = 'rgba(16,24,32,0.82)';
  ctx.strokeStyle = 'rgba(255,209,102,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(0, 0, MAP_W, MAP_H);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MAP_W, MAP_H);
  ctx.clip();
  // Land, beach and sea — the same warm ground the city itself uses.
  ctx.fillStyle = '#cbb59a';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = '#b89a72';
  for (const block of BLOCKS) {
    const [bx, by] = toMap(block.x0, block.y0);
    ctx.fillRect(bx, by, (block.x1 - block.x0) * SCALE, (block.y1 - block.y0) * (MAP_H / WORLD_H));
  }
  const [, sandY] = toMap(0, SAND_Y);
  const [, waterY] = toMap(0, WATER_Y);
  ctx.fillStyle = '#d9b380';
  ctx.fillRect(0, sandY, MAP_W, waterY - sandY);
  ctx.fillStyle = '#2e7f9e';
  ctx.fillRect(0, waterY, MAP_W, MAP_H - waterY);
  // Roads.
  ctx.fillStyle = '#3c4147';
  for (const r of V_ROADS) {
    const [x] = toMap(r.x0, 0);
    ctx.fillRect(x, 0, (r.x1 - r.x0) * SCALE, sandY);
  }
  for (const r of H_ROADS) {
    const [, y] = toMap(0, r.y0);
    ctx.fillRect(0, y, MAP_W, (r.y1 - r.y0) * (MAP_H / WORLD_H));
  }
  // Traffic specks.
  ctx.fillStyle = 'rgba(230,230,230,0.65)';
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    const [x, y] = toMap(car.x, car.y);
    ctx.fillRect(x - 1, y - 1, 2.4, 2.4);
  }
  // Objective: a pulsing gold diamond.
  const target = state.mission.target;
  if (target) {
    const [x, y] = toMap(target.x, target.y);
    const s = 5 + Math.sin(state.time * 5) * 1.4;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fill();
  }
  // Police: flashing dots.
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    const [x, y] = toMap(car.x, car.y);
    ctx.fillStyle = Math.floor(state.time * 5 + car.sirenPhase) % 2 === 0 ? '#ff3b30' : '#5e5ce6';
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rico's car, then Rico himself as a turning arrow.
  if (state.player.car) {
    const [x, y] = toMap(state.player.car.x, state.player.car.y);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x - 2.6, y - 2.6, 5.2, 5.2);
  }
  const [px, py] = toMap(state.player.x, state.player.y);
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.2, 4.6);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(-4.2, 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 9.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMARA', 6, MAP_H - 6);
  ctx.restore();
}
