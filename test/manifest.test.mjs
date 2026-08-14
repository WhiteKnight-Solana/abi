// The integrity manifest, recomputed.
//
// MANIFEST.json is the cross-repo staleness anchor: the private program repo compares its
// freshly built IDL hash against the hash published here, and consumers can verify the bytes
// they installed are the bytes that were reviewed. None of that works if the manifest itself
// can drift, so every hash is recomputed from the artifact bytes on every test run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, readRaw, sha256hex } from './helpers.mjs';

const manifest = readJson('MANIFEST.json');

test('every artifact hash in the manifest matches the bytes on disk', () => {
  const names = Object.keys(manifest.artifacts);
  assert.deepEqual(
    names.sort(),
    ['addresses.json', 'constants.json', 'idl/whiteknight.json'],
    'manifest must cover exactly the canonical artifacts',
  );
  for (const [rel, expected] of Object.entries(manifest.artifacts)) {
    assert.equal(sha256hex(readRaw(rel)), expected, `${rel} was edited without rebuilding`);
  }
});

test('provenance names the source commit as a full 40-hex hash', () => {
  assert.match(
    manifest.source.commit,
    /^[0-9a-f]{40}$/,
    'MANIFEST.source.commit must be the full whiteknight commit the IDL was exported from',
  );
  assert.ok(manifest.source.toolchain?.length, 'toolchain missing');
});
