// Maintainer-side staleness gate: does this package still describe the program it pins?
//
// The program is a dev dependency, pinned by commit hash in package.json and installed with
// `npm install --ignore-scripts`. Its repo is private, so the install needs read access to it;
// the tests do not, they run on node:test with no install at all.
//
// Three questions, because they go stale in different ways. The IDL and the vendored onboarding
// fixture are compared byte for byte. The user_flag bits are compared by NAME AND INDEX against
// state.rs, because they are not in the IDL at all: a flag is a bit in a u64, so adding one
// changes no type, no length and no discriminator. Nothing in a published-artifact check would
// notice, and the failure is quiet in the worst way: a UI renders the switches it can see and
// simply never offers the new one.
//
// A missing file is a failure, never a skip: "could not compare" must not read as "in sync".
//
//   node scripts/sync-check.mjs

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const program = join(root, 'node_modules', '@whiteknight-solana', 'whiteknight');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
// npm checks the program repo out with the local git line-ending setting, so on an autocrlf
// machine a text fixture arrives with CRLF even though the repo stores LF. The program marks its
// IDL `-text` (byte-exact everywhere); the fixture is compared with its line endings normalized.
const sha256lf = (p) =>
  createHash('sha256').update(readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

let failed = false;
function present(path, what) {
  if (existsSync(path)) return true;
  failed = true;
  console.error(`sync-check: MISSING ${what} at ${path}`);
  console.error('  Install the pinned program first: npm install --ignore-scripts');
  return false;
}

// ---------------------------------------------------------------- byte-compared artifacts
for (const [ours, theirs, what, hash] of [
  ['idl/whiteknight.json', 'idl/whiteknight.json', 'IDL', sha256],
  ['fixtures/satstacker-onboard.json', 'programs/whiteknight/tests/fixtures/satstacker-onboard.json', 'onboarding fixture', sha256lf],
]) {
  const a = join(root, ours);
  const b = join(program, theirs);
  if (!present(b, `the pinned program's ${theirs}`)) continue;
  const [ha, hb] = [hash(a), hash(b)];
  if (ha === hb) {
    console.log(`sync-check: ${what} in sync (${ha.slice(0, 16)}...)`);
  } else {
    failed = true;
    console.error(`sync-check: STALE: the published ${what} differs from the pinned program's.`);
    console.error(`  published: ${ha}  (${a})`);
    console.error(`  program:   ${hb}  (${b})`);
    console.error(`  Re-export: copy the pinned ${theirs} over ${ours}, then`);
    console.error('  WK_SOURCE_COMMIT=<commit> node scripts/build.mjs');
  }
}

// ---------------------------------------------------------------- user_flag bits
const statePath = join(program, 'programs', 'whiteknight', 'src', 'state.rs');
if (present(statePath, "the pinned program's state.rs")) {
  // The `user_flag` module only, so the neighbouring WkConfig `flag` module, which uses the
  // same `1 << n` spelling for a DIFFERENT field, cannot be read as if it were this one.
  const src = readFileSync(statePath, 'utf8');
  const mod = src.slice(src.indexOf('pub mod user_flag {'));
  const body = mod.slice(0, mod.search(/^}/m));
  const source = new Map();
  for (const m of body.matchAll(/pub const (\w+): u64 = 1 << (\d+);/g)) {
    source.set(m[1], Number(m[2]));
  }

  const published = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(join(root, 'constants.json'), 'utf8')).whiteknight.userFlags)
      .filter(([k]) => !k.startsWith('_')),
  );

  const problems = [];
  if (source.size === 0) problems.push('found no `1 << n` constants in state.rs: has the module been rewritten?');
  for (const [name, bit] of source) {
    if (!(name in published)) problems.push(`state.rs defines ${name} (bit ${bit}); constants.json does not publish it`);
    else if (published[name] !== bit) problems.push(`${name}: state.rs says bit ${bit}, constants.json says ${published[name]}`);
  }
  for (const name of Object.keys(published)) {
    if (!source.has(name)) problems.push(`constants.json publishes ${name}, which state.rs no longer defines`);
  }

  if (problems.length === 0) {
    console.log(`sync-check: user_flag bits in sync (${[...source.keys()].join(', ')})`);
  } else {
    failed = true;
    console.error('sync-check: STALE: published user_flag bits do not match state.rs.');
    for (const p of problems) console.error(`  ${p}`);
    console.error('  Fix constants.json, then WK_SOURCE_COMMIT=<commit> node scripts/build.mjs');
  }
}

process.exit(failed ? 1 : 0);
