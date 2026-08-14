// The committed build outputs, checked against their sources.
//
// dist/*.mjs is committed rather than built on install, because this package is consumed from
// a git commit with --ignore-scripts: no lifecycle script can be assumed to run, so nothing may
// need one. The cost of committing outputs is that they can go stale — this suite is that cost,
// paid once, here: every wrapper must deep-equal its source JSON, or the build was skipped.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './helpers.mjs';

import idl from '../dist/idl.mjs';
import addresses from '../dist/addresses.mjs';
import constants from '../dist/constants.mjs';
import manifest from '../dist/manifest.mjs';

test('dist/idl.mjs equals idl/whiteknight.json', () => {
  assert.deepEqual(idl, readJson('idl/whiteknight.json'));
});

test('dist/addresses.mjs equals addresses.json', () => {
  assert.deepEqual(addresses, readJson('addresses.json'));
});

test('dist/constants.mjs equals constants.json', () => {
  assert.deepEqual(constants, readJson('constants.json'));
});

test('dist/manifest.mjs equals MANIFEST.json', () => {
  assert.deepEqual(manifest, readJson('MANIFEST.json'));
});

test('the package entrypoint re-exports all four', async () => {
  const pkg = await import('../index.mjs');
  assert.deepEqual(pkg.idl, idl);
  assert.deepEqual(pkg.addresses, addresses);
  assert.deepEqual(pkg.constants, constants);
  assert.deepEqual(pkg.manifest, manifest);
});
