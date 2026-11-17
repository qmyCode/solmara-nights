// Solmara Nights — boot and the one loop. Builds the game state (city, cars, crowds,
// police, missions), advances it in fixed 1/60 s steps, and paints: the pre-rendered city,
// the mission beacon, pickups, pedestrians, cars, Rico, combat effects, then the HUD.
// Screens: title (the city idles behind it), play, paused. ?seed=N fixes the city;
// ?shot=cover|driving|chase|mission&seed=1 stages a frozen scene for the screenshots and
// sets window.__shotReady. window.__game exposes the live state for testing.

import { createRng } from './rng.js';
import { WORLD_H, WORLD_W, createWorld, renderWorldCanvas } from './world.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createParkedCars, drawCar } from './vehicles.js';
import { updateTraffic } from './traffic.js';
import { createPedestrians, drawPedestrian, updatePedestrians } from './pedestrians.js';
import { updatePolice } from './police.js';
import { createPlayer, drawPlayer, toggleCar, updatePlayer } from './player.js';
import { createGuard, drawCombat, updateCombat } from './combat.js';
import { beginStory, drawMissionMarker, onEnterCar, resumeStory, updateMissions } from './missions.js';
import { createPickups, drawPickups, updatePickups } from './pickups.js';
import { drawHUD, drawPauseScreen, drawTitleScreen } from './hud.js';
import { loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const START_POS = { x: 430, y: 2500 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

/** Assemble a complete, fresh game state for the given seed. */
export function createGame(seed) {
  const rng = createRng(seed);
  const world = createWorld(rng);
  const state = {
    seed,
    rng,
    time: 0,
    screen: 'title',
    world,
    worldCanvas: renderWorldCanvas(world),
    player: createPlayer(START_POS.x, START_POS.y),
    cars: [],
    peds: [],
    guards: [
      createGuard(1630, 1696),
      createGuard(1870, 1696),
      createGuard(1750, 1682),
    ],
    bullets: [],
    particles: [],
    cashDrops: [],
    pickups: createPickups(),
    wanted: 0,
    cash: 120,
    lastCrimeAt: -99,
    lastShotCrimeAt: -99,
    lastCopShotAt: -99,
    spawnTimer: 0,
    policeNear: false,
    busting: false,
    bustedFlash: 0,
    toast: null,
    toastT: 0,
    dialogue: null,
    camera: { x: START_POS.x, y: START_POS.y },
    shakeT: 0,
    shakeAmp: 0,
    stats: { errandsDone: 0 },
    audio: createAudio(),
    input: null,
    mouseWorld: { x: START_POS.x, y: START_POS.y - 60 },
    autosaveT: 0,
  };
  state.cars.push(...createParkedCars(world, rng));
  state.peds = createPedestrians(state);
  state.onEnterCar = () => onEnterCar(state);
  resumeStory(state, 0);
  state.dialogue = null;
  return state;
}

function updateCamera(state, dt) {
  const view = { w: canvas.width, h: canvas.height };
  const focus = state.player.car ?? state.player;
  let tx = focus.x;
  let ty = focus.y;
  if (state.player.car) {
    tx += (state.player.car.vx ?? 0) * 0.42;
    ty += (state.player.car.vy ?? 0) * 0.42;
  }
  const k = state.screen === 'title' ? 0.7 : Math.min(1, dt * 5.5);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
  state.camera.x = Math.max(view.w / 2 - 60, Math.min(WORLD_W - view.w / 2 + 60, state.camera.x));
  state.camera.y = Math.max(view.h / 2 - 60, Math.min(WORLD_H - view.h / 2 + 60, state.camera.y));
  if (state.shakeT > 0) {
    state.shakeT -= dt;
    state.camera.x += (Math.random() - 0.5) * state.shakeAmp;
    state.camera.y += (Math.random() - 0.5) * state.shakeAmp;
    if (state.shakeT <= 0) state.shakeAmp = 0;
  }
}

/** Paint one frame of the world (no HUD): used by play, title backdrop and the shots. */
function drawWorld(state) {
  const view = { w: canvas.width, h: canvas.height };
  const camX = state.camera.x - view.w / 2;
  const camY = state.camera.y - view.h / 2;
  ctx.fillStyle = '#1f6f8f';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.drawImage(state.worldCanvas, camX, camY, view.w, view.h, 0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(-camX, -camY);
  drawPickups(ctx, state);
  for (const ped of state.peds) drawPedestrian(ctx, ped, state.time);
  const sortedCars = [...state.cars].sort((a, b) => a.y - b.y);
  for (const car of sortedCars) drawCar(ctx, car, state.time);
  drawCombat(ctx, state);
  drawPlayer(ctx, state.player, state.time);
  drawMissionMarker(ctx, state);
  ctx.restore();
  // Sunset grade: a warm wash and a soft top glow over everything.
  const grad = ctx.createLinearGradient(0, 0, 0, view.h);
  grad.addColorStop(0, 'rgba(255,150,60,0.10)');
  grad.addColorStop(0.6, 'rgba(255,110,80,0.03)');
  grad.addColorStop(1, 'rgba(40,20,60,0.10)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.w, view.h);
}

function draw(state) {
  drawWorld(state);
  const view = { w: canvas.width, h: canvas.height };
  if (state.screen === 'title') drawTitleScreen(ctx, state, view, !!loadGame());
  else {
    drawHUD(ctx, state, view);
    if (state.screen === 'paused') drawPauseScreen(ctx, state, view);
  }
}

function stepGame(state, dt) {
  state.time += dt;
  state.toastT = Math.max(0, state.toastT - dt);
  if (state.toastT === 0) state.toast = null;
  state.bustedFlash = Math.max(0, state.bustedFlash - dt);
  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  if (state.screen !== 'play') return;
  updatePlayer(state, dt);
  updatePolice(state, dt);
  updateCombat(state, dt);
  updateMissions(state, dt);
  updatePickups(state, dt);
  state.autosaveT += dt;
  if (state.autosaveT > 12) {
    state.autosaveT = 0;
    saveGame(state);
  }
}

function advanceDialogue(state) {
  const dlg = state.dialogue;
  if (!dlg) return false;
  dlg.i += 1;
  if (dlg.i >= dlg.lines.length) state.dialogue = null;
  return true;
}

function startRun(state, save) {
  state.screen = 'play';
  state.audio.unlock();
  if (save) {
    state.cash = save.cash;
    state.stats.errandsDone = save.errandsDone ?? 0;
    state.player.x = save.x ?? START_POS.x;
    state.player.y = save.y ?? START_POS.y;
    state.player.health = save.health ?? 100;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    resumeStory(state, save.missionIndex);
    state.toast = 'Welcome back to Solmara.';
    state.toastT = 2.4;
  } else {
    beginStory(state);
  }
  status.textContent = 'Playing Solmara Nights.';
}

function runGame() {
  let state = createGame(Math.floor(Math.random() * 4294967296));
  const input = createInput(canvas);
  state.input = input;
  window.__game = state;
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    const clicks = input.takeClicks();
    if (actions & ACTION_MUTE) state.audio.setMuted(!state.audio.isMuted());
    if (state.screen === 'title') {
      const save = loadGame();
      if (input.held.has('KeyN')) {
        state = createGame(Math.floor(Math.random() * 4294967296));
        state.input = input;
        window.__game = state;
        startRun(state, null);
      } else if ((actions & ACTION_CONFIRM) || clicks.length > 0) {
        startRun(state, save);
      }
      return;
    }
    if (state.screen === 'play') {
      if (actions & ACTION_PAUSE) {
        state.screen = 'paused';
        saveGame(state);
        status.textContent = 'Paused.';
        return;
      }
      if (state.dialogue && ((actions & ACTION_INTERACT) || clicks.length > 0)) {
        advanceDialogue(state);
        return;
      }
      if (actions & ACTION_INTERACT) toggleCar(state);
      return;
    }
    if (state.screen === 'paused' && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      state.screen = 'play';
      status.textContent = 'Playing.';
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // The mouse in world space, through the camera, for aim and shooting.
    state.mouseWorld = {
      x: state.camera.x - canvas.width / 2 + input.mouse.x,
      y: state.camera.y - canvas.height / 2 + input.mouse.y,
    };
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      stepGame(state, STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
    updateCamera(state, STEP);
    // Sound follows the action: engine note from the car, siren from a near chase.
    const car = state.player.car;
    state.audio.engine(car ? Math.abs(car.speed) / car.type.maxSpeed : 0);
    state.audio.siren(state.policeNear && state.wanted > 0 && state.screen === 'play', STEP);
    draw(state);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') {
      state.screen = 'paused';
      saveGame(state);
    }
  });

  status.textContent = 'Solmara Nights. Press Enter to start.';
  requestAnimationFrame(frame);
}

function runShot(name) {
  const seed = Number.isInteger(seedParam) ? seedParam : 1;
  const state = createGame(seed);
  state.input = {
    moveAxis: () => ({ x: 0, y: 0 }),
    driveAxis: () => ({ throttle: 0, steer: 0 }),
    mouse: { x: 0, y: 0, down: false },
    takeActions: () => 0,
    takeClicks: () => [],
  };
  stageShot(state, name);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  updateCamera(state, 1);
  window.__game = state;
  let painted = 0;
  function paint() {
    draw(state);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runGame();
