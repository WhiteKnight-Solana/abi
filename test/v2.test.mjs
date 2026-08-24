// The thin-wrapper (v2) surface, pinned from the consumer's side.
//
// v2 changed the ARG BODIES of three instructions and nothing else about their identity: the
// discriminators are name-only sighash and must not have moved, or the atomic-cutover story
// ("an old crank fails borsh decode loudly") silently becomes "an old crank calls a different
// instruction". Every byte offset a downstream encoder will hardcode is derived here from the
// IDL and cross-checked against constants.json, so the two cannot drift apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, anchorDiscriminator, idlTypeSize } from './helpers.mjs';

const idl = readJson('idl/whiteknight.json');
const constants = readJson('constants.json');
const wk = constants.whiteknight;
const types = new Map((idl.types ?? []).map((t) => [t.name, t]));
const ix = (name) => idl.instructions.find((i) => i.name === name);

test('the three rewritten instructions kept their discriminators and take items', () => {
  for (const [name, item] of [
    ['wk_deploy_batch', 'DeployItem'],
    ['wk_buy_epoch_tickets_batch', 'BuyTicketItem'],
    ['wk_buy_one_btc_tickets_batch', 'BuyTicketItem'],
  ]) {
    const i = ix(name);
    assert.ok(i, `${name} missing`);
    assert.deepEqual(
      i.discriminator,
      anchorDiscriminator('global', name),
      `${name}: the discriminator must still be the name-only sighash — arg changes must not move it`,
    );
    const items = i.args.find((a) => a.name === 'items');
    assert.ok(items, `${name} must take an \`items\` vec`);
    assert.deepEqual(items.type, { vec: { defined: { name: item } } }, `${name} item type`);
    assert.ok(
      !i.args.some((a) => a.name === 'auth_ids'),
      `${name}: the v1 auth_ids arg must be gone`,
    );
  }
  // Deploy keeps its round_id ahead of the items.
  assert.deepEqual(
    ix('wk_deploy_batch').args.map((a) => a.name),
    ['round_id', 'items'],
  );
});

test('the item structs are byte-exact and match the published shapes', () => {
  for (const [name, shape] of Object.entries(wk.itemShapes)) {
    if (name.startsWith('_')) continue;
    const t = types.get(name);
    assert.ok(t, `${name} missing from IDL types`);
    const fields = t.type.fields;
    assert.deepEqual(
      fields.map((f) => f.name),
      shape.fields.map((f) => f.name),
      `${name} field order`,
    );
    let offset = 0;
    for (const [i, f] of shape.fields.entries()) {
      assert.equal(f.offset, offset, `${name}.${f.name} offset`);
      assert.equal(fields[i].type, f.type, `${name}.${f.name} type`);
      offset += idlTypeSize(fields[i].type, types);
    }
    assert.equal(offset, shape.bytes, `${name} total width`);
  }
});

test('the deploy batch dropped previous_round and holds at 13 shared accounts', () => {
  const names = ix('wk_deploy_batch').accounts.map((a) => a.name);
  assert.equal(names.length, 13, `13 shared accounts, got ${names.length}: ${names}`);
  assert.ok(!names.includes('previous_round'), 'the strike account left with the strike gate');
  // The lock budget that sets MAX_BATCH_SIZE_DEPLOY: 13 + program + ComputeBudget + 5/user.
  assert.ok(13 + 2 + 5 * 9 <= 64, 'nine users must still fit the account-lock budget');
});

test('DuplicateAuthId is the appended error and nothing was renumbered', () => {
  const errs = idl.errors;
  assert.equal(errs.at(-1).code, 6034);
  assert.equal(errs.at(-1).name, 'DuplicateAuthId');
  // Codes are 6000 + declaration index, dense — a deletion anywhere would shift the tail.
  errs.forEach((e, i) => assert.equal(e.code, 6000 + i, `${e.name} renumbered`));
});

test('the reserved-unused params are documented and stay at their indexes', () => {
  assert.deepEqual(wk.reservedUnusedParams.indexes, [7, 10, 11, 16]);
  for (const i of wk.reservedUnusedParams.indexes) {
    assert.ok(
      Object.values(wk.params).includes(i),
      `reserved index ${i} must still be named in params — slots never vanish`,
    );
  }
});

test('the settings wire shape survived v2 byte for byte', () => {
  // Old clients keep encoding create/update unchanged; the wire field per_round_amount now
  // lands in the account's max_per_round slot (offset pinned in constants.json).
  const s = types.get('DeployerSettings');
  const width = s.type.fields.reduce((n, f) => n + idlTypeSize(f.type, types), 0);
  assert.equal(width, 124, 'DeployerSettings is still 124 bytes');
  assert.equal(s.type.fields.at(-1).name, 'btc_share_bps');
  assert.equal(wk.maxPerRound.deployerFieldOffset, 107);
});
