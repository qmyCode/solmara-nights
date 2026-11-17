# Solmara Nights — build notes

An original open-world crime game for the make.fun gta6-01 bounty, built from scratch in
`game/` (the kit starter's game and screenshots were deleted and fully replaced). Top-down
2D on HTML5 Canvas, ES modules, no libraries, no network requests: every file the game
loads lives under `game/`. You are Rico Solano, a wheelman new in the invented sunset
coastal city of Solmara; the fixer Marina hires you by phone for a three-mission story,
and the city stays open afterwards with endless paid errands.

## Systems checklist

- [x] City: 4×4 road grid (right-hand lanes, junctions, crosswalks), 9 blocks, 36 uniquely
      named buildings (Hotel Brisa Grande, Café Brisa, Comisaría Central, Clínica Solmara,
      Almacén del Puerto, …), beach + promenade, water with a sunset glitter path, a wooden
      pier, palm trees, street lamps, beach umbrellas, rooftop clutter
- [x] Player on foot: WASD/arrows, mouse aim, golden "you are here" ring
- [x] Cars to steal: ~20 parked cars in block parking bays (quiet theft, reported after a
      delay) and moving traffic cars (loud theft, instant star); E enters/exits
- [x] Driving: shared car physics (throttle/steering/friction, sand and off-road grip loss,
      collision damage, wrecked cars smoke and die), 6 car types incl. Taxi Sol and Vela GT
- [x] Traffic AI: lane-following cars that choose turns at junctions, brake for cars,
      pedestrians and the player, despawn/respawn around the player (11 alive at once)
- [x] Pedestrians: 26 walkers looping block sidewalks and the promenade; they pause, flee
      gunfire and near misses, and can be knocked down (a serious crime)
- [x] Wanted level: 0–5 stars from theft, collisions, witnessed gunfire, hitting
      pedestrians, shooting or ramming police; heat decays when unseen and quiet
- [x] Police: interceptors (1 per star) stream in, steer freely, ram, and bust the player
      after pinning him at low speed for ~2.4 s → fine + respawn at the Comisaría
- [x] Combat: mouse-click pistol (bullets, muzzle/impact particles, panic), hostile crew
      guards at the warehouse who shoot back in mission 3, shot-out cars get disabled,
      guards drop cash
- [x] Cash: mission rewards, guard drops, 8 respawning street pickups, fines and clinic fees
- [x] Missions: 3-mission story chain (First Wheels → Hot Cargo → The Pier Job) with
      objective markers (world beacon + edge of the minimap), phone dialogue at both ends,
      scripted wanted levels, cash rewards; then endless delivery errands
- [x] HUD: health bar, cash, car health + model, wanted stars on a dark pill, objective
      panel, toasts, context prompts, bust warning, damage vignette, death/busted overlays
- [x] Minimap: live — coastline, roads, blocks, traffic specks, flashing police dots,
      player arrow, pulsing objective diamond
- [x] Start screen (title, story intro, controls, Continue/New Game), pause (P/Esc, also
      auto-pause on tab hide), save/load via localStorage (cash, mission, position, health;
      saved on mission completion, pause and a 12 s autosave)
- [x] Sound: fully synthesized WebAudio — engine hum pitched by speed, two-tone siren,
      gunshots, impacts, pickup/cash chimes, door, busted sting; M mutes
- [x] Deterministic screenshot scenes via `?shot=<scene>&seed=1` (see shots.json)

## File map (game/src, one job each)

| File | Job |
| --- | --- |
| `main.js` | Boot, fixed-step loop, screens, camera, draw orchestration, `window.__game` |
| `world.js` | City generation, spatial queries, circle collision, static city pre-render |
| `rng.js` | Seeded mulberry32 generator (deterministic city + scenes) |
| `vehicles.js` | Car factory/types, parked-car placement, driving physics, car drawing |
| `traffic.js` | Lane following, junction decisions, obstacle braking, spawn/despawn |
| `pedestrians.js` | Sidewalk loops, panic/flee, knock-downs, drawing |
| `police.js` | Wanted counts, interceptor spawning/chase steering, bust logic, heat decay |
| `player.js` | On-foot movement, car entry/theft, driving collisions, death/respawn, drawing |
| `combat.js` | Pistol, bullets, crew guards, particles, cash drops |
| `missions.js` | Story state machines, dialogue, objective beacon, errands |
| `hud.js` | HUD panels, stars, dialogue box, title/pause/death overlays |
| `minimap.js` | The live corner map |
| `pickups.js` | Street cash pickups |
| `audio.js` | WebAudio synth: engine, siren, one-shots |
| `input.js` | Keyboard/mouse state and one-shot actions |
| `save.js` | localStorage save/load/clear |
| `shots.js` | The four staged screenshot scenes |

`main.ts` (root) keeps the starter's handover plumbing and adds an authored header plus a
stdout receipt line (game/screenshot/dossier counts) after writing the dossier.
`vendor/makefun-game.ts` is byte-identical to the kit (verified with `cmp`). MIT LICENSE
kept from the starter.

## Screenshots (screenshots/, all 1280×800 JPEG, staged by shots.js, seed 1)

| File | Scene | Bytes |
| --- | --- | --- |
| `1-cover.jpg` | On foot downtown: HUD, minimap, peds, traffic, named buildings | 74,498 |
| `2-driving.jpg` | Driving a Vela GT through traffic, drop-off objective set | 78,196 |
| `3-chase.jpg` | 3-star police chase during Hot Cargo, objective on HUD + minimap | 78,207 |
| `4-mission.jpg` | The Pier Job: guards, gunfire, beacon, Marina dialogue, 2 stars | 86,523 |

All ≤ 256 KiB, long side 1280, short side 800. Captured headlessly with Playwright
(tooling lives outside the repo in `../shots-tool/`; nothing was installed in the repo).

## Validation (17 Nov 2026, this session)

- Headless play-test (Playwright, normal load, no `?shot`): title → Enter → intro dialogue
  dismissed with E → walked 185 px → stole a parked car (mission advanced steal→deliver)
  → drove to 290+ px/s → exited → fired (bullets + particles live) → pause/resume →
  forced 3 stars: 4 interceptor cars spawned and hunted. **Zero console/page errors.**
- `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` → `out/` holds `game/`,
  `screenshots/`, `dossier.json`; receipt line: “18 game files (107532 bytes),
  4 screenshots (317424 bytes), dossier.json 535757 bytes”. Two runs produced
  **byte-identical** dossier.json (`cmp` clean).
- Gate limits: game/ = 19 entries (≤ 993), `game/index.html` = 873 bytes (≤ 1 MiB),
  dossier.json = 535,757 bytes (≤ 1.5 MiB), screenshots ≤ 256 KiB each, no symlinks.
- A real bug was found and fixed during the build: the generic building-name list also
  contained the four story names, so `buildingNamed()` could return a duplicate across
  town and missions pointed at the wrong Café/Warehouse. Names are now unique (verified:
  36 buildings, 0 duplicates) and story targets resolve to the intended buildings.

## Known weaknesses

- Police steer freely and can cut across sidewalks/plazas; they avoid buildings only via
  the shared circle collision, so an interceptor occasionally scrapes a corner lot.
- Traffic is lane-perfect and never overtakes; a wreck left in a lane causes a polite,
  permanent queue behind it (realistic, if static).
- Guards stand their ground (no pathfinding or cover); they are a mission-3 threat, not
  a roaming enemy system.
- The story is three missions; after that, errands are simple pickup→deliver loops.
- Sound starts only after the first user gesture (browser autoplay rule); the title
  screen is silent until then.
