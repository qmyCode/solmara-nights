// The story of Solmara Nights, in three jobs and endless errands. Marina, who runs the
// marina and half the favours in town, hires Rico by phone: steal a first set of wheels,
// run a hot package across town under police eyes, then take a cash case back from a rival
// crew and escape to her boat. Each mission is a small state machine — an objective line, a
// glowing marker in the world, dialogue at both ends, and a cash reward — and when the
// story ends, Marina keeps offering paid delivery errands forever.

import { PIER, buildingNamed } from './world.js';
import { saveGame } from './save.js';

export const MARINA_DROP = { x: 1620, y: 2472 };
export const BOAT = { x: PIER.x + PIER.w / 2, y: PIER.y + PIER.h - 42 };

function doorOf(building, side = 'south') {
  if (side === 'north') return { x: building.x + building.w / 2, y: building.y - 24 };
  return { x: building.x + building.w / 2, y: building.y + building.h + 24 };
}

export function createMissionState() {
  return {
    index: 0,
    phase: 'steal',
    title: 'First Wheels',
    text: 'Steal a car — any car.',
    target: null,
    storyDone: false,
    errand: null,
    errandCooldown: 0,
  };
}

function say(state, speaker, lines) {
  state.dialogue = { speaker, lines, i: 0 };
}

function setObjective(state, title, text, target) {
  state.mission.title = title;
  state.mission.text = text;
  state.mission.target = target;
}

/** Kick off the story (new game): Marina's first call, then the First Wheels objective. */
export function beginStory(state) {
  say(state, 'Marina — phone', [
    'Rico Solano. Heard you can drive. Solmara eats new wheelmen alive — unless they work for me.',
    "I'm Marina. I run Marina Solmara and half the favours in this town. First job's simple: get yourself some wheels.",
    "Any wheels that aren't yours, cariño. That IS the job.",
  ]);
  const m = createMissionState();
  state.mission = m;
  setObjective(state, 'First Wheels', 'Steal a car — any car. (Walk up to one, press E)', null);
}

/** Continue a saved game at the given mission index, with a fresh objective for it. */
export function resumeStory(state, index) {
  state.mission = createMissionState();
  state.mission.index = index;
  state.mission.storyDone = index >= 3;
  if (index === 0) {
    setObjective(state, 'First Wheels', 'Steal a car — any car. (Walk up to one, press E)', null);
    state.mission.phase = 'steal';
  } else if (index === 1) {
    startHotCargo(state, false);
  } else if (index === 2) {
    startPierJob(state, false);
  } else {
    setObjective(state, 'Free Roam', 'Marina always has another errand. One is coming up…', null);
    state.mission.phase = 'errand-wait';
    state.mission.errandCooldown = 2;
  }
}

function startHotCargo(state, withDialogue = true) {
  const cafe = buildingNamed(state.world, 'Café Brisa');
  state.mission.index = 1;
  state.mission.phase = 'pickup';
  if (withDialogue) {
    say(state, 'Marina — phone', [
      'A friend left a package at Café Brisa. The Policía are watching the café today — funny coincidence.',
      "Pick it up and bring it to my warehouse, the Almacén del Puerto. And Rico — don't open it.",
    ]);
  }
  setObjective(state, 'Hot Cargo', 'Pick up the package at Café Brisa.', doorOf(cafe));
}

function startPierJob(state, withDialogue = true) {
  const warehouse = buildingNamed(state.world, 'Almacén del Puerto');
  state.mission.index = 2;
  state.mission.phase = 'grab';
  if (withDialogue) {
    say(state, 'Marina — phone', [
      "Last job, then you're made. A cash case sits in my warehouse — but Dario's crew moved in this morning.",
      "Grab the case, shake the heat, and reach my boat at the end of the pier. I'll be waiting.",
    ]);
  }
  setObjective(state, 'The Pier Job', "Take the cash case from the Almacén del Puerto. Dario's crew is guarding it.", doorOf(warehouse, 'north'));
}

function completeMission(state, reward, lines) {
  state.cash += reward;
  state.audio.cash();
  say(state, 'Marina — phone', lines);
  saveGame(state);
}

function newErrand(state) {
  const spots = state.world.buildings.map((b) => ({ name: b.name, ...doorOf(b) }));
  const a = state.rng.pick(spots);
  let b = state.rng.pick(spots);
  if (b === a) b = spots[(spots.indexOf(a) + 5) % spots.length];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const reward = Math.round(90 + dist / 9);
  state.mission.errand = { from: a, to: b, reward };
  state.mission.phase = 'errand-pickup';
  setObjective(state, 'Errand', `Pick up a parcel at ${a.name}.`, { x: a.x, y: a.y });
}

/** Called by player.js (through a state hook) whenever Rico gets into a car. */
export function onEnterCar(state) {
  const m = state.mission;
  if (m.index === 0 && m.phase === 'steal') {
    m.phase = 'deliver';
    setObjective(state, 'First Wheels', 'Drive to the Marina drop-off on the promenade.', { ...MARINA_DROP });
    state.toast = 'Now take it to the marina drop-off.';
    state.toastT = 2.4;
  }
}

function near(state, target, radius, needFoot = false) {
  if (!target) return false;
  if (needFoot && state.player.car) return false;
  const p = state.player.car ?? state.player;
  return Math.hypot(p.x - target.x, p.y - target.y) < radius;
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (state.player.dead) return;
  switch (m.phase) {
    case 'deliver': // First Wheels: arrive at the marina drop in the stolen car.
      if (state.player.car && near(state, m.target, 74)) {
        completeMission(state, 300, [
          'Not bad. You drive like the sunset owes you money.',
          "Keep the car — consider it a signing bonus. Next job's already waiting.",
        ]);
        startHotCargo(state, false);
        state.mission.pendingDialogue = true;
      }
      break;
    case 'pickup': // Hot Cargo: collect the package on foot.
      if (near(state, m.target, 42, true)) {
        m.phase = 'drop';
        state.wanted = Math.max(state.wanted, 2);
        state.lastCrimeAt = state.time;
        const warehouse = buildingNamed(state.world, 'Almacén del Puerto');
        setObjective(state, 'Hot Cargo', 'Deliver the package to the Almacén del Puerto — the Policía are onto you!', doorOf(warehouse));
        state.toast = 'Package in hand. The Policía are onto you!';
        state.toastT = 2.6;
      }
      break;
    case 'drop':
      if (near(state, m.target, 52)) {
        completeMission(state, 650, ["Intact. You're learning Solmara's first rule: never ask what's inside."]);
        startPierJob(state, false);
        state.mission.pendingDialogue = true;
      }
      break;
    case 'grab': // The Pier Job: take the case on foot.
      if (near(state, m.target, 44, true)) {
        m.phase = 'escape';
        state.wanted = Math.max(state.wanted, 3);
        state.lastCrimeAt = state.time;
        setObjective(state, 'The Pier Job', 'Escape to Marina’s boat at the end of the pier!', { ...BOAT });
        state.toast = 'Case secured — the whole city is coming. RUN!';
        state.toastT = 2.8;
      }
      break;
    case 'escape':
      if (near(state, m.target, 58)) {
        m.storyDone = true;
        m.index = 3;
        m.phase = 'errand-wait';
        m.errandCooldown = 6;
        completeMission(state, 1200, [
          "You did it, wheelman. Solmara is yours now — every street, every sunset.",
          "Keep driving for me when you want work. This city never sleeps, and neither do its errands.",
        ]);
        setObjective(state, 'Story Complete', 'Solmara is yours. Marina will offer paid errands — or just cruise.', null);
      }
      break;
    case 'errand-wait':
      m.errandCooldown -= dt;
      if (m.errandCooldown <= 0) newErrand(state);
      break;
    case 'errand-pickup':
      if (near(state, m.target, 46)) {
        m.phase = 'errand-drop';
        setObjective(state, 'Errand', `Deliver the parcel to ${m.errand.to.name} — $${m.errand.reward} waiting.`, { x: m.errand.to.x, y: m.errand.to.y });
      }
      break;
    case 'errand-drop':
      if (near(state, m.target, 56)) {
        state.cash += m.errand.reward;
        state.stats.errandsDone += 1;
        state.audio.cash();
        state.toast = `Errand done — $${m.errand.reward} from Marina.`;
        state.toastT = 2.6;
        m.errand = null;
        m.phase = 'errand-wait';
        m.errandCooldown = state.rng.range(5, 10);
        setObjective(state, 'Free Roam', 'Marina always has another errand. One is coming up…', null);
        saveGame(state);
      }
      break;
    default:
      break;
  }
  // Mission-start dialogue queued by a completion plays once the reward call ends.
  if (m.pendingDialogue && !state.dialogue) {
    m.pendingDialogue = false;
    if (m.index === 1) {
      say(state, 'Marina — phone', [
        'A friend left a package at Café Brisa. The Policía are watching the café today — funny coincidence.',
        "Pick it up and bring it to my warehouse, the Almacén del Puerto. And Rico — don't open it.",
      ]);
    } else if (m.index === 2) {
      say(state, 'Marina — phone', [
        "Last job, then you're made. A cash case sits in my warehouse — but Dario's crew moved in this morning.",
        "Grab the case, shake the heat, and reach my boat at the end of the pier. I'll be waiting.",
      ]);
    }
  }
}

/** The objective beacon: a pillar of golden light and a pulsing ring at the target. */
export function drawMissionMarker(ctx, state) {
  const target = state.mission.target;
  if (!target || state.screen !== 'play') return;
  const pulse = 1 + Math.sin(state.time * 4) * 0.12;
  ctx.save();
  const grad = ctx.createLinearGradient(0, target.y - 190, 0, target.y);
  grad.addColorStop(0, 'rgba(255,209,102,0)');
  grad.addColorStop(1, 'rgba(255,209,102,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(target.x - 12, target.y - 190, 24, 190);
  ctx.fillStyle = 'rgba(255,209,102,0.75)';
  ctx.fillRect(target.x - 12, target.y - 190, 2.4, 190);
  ctx.fillRect(target.x + 9.6, target.y - 190, 2.4, 190);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.ellipse(target.x, target.y, 30 * pulse, 15 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 27px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▼', target.x, target.y - 160 + Math.sin(state.time * 4) * 6);
  ctx.restore();
}
