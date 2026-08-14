// The IDL's internal integrity, re-derived from first principles.
//
// Anchor computes every discriminator as sha256 of a fixed preimage, and every account length
// is the sum of its field sizes plus the 8-byte discriminator. Both are recomputed here from
// nothing but the IDL text and compared against what the IDL and constants.json claim — so a
// hand-edited IDL, a truncated copy, or a constants file that survived a program change all
// fail by name instead of shipping.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, anchorDiscriminator, idlTypeSize } from './helpers.mjs';

const idl = readJson('idl/whiteknight.json');
const constants = readJson('constants.json');
const types = new Map((idl.types ?? []).map((t) => [t.name, t]));

test('every instruction discriminator is sha256("global:<name>")[0..8]', () => {
  assert.ok(idl.instructions.length >= 23, `only ${idl.instructions.length} instructions`);
  for (const ix of idl.instructions) {
    assert.deepEqual(
      ix.discriminator,
      anchorDiscriminator('global', ix.name),
      `instruction ${ix.name}`,
    );
  }
});

test('every account discriminator is sha256("account:<Name>")[0..8]', () => {
  assert.deepEqual(
    idl.accounts.map((a) => a.name).sort(),
    ['Deployer', 'Manager', 'WkConfig'],
  );
  for (const a of idl.accounts) {
    assert.deepEqual(a.discriminator, anchorDiscriminator('account', a.name), `account ${a.name}`);
    assert.ok(types.has(a.name), `account ${a.name} has no type definition`);
  }
});

test('every event discriminator is sha256("event:<Name>")[0..8]', () => {
  assert.ok(idl.events.length >= 21, `only ${idl.events.length} events`);
  for (const e of idl.events) {
    assert.deepEqual(e.discriminator, anchorDiscriminator('event', e.name), `event ${e.name}`);
    assert.ok(types.has(e.name), `event ${e.name} has no type definition`);
  }
});

test('account lengths derived from the IDL match constants.json exactly', () => {
  const lens = constants.whiteknight.accountLens;
  for (const [name, expected] of Object.entries(lens)) {
    const derived = 8 + idlTypeSize({ defined: { name } }, types);
    assert.equal(derived, expected, `${name}: IDL derives ${derived}, constants say ${expected}`);
  }
  // The three lengths this repo publishes are load-bearing as dataSize filters; pin the
  // current values so a program-side change is a conscious edit here, not a silent one.
  assert.deepEqual(lens, { WkConfig: 753, Manager: 331, Deployer: 443 });
});

test('each account carries its launch reserve at the declared width', () => {
  for (const [name, width] of Object.entries(constants.whiteknight.reserveWidths)) {
    if (name.startsWith('_')) continue;
    const fields = types.get(name).type.fields;
    const last = fields.at(-1);
    assert.equal(last.name, 'reserved', `${name}: last field is ${last.name}, not reserved`);
    assert.deepEqual(last.type, { array: ['u8', width] }, `${name}: reserve width`);
  }
});

test('error codes are dense from 6000 with unique names and non-empty messages', () => {
  assert.ok(idl.errors.length >= 34, `only ${idl.errors.length} errors`);
  const names = new Set();
  idl.errors.forEach((e, i) => {
    assert.equal(e.code, 6000 + i, `error ${e.name} out of sequence`);
    assert.ok(e.msg?.length, `error ${e.name} has no message`);
    assert.ok(!names.has(e.name), `duplicate error name ${e.name}`);
    names.add(e.name);
  });
});

test('the params array in WkConfig matches the declared paramCount', () => {
  const params = types.get('WkConfig').type.fields.find((f) => f.name === 'params');
  assert.deepEqual(params.type, { array: ['u64', constants.whiteknight.paramCount] });
  // Every named param index must fit inside the array.
  for (const [name, idx] of Object.entries(constants.whiteknight.params)) {
    assert.ok(
      Number.isInteger(idx) && idx >= 0 && idx < constants.whiteknight.paramCount,
      `param ${name} index ${idx} out of range`,
    );
  }
});

test('deployAuthorityOffset points at deploy_authority inside Deployer', () => {
  // disc[8] + every field before deploy_authority.
  const fields = types.get('Deployer').type.fields;
  let off = 8;
  for (const f of fields) {
    if (f.name === 'deploy_authority') break;
    off += idlTypeSize(f.type, types);
  }
  assert.equal(off, constants.whiteknight.deployAuthorityOffset);
});

test('seed recipes are structurally valid', () => {
  const KINDS = new Set(['literal', 'pubkey', 'u16le', 'u32le', 'u64le']);
  for (const program of ['whiteknight', 'satrush']) {
    for (const [name, seeds] of Object.entries(constants[program].seeds)) {
      if (name.startsWith('_')) continue;
      assert.ok(Array.isArray(seeds) && seeds.length >= 1, `${program}.${name}: empty recipe`);
      assert.equal(seeds[0].kind, 'literal', `${program}.${name}: first seed must be the literal tag`);
      for (const s of seeds) {
        assert.ok(KINDS.has(s.kind), `${program}.${name}: unknown kind ${s.kind}`);
        if (s.kind === 'literal') assert.ok(s.value?.length, `${program}.${name}: empty literal`);
        else assert.ok(s.name?.length, `${program}.${name}: ${s.kind} seed needs a name`);
      }
    }
  }
});
