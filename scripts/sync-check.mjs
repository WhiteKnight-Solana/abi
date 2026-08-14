// Maintainer-side staleness gate: is the published IDL byte-identical to the one the program
// source currently builds?
//
// Runs against a sibling `whiteknight/` checkout (the private program repo). In any other
// environment — a consumer's node_modules, public CI — that checkout does not exist and the
// check SKIPS with exit 0, saying so. It never fails for lack of access, only for actual drift:
// a skipped check is "could not compare here", a red one is "the ABI is stale, re-export it".
//
//   node scripts/sync-check.mjs
//   WK_SOURCE_IDL=/path/to/whiteknight.json node scripts/sync-check.mjs

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ours = join(root, 'idl', 'whiteknight.json');
const theirs =
  process.env.WK_SOURCE_IDL ?? join(root, '..', 'whiteknight', 'target', 'idl', 'whiteknight.json');

if (!existsSync(theirs)) {
  console.log(`sync-check: skipped — no program checkout at ${theirs}`);
  process.exit(0);
}

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const a = sha256(ours);
const b = sha256(theirs);

if (a === b) {
  console.log(`sync-check: in sync (${a.slice(0, 16)}…)`);
  process.exit(0);
}

console.error('sync-check: STALE — the published IDL differs from the program build.');
console.error(`  published: ${a}  (${ours})`);
console.error(`  program:   ${b}  (${theirs})`);
console.error('  Re-export: copy the program IDL over idl/whiteknight.json, then');
console.error('  WK_SOURCE_COMMIT=<commit> node scripts/build.mjs');
process.exit(1);
