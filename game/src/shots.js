// The four screenshot scenes behind ?shot=cover|driving|chase|mission&seed=1. Each one
// takes a fresh, seeded game and poses it — real entities in real places, frozen — so the
// picture is the game itself: the cover downtown on foot, a drive down the avenue, a
// three-star chase mid-mission, and the pier job's guards with Marina on the phone. The
// same seed always stages the same frame.

import { buildingNamed } from './world.js';
import { CAR_TYPES, createCar, createPoliceCar } from './vehicles.js';
import { MARINA_DROP } from './missions.js';

function trafficCar(state, type, x, y, angle, heading) {
  const car = createCar(type, x, y, angle, type.colors[0]);
  car.kind = 'traffic';
  car.heading = heading;
  car.cruise = 160;
  state.cars.push(car);
  return car;
}

function playerInCar(state, type, x, y, angle, speed, colorIndex = 0) {
  const car = createCar(type, x, y, angle, type.colors[colorIndex]);
  car.kind = 'player';
  car.speed = speed;
  state.cars.push(car);
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  return car;
}

function setMission(state, index, phase, title, text, target) {
  state.mission.index = index;
  state.mission.phase = phase;
  state.mission.title = title;
  state.mission.text = text;
  state.mission.target = target;
}

/** Cover: Rico on foot downtown — peds, traffic, HUD and minimap all in one frame. */
function stageCover(state) {
  state.player.x = 1080;
  state.player.y = 852;
  state.player.angle = 0.6;
  trafficCar(state, CAR_TYPES[1], 1118, 620, Math.PI, 2);
  trafficCar(state, CAR_TYPES[2], 1042, 1090, 0, 0);
  trafficCar(state, CAR_TYPES[0], 660, 878, Math.PI / 2, 1);
  trafficCar(state, CAR_TYPES[4], 1560, 802, -Math.PI / 2, 3);
  const near = [
    [1010, 800], [1150, 905], [985, 880], [1200, 790], [1095, 760],
  ];
  near.forEach(([x, y], i) => {
    if (state.peds[i]) {
      state.peds[i].x = x;
      state.peds[i].y = y;
    }
  });
  setMission(state, 0, 'steal', 'First Wheels', 'Steal a car — any car. (Walk up to one, press E)', null);
}

/** Driving: Rico in a stolen Vela GT on the avenue, traffic around him, drop-off set. */
function stageDriving(state) {
  playerInCar(state, CAR_TYPES[4], 1118, 1480, Math.PI, 215, 0);
  trafficCar(state, CAR_TYPES[1], 1118, 1180, Math.PI, 2);
  trafficCar(state, CAR_TYPES[2], 1042, 1780, 0, 0);
  trafficCar(state, CAR_TYPES[0], 1118, 1960, Math.PI, 2);
  trafficCar(state, CAR_TYPES[3], 700, 1598, Math.PI / 2, 1);
  setMission(state, 0, 'deliver', 'First Wheels', 'Drive to the Marina drop-off on the promenade.', { ...MARINA_DROP });
}

/** Chase: three stars, three interceptors, and a package that has to reach the warehouse. */
function stageChase(state) {
  const warehouse = buildingNamed(state.world, 'Almacén del Puerto');
  playerInCar(state, CAR_TYPES[1], 1740, 878, Math.PI / 2, 265, 2);
  const p1 = createPoliceCar(1560, 878, Math.PI / 2);
  const p2 = createPoliceCar(1470, 806, Math.PI / 2 + 0.24);
  const p3 = createPoliceCar(1395, 884, Math.PI / 2 - 0.15);
  state.cars.push(p1, p2, p3);
  trafficCar(state, CAR_TYPES[2], 2380, 802, -Math.PI / 2, 3);
  state.wanted = 3;
  state.lastCrimeAt = state.time;
  setMission(state, 1, 'drop', 'Hot Cargo', 'Deliver the package to the Almacén del Puerto — the Policía are onto you!', {
    x: warehouse.x + warehouse.w / 2,
    y: warehouse.y + warehouse.h + 24,
  });
}

/** Mission: the pier job — guards at the warehouse, Rico firing, Marina on the phone. */
function stageMission(state) {
  const warehouse = buildingNamed(state.world, 'Almacén del Puerto');
  state.player.x = 1745;
  state.player.y = 1700;
  state.player.angle = Math.atan2(1832 - 1745, -(1698 - 1700)); // aimed at the nearest guard
  state.guards.forEach((guard, i) => {
    const spots = [
      [1832, 1698],
      [1905, 1696],
      [1650, 1668],
    ];
    guard.x = spots[i][0];
    guard.y = spots[i][1];
    guard.angle = Math.atan2(state.player.x - guard.x, -(state.player.y - guard.y));
  });
  // A bullet in flight at the guard, its muzzle flash and the impact sparks, frozen.
  state.bullets.push({
    x: state.player.x + Math.sin(state.player.angle) * 95,
    y: state.player.y - Math.cos(state.player.angle) * 95,
    vx: Math.sin(state.player.angle) * 950,
    vy: -Math.cos(state.player.angle) * 950,
    life: 0.4,
    hostile: false,
  });
  for (let i = 0; i < 7; i += 1) {
    state.particles.push({
      x: 1832 + (i % 3) * 5 - 5,
      y: 1698 + (i % 2) * 6 - 3,
      vx: 0,
      vy: 0,
      life: 0.5,
      maxLife: 0.6,
      color: i % 2 === 0 ? '#ffd166' : '#e4572e',
      size: 2.6,
    });
  }
  const cop = createPoliceCar(1240, 1598, Math.PI / 2);
  state.cars.push(cop);
  state.wanted = 2;
  state.lastCrimeAt = state.time;
  setMission(state, 2, 'grab', 'The Pier Job', "Take the cash case from the Almacén del Puerto. Dario's crew is guarding it.", {
    x: warehouse.x + warehouse.w / 2,
    y: warehouse.y - 24,
  });
  state.dialogue = {
    speaker: 'Marina — phone',
    lines: ["Grab the case, shake the heat, and reach my boat at the end of the pier. I'll be waiting."],
    i: 0,
  };
}

const SCENES = {
  cover: stageCover,
  driving: stageDriving,
  chase: stageChase,
  mission: stageMission,
};

/** Pose the fresh game as the named scene (unknown names stage the cover). */
export function stageShot(state, name) {
  state.time = 3.7;
  state.screen = 'play';
  (SCENES[name] ?? stageCover)(state);
}
