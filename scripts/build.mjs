// Regenerates the committed build outputs from the canonical JSON artifacts:
//
//   dist/idl.mjs, dist/addresses.mjs, dist/constants.mjs  — ESM wrappers, so consumers and
//     bundlers import plain modules and never depend on JSON-module support
//   MANIFEST.json                                          — sha256 of every canonical artifact
//     plus provenance (which whiteknight commit produced the IDL)
//
// The outputs are COMMITTED, not built on install: this package is consumed straight from a
// git commit hash with --ignore-scripts, so nothing may depend on a lifecycle script running.
// test/generated.test.mjs fails whenever a committed output is stale against its source.
//
//   node scripts/build.mjs           regenerate in place
//   node scripts/build.mjs --check   exit 1 if anything on disk differs from what would be built

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const ARTIFACTS = ['idl/whiteknight.json', 'addresses.json', 'constants.json'];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const read = (rel) => readFileSync(join(root, rel));

/** A JSON file as an ESM module. JSON is valid JS expression syntax, so this is exact. */
function wrapper(rel) {
  const json = JSON.parse(read(rel).toString('utf8')); // round-trip: reject invalid JSON here
  return (
    `// GENERATED from ${rel} by scripts/build.mjs — do not edit by hand.\n` +
    `// Regenerate with: node scripts/build.mjs\n` +
    `export default ${JSON.stringify(json, null, 2)};\n`
  );
}

// Provenance is carried forward from the existing manifest unless overridden by env — the
// whiteknight source commit only changes when the IDL is actually re-exported.
const prevPath = join(root, 'MANIFEST.json');
const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : {};
const manifest = {
  _comment:
    'Integrity manifest. Every hash is recomputed by test/manifest.test.mjs on every test run; ' +
    'a mismatch means an artifact was edited without rebuilding, which is the staleness this ' +
    'repo exists to prevent.',
  source: {
    repo: 'whiteknight (private)',
    commit: process.env.WK_SOURCE_COMMIT ?? prev.source?.commit ?? 'unknown',
    toolchain: process.env.WK_TOOLCHAIN ?? prev.source?.toolchain ?? 'anchor 1.1.2',
    exported: process.env.WK_EXPORTED_AT ?? prev.source?.exported ?? 'unknown',
  },
  artifacts: Object.fromEntries(ARTIFACTS.map((rel) => [rel, sha256(read(rel))])),
};

const outputs = new Map([
  ['dist/idl.mjs', wrapper('idl/whiteknight.json')],
  ['dist/addresses.mjs', wrapper('addresses.json')],
  ['dist/constants.mjs', wrapper('constants.json')],
  ['dist/manifest.mjs',
    '// GENERATED from MANIFEST.json by scripts/build.mjs — do not edit by hand.\n' +
    `export default ${JSON.stringify(manifest, null, 2)};\n`],
  ['MANIFEST.json', JSON.stringify(manifest, null, 2) + '\n'],
]);

let stale = 0;
for (const [rel, content] of outputs) {
  const path = join(root, rel);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === content) continue;
  if (check) {
    console.error(`stale: ${rel}`);
    stale += 1;
  } else {
    writeFileSync(path, content);
    console.log(`wrote: ${rel}`);
  }
}

if (check && stale) {
  console.error(`\n${stale} generated file(s) out of date. Run: node scripts/build.mjs`);
  process.exit(1);
}
if (check) console.log('generated outputs are current');
