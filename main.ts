// Solmara Nights — a working gta6-01 entry (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline (game/index.html
// and its ES modules, no library and no network request), and the program hands it in. It copies
// game/ and screenshots/ from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library. The game itself is an original
// open-world crime game set in the invented coastal city of Solmara: a road grid of named
// buildings, a beach and a pier, stealable cars and living traffic, pedestrians, a wanted level
// with police interceptors, a three-mission story for the fixer Marina, combat, a HUD with a
// live minimap, synthesized sound and localStorage saves — all under game/src, one module per
// job. Put 3 or 4 PNG or JPEG screenshots of it in screenshots/ (the first by name is the cover)
// and run this program to hand it in.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A one-line receipt for whoever ran the handover (stdout only; the bytes in /output are
// untouched, so the grader's two runs still agree): how many game files and screenshots
// went in, and how large the dossier came out.
function countTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      const inner = countTree(path);
      files += inner.files;
      bytes += inner.bytes;
    } else {
      files += 1;
      bytes += stats.size;
    }
  }
  return { files, bytes };
}
const gameCount = countTree(join(out, 'game'));
const shotCount = countTree(join(out, 'screenshots'));
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(
  `Solmara Nights handed in: ${gameCount.files} game files (${gameCount.bytes} bytes), ` +
    `${shotCount.files} screenshots (${shotCount.bytes} bytes), dossier.json ${dossierBytes} bytes.`,
);
