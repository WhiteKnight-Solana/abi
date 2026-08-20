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

// =====================================================================================
// user_flags — the per-position switches this package publishes for clients to act on.
//
// `userFlagsOffset` and the bit indices are the whole interface: a decoder that reads the
// wrong offset reports a user as paused when they are not, and a client that sends the wrong
// bit turns off the wrong thing. Neither is expressible inside the Anchor IDL, so both are
// published here — and both are DERIVED from the IDL below rather than trusted as typed.
// =====================================================================================

test('userFlagsOffset is derived from the IDL, not asserted', () => {
  const fields = types.get('Deployer').type.fields;
  const idx = fields.findIndex((f) => f.name === 'user_flags');
  assert.ok(idx > 0, 'Deployer has no user_flags field');
  assert.deepEqual(fields[idx].type, 'u64', 'user_flags must stay a u64 bit field');

  const derived =
    8 + fields.slice(0, idx).reduce((n, f) => n + idlTypeSize(f.type, types), 0);
  assert.equal(
    derived,
    constants.whiteknight.userFlagsOffset,
    `IDL puts user_flags at byte ${derived}, constants publish ${constants.whiteknight.userFlagsOffset}`,
  );
  assert.equal(derived, 205, 'the published offset every decoder reads');

  // It is a CARVE: it must sit after every field that predates it and immediately before the
  // remaining reserve, or `accountLens` moved and every dataSize filter broke.
  assert.equal(fields.at(-1).name, 'reserved', 'user_flags must not be the last field');
  assert.equal(fields[idx + 1].name, 'reserved', 'a carve comes off the FRONT of the reserve');
  assert.equal(
    derived + 8 + constants.whiteknight.reserveWidths.Deployer,
    constants.whiteknight.accountLens.Deployer,
    'offset + the field + what is left of the reserve must be the whole account',
  );
});

test('the published flag bits are distinct, in range, and zero means unchanged behaviour', () => {
  const bits = Object.entries(constants.whiteknight.userFlags).filter(([k]) => !k.startsWith('_'));
  assert.equal(bits.length, 3, 'every switch the program knows must be published, and no others');
  const seen = new Set();
  for (const [name, index] of bits) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < 64, `${name}: ${index} is not a u64 bit index`);
    assert.ok(!seen.has(index), `${name} collides with another switch on bit ${index}`);
    seen.add(index);
  }
  // Pinned: these are an ABI. A renumber silently repoints every client's toggle at the
  // other switch, and the program refuses unknown bits, so a wrong index is not even loud.
  assert.equal(constants.whiteknight.userFlags.PAUSE_MINING, 0);
  assert.equal(constants.whiteknight.userFlags.HOLD_VAULT_BUYS, 1);
  assert.equal(constants.whiteknight.userFlags.HOLD_SATS, 2);
});

test('set_user_flags takes a mask and a value and has no operator branch', () => {
  const ix = idl.instructions.find((i) => i.name === 'set_user_flags');
  assert.ok(ix, 'set_user_flags is missing from the IDL');
  assert.deepEqual(
    ix.args.map((a) => [a.name, a.type]),
    [
      ['mask', 'u64'],
      ['value', 'u64'],
    ],
    'mask/value is what lets two switches move independently without a read-modify-write',
  );

  // THE access-control shape, published so a client cannot get it wrong: the signer is the
  // position OWNER. There is no config account and no crank account, so nothing about this
  // instruction can be reached by an operator.
  const accounts = ix.accounts.map((a) => a.name);
  assert.deepEqual(accounts, ['authority', 'manager', 'deployer']);
  assert.equal(ix.accounts[0].signer, true, 'the owner signs');
  assert.equal(ix.accounts[2].writable, true, 'the deployer is the account written');
  assert.ok(!accounts.includes('config'), 'not an admin path');
});

test('adding the switches did not disturb what live clients already send', () => {
  // The upgrade that introduced user_flags is only safe because these did not move. Pinned
  // here, in the package every client builds against, rather than only in the program repo.
  const settings = types.get('DeployerSettings').type.fields.map((f) => f.name);
  assert.ok(!settings.includes('user_flags'), 'the switches must NOT be in the settings struct');
  assert.deepEqual(settings.at(-1), 'btc_share_bps', 'the settings wire format is unchanged');

  for (const name of ['create_deployer', 'update_deployer']) {
    const ix = idl.instructions.find((i) => i.name === name);
    assert.deepEqual(
      ix.args.map((a) => a.name),
      ['settings'],
      `${name} still takes exactly one DeployerSettings argument`,
    );
  }
});

// =====================================================================================
// remainingAccounts — the shape an IDL cannot describe.
//
// An Anchor IDL names a fixed account list. The batch instructions then append a repeating
// run whose stride the IDL says nothing about, so a client that gets the stride wrong does
// not fail at compile time or at decode time: it sends a transaction that either reverts, or
// — the dangerous case — is reinterpreted as a different number of users. This block is the
// only published statement of that shape, which makes it worth testing as an interface.
// =====================================================================================

test('the published claim_sats stride is self-consistent', () => {
  const ra = constants.whiteknight.remainingAccounts;
  assert.ok(ra, 'remainingAccounts is not published');
  const c = ra.wk_claim_sats_batch;
  assert.ok(c, 'wk_claim_sats_batch shape is not published');

  // Only shapes for instructions that actually exist, or a rename leaves a lie behind.
  for (const name of Object.keys(ra).filter((k) => !k.startsWith('_'))) {
    assert.ok(
      idl.instructions.some((i) => i.name === name),
      `remainingAccounts names ${name}, which is not an instruction in this IDL`,
    );
  }

  assert.deepEqual(c.perUser, [4, 5], 'four or five accounts per user, in ascending order');
  // `order` must describe the LONGEST accepted shape, and the optional tail must start exactly
  // where the shorter shape ends — otherwise a client building the five-account form has no
  // way to know which name the extra account takes.
  assert.equal(c.order.length, Math.max(...c.perUser), 'order must name every account of the longest shape');
  assert.equal(c.optionalFrom, Math.min(...c.perUser), 'the optional tail begins where the shortest shape ends');
  assert.equal(new Set(c.order).size, c.order.length, 'account names must be distinct');
  assert.equal(c.order[c.optionalFrom], 'deployer', 'the fifth account is the Deployer that carries user_flags');

  // The two refusals are quoted by name, so they must be real errors this program can throw.
  // A typo here sends a client hunting for a code that does not exist.
  for (const named of Object.values(c.errors)) {
    assert.ok(
      idl.errors.some((e) => e.name === named),
      `remainingAccounts quotes error ${named}, which this IDL does not define`,
    );
  }
});

test('the fifth account is what makes HOLD_SATS enforceable, and the IDL agrees it is not named', () => {
  // The flag lives on Deployer. If some future edit adds `deployer` to the instruction's FIXED
  // account list, the fifth remaining account becomes redundant and this published shape becomes
  // actively misleading — so tie the two together rather than letting them drift apart.
  const ix = idl.instructions.find((i) => i.name === 'wk_claim_sats_batch');
  assert.ok(ix, 'wk_claim_sats_batch is missing from the IDL');
  assert.ok(
    !ix.accounts.some((a) => a.name === 'deployer'),
    'deployer is now a named account — the published remaining-account shape must be revisited',
  );

  // And the account it names must be one this IDL actually defines, carrying the flag field.
  const dep = (idl.accounts ?? []).find((a) => a.name === 'Deployer');
  assert.ok(dep, 'Deployer is not an account in this IDL');
  const fields = types.get('Deployer').type.fields;
  assert.ok(
    fields.some((f) => f.name === 'user_flags'),
    'Deployer no longer carries user_flags — HOLD_SATS could not be enforced',
  );
});
