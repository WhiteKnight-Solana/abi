// The address book's own rules.
//
// A null is a declared filler — the program is not on that cluster yet — and the `pending`
// list must name every one of them, so "what is still unpublished" is a machine-checked fact
// rather than a comment. The one rule with teeth: the development declare_id must never appear
// as the mainnet program id. That key exists in public git history; deploying it is the exact
// mistake docs/mainnet-identity.md exists to prevent, and this test makes the ABI refuse to
// publish it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, isAddress } from './helpers.mjs';

const book = readJson('addresses.json');
const idl = readJson('idl/whiteknight.json');
const { clusters, pending } = book;

test('every non-null entry is a well-formed 32-byte base58 address', () => {
  for (const [cluster, entries] of Object.entries(clusters)) {
    for (const [name, value] of Object.entries(entries)) {
      if (value === null) continue;
      assert.ok(isAddress(value), `${cluster}.${name} = ${value} is not a valid address`);
    }
  }
});

test('the pending list names exactly the null entries', () => {
  const nulls = [];
  for (const [cluster, entries] of Object.entries(clusters)) {
    for (const [name, value] of Object.entries(entries)) {
      if (value === null) nulls.push(`clusters.${cluster}.${name}`);
    }
  }
  assert.deepEqual(nulls.sort(), [...pending].sort());
});

test('localnet carries the development declare_id from the IDL', () => {
  assert.equal(clusters.localnet.whiteknightProgram, idl.address);
});

test('the mainnet program id is never the development declare_id', () => {
  const mainnet = clusters.mainnet.whiteknightProgram;
  if (mainnet === null) return; // still pending — the pending test covers it
  assert.ok(isAddress(mainnet));
  assert.notEqual(
    mainnet,
    idl.address,
    'mainnet.whiteknightProgram equals the dev declare_id — that key is in public git history and must never be deployed',
  );
});

test('third-party addresses agree across clusters', () => {
  // Sat Rush and the mints are mainnet facts; localnet clones them, so a disagreement is a typo.
  for (const name of ['satrushProgram', 'usdcMint', 'cbbtcMint', 'tokenProgram', 'associatedTokenProgram']) {
    assert.equal(clusters.localnet[name], clusters.mainnet[name], name);
  }
});

test('the known third-party anchors are exactly the published ones', () => {
  assert.equal(clusters.mainnet.satrushProgram, 'satRushGBRY2vgapeTAkoxz26vL2cYqyPi6CnBj7Tco');
  assert.equal(clusters.mainnet.usdcMint, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(clusters.mainnet.cbbtcMint, 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij');
});
