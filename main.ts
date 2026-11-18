// PALOMA BAY — entry program for make.fun gta6-01 ("Make GTA 6").
// Node 22, standard library only. It hands the game in: copies game/ and
// screenshots/ from beside this file into /output (or MAKEFUN_OUTPUT_DIR
// outside the grader) and writes /output/dossier.json with the kit's vendored
// buildDossier. The game itself is plain static files under game/ — raw
// WebGL2, no libraries, no network requests — served by any static server.
//
// Run locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });

// The game: static files, game/index.html opens in desktop Chrome offline.
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

// The screenshots: 4 real renders of the game's own code, first by name is
// the cover. Copied after game/ so a missing folder still yields a valid
// output tree (the gate then fails on screenshots, as it should).
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The dossier: byte for byte what buildDossier writes from game/ and
// screenshots/, with the gate's own caps (only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse).
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
