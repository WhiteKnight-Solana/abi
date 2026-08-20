// Maintainer-side staleness gate: does this package still describe the program source?
//
// Two questions, because they go stale in different ways. The IDL is compared byte for byte.
// The user_flag bits are compared by NAME AND INDEX against state.rs, because they are not in
// the IDL at all — a flag is a bit in a u64, so adding one changes no type, no length and no
// discriminator. Nothing in a published-artifact check would notice, and the failure is quiet
// in the worst way: a UI renders the switches it can see and simply never offers the new one.
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

let failed = false;

if (a === b) {
  console.log(`sync-check: IDL in sync (${a.slice(0, 16)}…)`);
} else {
  failed = true;
  console.error('sync-check: STALE — the published IDL differs from the program build.');
  console.error(`  published: ${a}  (${ours})`);
  console.error(`  program:   ${b}  (${theirs})`);
  console.error('  Re-export: copy the program IDL over idl/whiteknight.json, then');
  console.error('  WK_SOURCE_COMMIT=<commit> node scripts/build.mjs');
}

// ---------------------------------------------------------------- user_flag bits
const statePath =
  process.env.WK_SOURCE_STATE ??
  join(root, '..', 'whiteknight', 'programs', 'whiteknight', 'src', 'state.rs');

if (!existsSync(statePath)) {
  console.log(`sync-check: user_flag bits skipped — no state.rs at ${statePath}`);
} else {
  // The `user_flag` module only, so the neighbouring WkConfig `flag` module — which uses the
  // same `1 << n` spelling for a DIFFERENT field — cannot be read as if it were this one.
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
  if (source.size === 0) problems.push('found no `1 << n` constants in state.rs — has the module been rewritten?');
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
    console.error('sync-check: STALE — published user_flag bits do not match state.rs.');
    for (const p of problems) console.error(`  ${p}`);
    console.error('  Fix constants.json, then WK_SOURCE_COMMIT=<commit> node scripts/build.mjs');
  }
}

process.exit(failed ? 1 : 0);
