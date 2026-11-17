// The city of Solmara: a sunset coastal grid invented for this game. This module generates
// the static city (road grid, named buildings, beach, water, pier, palms, lamps, umbrellas),
// answers every spatial question the other modules ask (Is this water? A road? Which building
// is here?), resolves circle collision against buildings, water and the world edge, and paints
// the whole static city once onto an offscreen canvas that the frame loop blits from.

export const WORLD_W = 3160;
export const WORLD_H = 3080;
export const ROAD_W = 160;
export const SAND_Y = 2440; // beach sand starts here
export const WATER_Y = 2760; // open water starts here
export const PIER = { x: 1480, y: WATER_Y - 30, w: 120, h: 330 };

/** Vertical roads as x ranges, west to east. */
export const V_ROADS = [
  { x0: 0, x1: 160 },
  { x0: 1000, x1: 1160 },
  { x0: 2000, x1: 2160 },
  { x0: 3000, x1: 3160 },
];
/** Horizontal roads as y ranges, north to south. */
export const H_ROADS = [
  { y0: 0, y1: 160 },
  { y0: 760, y1: 920 },
  { y0: 1520, y1: 1680 },
  { y0: 2280, y1: 2440 },
];
/** City blocks between the roads: {x0, y0, x1, y1}, three by three. */
export const BLOCKS = [];
for (let row = 0; row < 3; row += 1) {
  for (let col = 0; col < 3; col += 1) {
    BLOCKS.push({
      col,
      row,
      x0: V_ROADS[col].x1,
      x1: V_ROADS[col + 1].x0,
      y0: H_ROADS[row].y1,
      y1: H_ROADS[row + 1].y0,
    });
  }
}

/**
 * Building names for the ordinary lots — exactly one per non-key lot. The four story
 * buildings (KEY_LOTS below) are deliberately NOT in this list: a name that appeared twice
 * would send buildingNamed() — and with it missions and respawns — to the wrong building.
 */
const BUILDING_NAMES = [
  'Hotel Brisa Grande', 'Banco del Mar', 'Torre Coral', 'Mercado Sol',
  'Palms Casino', 'Cine Litoral', 'Edificio Perla', 'Farmacia Luz',
  'Taller Rueda', 'Gimnasio Ola', 'Librería Alba', 'Restaurante Faro',
  'Pizzería Costa', 'Oficinas Brisa', 'Club Náutico', 'Bar Mirlo',
  'Hotel Ola Azul', 'Tienda Vela', 'Joyas Mar', 'Teatro Brisa',
  'Hotel Palmeras', 'Café Duna', 'Banco Coral', 'Villa Serena',
  'Mercado Norte', 'Torre Faro', 'Clínica del Sol', 'Bar Terraza',
  'Hotel Miramar', 'Oficinas Puerto', 'Cine Coral', 'Casa Limón',
];
/** Lots that must carry a story name: "col,row,lot" -> name. */
const KEY_LOTS = {
  '0,1,1': 'Clínica Solmara',
  '2,0,2': 'Comisaría Central',
  '1,0,0': 'Café Brisa',
  '1,2,1': 'Almacén del Puerto',
};
const ROOF_COLORS = ['#e07856', '#e8a06a', '#d95f4b', '#e58e6d', '#c96f4a', '#df8f5f'];
const WALL_COLORS = ['#f2d5a0', '#f0e0b6', '#eecfae', '#f5e3c0', '#ecd3ac'];

/** Generate the whole static city from the seeded rng. */
export function createWorld(rng) {
  const buildings = [];
  let nameIndex = 0;
  for (const block of BLOCKS) {
    // A 54px ring inside each block stays clear of buildings: sidewalk, then a parking bay
    // where the stealable cars sit (see vehicles.js), then the building lots themselves.
    const inner = { x0: block.x0 + 54, y0: block.y0 + 54, x1: block.x1 - 54, y1: block.y1 - 54 };
    const midX = (inner.x0 + inner.x1) / 2;
    const midY = (inner.y0 + inner.y1) / 2;
    const lots = [
      { x: inner.x0, y: inner.y0, w: midX - inner.x0 - 16, h: midY - inner.y0 - 16 },
      { x: midX + 16, y: inner.y0, w: inner.x1 - midX - 16, h: midY - inner.y0 - 16 },
      { x: inner.x0, y: midY + 16, w: midX - inner.x0 - 16, h: inner.y1 - midY - 16 },
      { x: midX + 16, y: midY + 16, w: inner.x1 - midX - 16, h: inner.y1 - midY - 16 },
    ];
    lots.forEach((lot, lotIndex) => {
      const key = `${block.col},${block.row},${lotIndex}`;
      // Only ordinary lots consume a name from the list (the ?? short-circuits for key
      // lots), so each of the 32 names lands on exactly one building.
      const name = KEY_LOTS[key] ?? BUILDING_NAMES[nameIndex++];
      buildings.push({
        ...lot,
        name,
        wall: rng.pick(WALL_COLORS),
        roof: rng.pick(ROOF_COLORS),
        floors: rng.int(2, 6),
      });
    });
  }

  const palms = [];
  for (let x = 90; x < WORLD_W; x += 210) palms.push({ x: x + rng.range(-24, 24), y: SAND_Y + 46, s: rng.range(0.85, 1.25) });
  for (const block of BLOCKS) {
    palms.push({ x: block.x0 + 16, y: block.y0 + 16, s: rng.range(0.7, 1) });
    palms.push({ x: block.x1 - 16, y: block.y1 - 16, s: rng.range(0.7, 1) });
  }
  const umbrellas = [];
  for (let i = 0; i < 16; i += 1) {
    umbrellas.push({ x: rng.range(140, WORLD_W - 140), y: rng.range(SAND_Y + 120, WATER_Y - 60), c: rng.pick(['#e4572e', '#f2a03d', '#2e86ab', '#e56399']) });
  }
  const lamps = [];
  for (const road of V_ROADS) for (let y = 260; y < SAND_Y; y += 300) lamps.push({ x: road.x0 + 8, y });
  for (const road of H_ROADS) for (let x = 260; x < WORLD_W; x += 300) lamps.push({ x, y: road.y0 + 8 });

  return { buildings, palms, umbrellas, lamps };
}

/** The named building whose lot holds the point, or null. */
export function buildingAt(world, x, y) {
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/** Find a building by its exact name (story locations). */
export function buildingNamed(world, name) {
  return world.buildings.find((b) => b.name === name) ?? null;
}

export function isWater(x, y) {
  if (y < WATER_Y) return false;
  if (x >= PIER.x && x <= PIER.x + PIER.w && y <= PIER.y + PIER.h) return false;
  return true;
}

export function onPier(x, y) {
  return x >= PIER.x && x <= PIER.x + PIER.w && y >= PIER.y && y <= PIER.y + PIER.h;
}

export function isOnRoad(x, y) {
  if (y >= SAND_Y) return false;
  for (const r of V_ROADS) if (x >= r.x0 && x <= r.x1) return true;
  for (const r of H_ROADS) if (y >= r.y0 && y <= r.y1) return true;
  return false;
}

/** 'water' | 'sand' | 'road' | 'ground' — cars slow down off the asphalt. */
export function surfaceAt(x, y) {
  if (isWater(x, y)) return 'water';
  if (y >= SAND_Y) return 'sand';
  return isOnRoad(x, y) ? 'road' : 'ground';
}

/**
 * Move a circle to (nx, ny), sliding it out of buildings, out of the water (unless it is on
 * the pier) and inside the world. Returns [x, y, hit] where hit says a wall stopped it.
 */
export function collideCircle(world, nx, ny, r) {
  let hit = false;
  let x = Math.max(r, Math.min(WORLD_W - r, nx));
  let y = Math.max(r, Math.min(WORLD_H - r, ny));
  if (isWater(x, y)) {
    y = WATER_Y - r;
    hit = true;
  }
  if (onPier(x, y)) {
    x = Math.max(PIER.x + r * 0.6, Math.min(PIER.x + PIER.w - r * 0.6, x));
  }
  for (const b of world.buildings) {
    const cx = Math.max(b.x, Math.min(b.x + b.w, x));
    const cy = Math.max(b.y, Math.min(b.y + b.h, y));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Centre inside the lot: push out along the smallest exit.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return [x, y, hit];
}

/** Paint the static city onto a full-world offscreen canvas; returns the canvas. */
export function renderWorldCanvas(world) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext('2d');

  // Sea: a sunset gradient with a glitter path under the low sun.
  const sea = ctx.createLinearGradient(0, WATER_Y, 0, WORLD_H);
  sea.addColorStop(0, '#7fc4c9');
  sea.addColorStop(0.25, '#3f97ad');
  sea.addColorStop(1, '#1f6f8f');
  ctx.fillStyle = sea;
  ctx.fillRect(0, WATER_Y, WORLD_W, WORLD_H - WATER_Y);
  ctx.fillStyle = 'rgba(255,190,90,0.35)';
  for (let i = 0; i < 130; i += 1) {
    const gx = 1290 + ((i * 173) % 560) - 280;
    const gy = WATER_Y + 14 + ((i * 97) % (WORLD_H - WATER_Y - 30));
    ctx.fillRect(gx, gy, 22 + (i % 4) * 9, 2.4);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  for (let i = 0; i < 220; i += 1) {
    const gx = (i * 389) % WORLD_W;
    const gy = WATER_Y + 10 + ((i * 211) % (WORLD_H - WATER_Y - 24));
    ctx.fillRect(gx, gy, 15, 2);
  }

  // Sand, then the paved promenade along the top of the beach.
  ctx.fillStyle = '#ecd29f';
  ctx.fillRect(0, SAND_Y, WORLD_W, WORLD_H - SAND_Y);
  ctx.fillStyle = '#e6c88f';
  for (let i = 0; i < 260; i += 1) ctx.fillRect((i * 613) % WORLD_W, SAND_Y + ((i * 271) % (WATER_Y - SAND_Y)), 5, 3);
  ctx.fillStyle = '#d9b380';
  ctx.fillRect(0, SAND_Y, WORLD_W, 64);
  ctx.fillStyle = '#c9a26d';
  for (let x = 0; x < WORLD_W; x += 46) ctx.fillRect(x, SAND_Y, 2, 64);

  // City ground, then the roads over it.
  ctx.fillStyle = '#cbb59a';
  ctx.fillRect(0, 0, WORLD_W, SAND_Y);
  ctx.fillStyle = '#4a4443';
  for (const r of V_ROADS) ctx.fillRect(r.x0, 0, ROAD_W, SAND_Y);
  for (const r of H_ROADS) ctx.fillRect(0, r.y0, WORLD_W, ROAD_W);
  // Lane dashes.
  ctx.fillStyle = '#e8d9a0';
  for (const r of V_ROADS) for (let y = 14; y < SAND_Y; y += 44) ctx.fillRect(r.x0 + ROAD_W / 2 - 2, y, 4, 24);
  for (const r of H_ROADS) for (let x = 14; x < WORLD_W; x += 44) ctx.fillRect(x, r.y0 + ROAD_W / 2 - 2, 24, 4);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(240,240,230,0.75)';
  for (const v of V_ROADS) {
    for (const h of H_ROADS) {
      for (let i = 0; i < 5; i += 1) {
        ctx.fillRect(v.x0 + 12 + i * 28, h.y0 + 6, 15, 5);
        ctx.fillRect(v.x0 + 12 + i * 28, h.y1 - 11, 15, 5);
      }
    }
  }

  // Blocks: sidewalk apron, inner plaza, then the buildings themselves.
  for (const block of BLOCKS) {
    ctx.fillStyle = '#e0cdb0';
    ctx.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
    ctx.fillStyle = '#d6bf9c';
    ctx.fillRect(block.x0 + 26, block.y0 + 26, block.x1 - block.x0 - 52, block.y1 - block.y0 - 52);
  }
  for (const b of world.buildings) {
    ctx.fillStyle = 'rgba(90,50,20,0.25)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 12);
    // Rooftop clutter — air-conditioning boxes, a stair bulkhead, a water tank — placed by
    // a hash of the lot's position so every roof differs but never changes between visits.
    const hash = (b.x * 31 + b.y * 17) % 997;
    ctx.fillStyle = 'rgba(70,40,20,0.20)';
    ctx.fillRect(b.x + 24 + (hash % 60), b.y + 26, 34, 22);
    ctx.fillRect(b.x + b.w - 66 - (hash % 40), b.y + b.h - 52, 40, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(b.x + b.w / 2 - 21, b.y + 24 + (hash % 30), 42, 30);
    ctx.strokeStyle = 'rgba(70,40,20,0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 18, b.y + 18, b.w - 36, b.h - 36);
    ctx.fillStyle = 'rgba(60,30,10,0.55)';
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 6, b.w - 26);
  }

  // The pier: planks out into the water from the promenade.
  ctx.fillStyle = '#a97c50';
  ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
  ctx.fillStyle = '#8a6238';
  for (let y = PIER.y; y < PIER.y + PIER.h; y += 18) ctx.fillRect(PIER.x, y, PIER.w, 3);
  ctx.fillRect(PIER.x, PIER.y, 5, PIER.h);
  ctx.fillRect(PIER.x + PIER.w - 5, PIER.y, 5, PIER.h);

  // Beach umbrellas.
  for (const u of world.umbrellas) {
    ctx.fillStyle = 'rgba(90,50,20,0.18)';
    ctx.beginPath();
    ctx.ellipse(u.x + 5, u.y + 6, 17, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = u.c;
    ctx.beginPath();
    ctx.arc(u.x, u.y, 16, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(u.x - 1.5, u.y, 3, 13);
  }
  // Palms: a curved trunk and a crown of fronds.
  for (const p of world.palms) {
    ctx.strokeStyle = '#8a6238';
    ctx.lineWidth = 5 * p.s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + 5 * p.s, p.y - 16 * p.s, p.x + 10 * p.s, p.y - 26 * p.s);
    ctx.stroke();
    ctx.strokeStyle = '#3f8f5f';
    ctx.lineWidth = 3.4 * p.s;
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(p.x + 10 * p.s, p.y - 26 * p.s);
      ctx.quadraticCurveTo(
        p.x + 10 * p.s + Math.cos(a) * 15 * p.s,
        p.y - 26 * p.s + Math.sin(a) * 8 * p.s - 5 * p.s,
        p.x + 10 * p.s + Math.cos(a) * 24 * p.s,
        p.y - 26 * p.s + Math.sin(a) * 13 * p.s + 3 * p.s,
      );
      ctx.stroke();
    }
  }
  // Street lamps: a warm pool of light on the asphalt.
  for (const l of world.lamps) {
    ctx.fillStyle = 'rgba(255,190,90,0.20)';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
