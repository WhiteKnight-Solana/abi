// The address book's own rules.
//
// A null is a declared filler — the program is not on that cluster yet — and the `pending`
// list must name every one of them, so "what is still unpublished" is a machine-checked fact
// rather than a comment. The one rule with teeth: the development declare_id must never appear
// as any cluster's program id. That key exists in public git history; deploying it is the exact
// mistake docs/mainnet-identity.md exists to prevent, and this test makes the ABI refuse to
// publish it.
//
// That rule used to be written as `mainnet !== idl.address`, which worked only while
// `declare_id!` still held the dev key. The 2026-08-14 mainnet deploy moved `declare_id!` to
// the real address, at which point the old form would have started comparing the mainnet id
// against itself — a test that fails on the correct deploy and passes on the mistake it exists
// to catch. It is pinned as a LITERAL now (`addresses.json` → `neverDeploy`), so it keeps
// testing the same fact no matter what the IDL says.

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

test('localnet carries whatever declare_id the IDL was built from', () => {
  // Since the mainnet deploy both Anchor.toml stanzas point at the same address, so this is
  // now "the address book agrees with the artifact", not "localnet is the throwaway key".
  assert.equal(clusters.localnet.whiteknightProgram, idl.address);
});

test('the development declare_id is never published as any cluster program id', () => {
  const dev = book.neverDeploy.developmentDeclareId;
  // Pin the literal itself: if someone edits it to the address they are deploying, the rule
  // would still "pass" while protecting nothing.
  assert.equal(dev, '7RMuMpB6pqsoRemhC3FuXpK9Yz3NakyUQWLLJrJWw4PD');
  for (const [cluster, entries] of Object.entries(clusters)) {
    if (entries.whiteknightProgram === null) continue;
    assert.ok(isAddress(entries.whiteknightProgram));
    assert.notEqual(
      entries.whiteknightProgram,
      dev,
      `clusters.${cluster}.whiteknightProgram is the dev declare_id — that keypair is in public git history and must never be deployed`,
    );
  }
});

test('the published mainnet id is the deployed program', () => {
  // The one address every consumer resolves. Pinned so a typo in the pin cascade fails here,
  // in a repo with no network access, rather than at a client that quietly derives every PDA
  // from a program that does not exist.
  assert.equal(clusters.mainnet.whiteknightProgram, 'WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS');
  assert.equal(clusters.mainnet.whiteknightProgram, idl.address, 'the IDL and the address book must describe the same program');
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
