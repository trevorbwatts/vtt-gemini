// Exits 0 when the built app (dist/ + dist-electron/) is newer than every file
// it was built from, and 1 when a rebuild is needed.
//
// "Run Dungeon Master VTT.bat" uses this so it can launch instantly on a normal
// day and only spend time rebuilding after the app's source has actually changed.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const outputs = ['dist/index.html', 'dist-electron/main.js'];
const sources = ['src', 'electron', 'public', 'index.html', 'package.json', 'vite.config.ts'];

// Extras are served live from public/ at runtime rather than from the build,
// so adding an avatar doesn't need a rebuild.
const ignored = new Set([
  path.join(root, 'public', 'extras'),
]);

function newestMtime(target) {
  if (ignored.has(target)) return 0;

  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;

  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    newest = Math.max(newest, newestMtime(path.join(target, entry.name)));
  }
  return newest;
}

// A missing output means there is nothing to run yet — always rebuild.
let oldestOutput = Infinity;
for (const output of outputs) {
  try {
    oldestOutput = Math.min(oldestOutput, fs.statSync(path.join(root, output)).mtimeMs);
  } catch {
    process.exit(1);
  }
}

let newestSource = 0;
for (const source of sources) {
  try {
    newestSource = Math.max(newestSource, newestMtime(path.join(root, source)));
  } catch {
    // Optional path that isn't present in this checkout — ignore it.
  }
}

process.exit(newestSource > oldestOutput ? 1 : 0);
