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

test('the sub-miner SOL errors are appended after DuplicateAuthId and nothing was renumbered', () => {
  const errs = idl.errors;
  const at = (i) => [errs[i].code, errs[i].name];
  assert.deepEqual(at(34), [6034, 'DuplicateAuthId']);
  assert.deepEqual(at(38), [6038, 'SubMinerHoldsRush']);
  assert.deepEqual(at(41), [6041, 'NotSweepAuthority']);
  // Codes are 6000 + declaration index, dense: a deletion anywhere would shift the tail.
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

test('Sat Rush v2 claim surfaces publish every shared and per-user account in wire order', () => {
  const sats = ix('wk_claim_sats_batch');
  assert.deepEqual(sats.discriminator, anchorDiscriminator('global', 'wk_claim_sats_batch'));
  assert.deepEqual(sats.args.map((a) => a.name), ['auth_ids']);
  assert.deepEqual(sats.accounts.map((a) => a.name), [
    'crank',
    'config',
    'btc_mint',
    'token_mint',
    'satrush_config',
    'sats_vault',
    'token_vault',
    'sats_vault_btc_ata',
    'token_vault_token_ata',
    'event_authority',
    'satrush_program',
    'token_program',
    'associated_token_program',
    'system_program',
  ]);
  assert.deepEqual(wk.remainingAccounts.wk_claim_sats_batch.perUser, [5, 6]);
  assert.deepEqual(wk.remainingAccounts.wk_claim_sats_batch.order, [
    'manager',
    'wk_auth',
    'miner',
    'btc_ata',
    'token_ata',
    'deployer',
  ]);

  const rush = ix('wk_claim_token_batch');
  assert.ok(rush, 'wk_claim_token_batch missing');
  assert.deepEqual(rush.discriminator, anchorDiscriminator('global', 'wk_claim_token_batch'));
  assert.deepEqual(rush.args.map((a) => a.name), ['auth_ids']);
  assert.deepEqual(rush.accounts.map((a) => a.name), [
    'crank',
    'config',
    'token_mint',
    'btc_mint',
    'satrush_config',
    'token_vault',
    'sats_vault',
    'token_vault_token_ata',
    'sats_vault_btc_ata',
    'event_authority',
    'satrush_program',
    'token_program',
    'associated_token_program',
    'system_program',
  ]);
  assert.deepEqual(wk.remainingAccounts.wk_claim_token_batch.perUser, [5]);
  assert.deepEqual(wk.remainingAccounts.wk_claim_token_batch.order, [
    'manager',
    'wk_auth',
    'miner',
    'token_ata',
    'btc_ata',
  ]);
});

test('Sat Rush v2 account lengths stay strict and include the RUSH vault', () => {
  assert.deepEqual(constants.satrush.sizes, {
    Board: 152,
    Miner: 201,
    PublicDeployment: 136,
    Round: 470,
    EpochVaultIteration: 1036,
    EpochVaultEntry: 89,
    EpochVaultPage: 1347,
    EpochVault: 95,
    OneBtcVault: 79,
    OneBtcVaultIteration: 104,
    OneBtcVaultEntry: 94,
    SatsVault: 67,
    TokenVault: 67,
    SatrushConfig: 328,
    Treasury: 104,
    PublicAutomation: 129,
  });
  assert.deepEqual(constants.satrush.seeds.tokenVault, [
    { kind: 'literal', value: 'token_vault' },
  ]);
});

// ---------------------------------------------------------------- the sub-miner SOL release

/** `[name, writable, signer]` for each named account, in wire order. */
const shape = (name) => ix(name).accounts.map((a) => [a.name, !!a.writable, !!a.signer]);

test('close_shard appends the RUSH leg after system_program, its ATA writable', () => {
  assert.deepEqual(shape('close_shard'), [
    ['authority', true, true],
    ['config', false, false],
    ['manager', false, false],
    ['wk_auth', true, false],
    ['wk_auth_usd_ata', true, false],
    ['wk_auth_btc_ata', true, false],
    ['usd_mint', false, false],
    ['btc_mint', false, false],
    ['miner', false, false],
    ['token_program', false, false],
    ['system_program', false, false],
    ['satrush_config', false, false],
    ['token_mint', false, false],
    ['wk_auth_token_ata', true, false],
  ]);
});

test('wk_settle_batch carries the 21 named accounts in wire order, the RUSH leg last', () => {
  const s = shape('wk_settle_batch');
  assert.equal(s.length, 21);
  assert.deepEqual(s.map(([n]) => n), [
    'crank', 'config', 'usd_mint', 'btc_mint', 'rent_recipient', 'satrush_config', 'round',
    'board', 'sats_vault', 'token_vault', 'board_usd_ata', 'board_btc_ata', 'sats_vault_btc_ata',
    'event_authority', 'satrush_program', 'token_program', 'associated_token_program',
    'system_program', 'token_mint', 'board_token_ata', 'token_vault_token_ata',
  ]);
  assert.deepEqual(s.slice(-3), [
    ['token_mint', false, false],
    ['board_token_ata', true, false],
    ['token_vault_token_ata', true, false],
  ]);
});

test('withdraw_sol: owner-signed, no Deployer, (auth_id, amount)', () => {
  const w = ix('withdraw_sol');
  assert.deepEqual(w.discriminator, anchorDiscriminator('global', 'withdraw_sol'));
  assert.deepEqual(w.args, [{ name: 'auth_id', type: 'u64' }, { name: 'amount', type: 'u64' }]);
  assert.deepEqual(shape('withdraw_sol'), [
    ['authority', true, true],
    ['config', false, false],
    ['manager', false, false],
    ['wk_auth', true, false],
    ['system_program', false, false],
  ]);
});

test('sweep_sub_miner_sol: crank-signed, config writable, (auth_ids, finish)', () => {
  const s = ix('sweep_sub_miner_sol');
  assert.deepEqual(s.discriminator, anchorDiscriminator('global', 'sweep_sub_miner_sol'));
  assert.deepEqual(s.args, [{ name: 'auth_ids', type: { vec: 'u64' } }, { name: 'finish', type: 'bool' }]);
  assert.deepEqual(shape('sweep_sub_miner_sol'), [
    ['crank', true, true],
    ['config', true, false],
    ['board', false, false],
    ['system_program', false, false],
  ]);
});

test('the sub-miner SOL events carry the published fields', () => {
  const fields = (name) => types.get(name).type.fields.map((f) => [f.name, f.type]);
  assert.deepEqual(fields('WkSolWithdrawn'), [
    ['manager', 'pubkey'], ['auth_id', 'u64'], ['authority', 'pubkey'], ['amount', 'u64'], ['remaining', 'u64'],
  ]);
  assert.deepEqual(fields('WkSubMinerSolSwept'), [
    ['manager', 'pubkey'], ['auth_id', 'u64'], ['lamports', 'u64'], ['board_round', 'u32'],
    ['last_mined_round', 'u32'], ['usdc_balance', 'u64'],
  ]);
  assert.deepEqual(fields('WkSolSweepFinished'), [['crank', 'pubkey'], ['board_round', 'u32']]);
  for (const name of ['WkSolWithdrawn', 'WkSubMinerSolSwept', 'WkSolSweepFinished']) {
    assert.ok(idl.events.some((e) => e.name === name), `${name} is not an event`);
  }
});

test('the two sweep params are named at 17 and 18', () => {
  assert.equal(wk.params.SWEEP_MAX_USDC_MICROS, 17);
  assert.equal(wk.params.SWEEP_IDLE_ROUNDS, 18);
});

test('the settle and sweep strides are self-consistent', () => {
  const idlErrors = new Set(idl.errors.map((e) => e.name));
  for (const [name, stride] of [['wk_settle_batch', 7], ['sweep_sub_miner_sol', 4]]) {
    const r = wk.remainingAccounts[name];
    assert.ok(r, `${name} stride is not published`);
    assert.deepEqual(r.perUser, [stride], `${name}: ${stride} accounts per entry`);
    assert.equal(r.order.length, stride, `${name}: order names every account`);
    assert.equal(new Set(r.order).size, stride, `${name}: account names are distinct`);
    for (const named of Object.values(r.errors)) {
      assert.ok(idlErrors.has(named), `${name} quotes error ${named}, which this IDL does not define`);
    }
  }
  assert.deepEqual(wk.remainingAccounts.sweep_sub_miner_sol.order, ['manager', 'wk_auth', 'wk_auth_usd_ata', 'miner']);
});

test('the release bytecode and the sub-miner rent accounts are published', () => {
  assert.match(wk.wkBytecode.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isInteger(wk.wkBytecode.bytes) && wk.wkBytecode.bytes > 0);
  // PublicDeployment and Miner: what a sub-miner's first deploy pays rent for in Sat Rush.
  assert.deepEqual(wk.subMinerDeployRentBytes, [
    constants.satrush.sizes.PublicDeployment,
    constants.satrush.sizes.Miner,
  ]);
});

// =====================================================================================
// The fee bucket: all of the platform's revenue in one account no hot key can move, and the
// only two ways out, both admin-signed. The recipients' accounts are unchecked on purpose (one
// wallet may fill several slots), so their order and flags are the whole interface.
// =====================================================================================

test('the fee bucket errors are appended after NotSweepAuthority and nothing was renumbered', () => {
  const errs = idl.errors;
  assert.deepEqual(errs.slice(41).map((e) => [e.code, e.name]), [
    [6041, 'NotSweepAuthority'],
    [6042, 'SplitNotWhole'],
    [6043, 'NothingToDistribute'],
    [6044, 'RentToBucketRefused'],
    [6045, 'FeeBucketAsRecipient'],
  ]);
});

test('the FeeBucket account: its fields in order, its seed and its reserve', () => {
  assert.deepEqual(types.get('FeeBucket').type.fields.map((f) => [f.name, f.type]), [
    ['recipients', { array: ['pubkey', 3] }],
    ['split_bps', { array: ['u16', 3] }],
    ['expense_wallet', 'pubkey'],
    ['distributed', { array: ['u64', 3] }],
    ['expenses', 'u64'],
    ['bump', 'u8'],
    ['reserved', { array: ['u8', 128] }],
  ]);
  assert.equal(8 + idlTypeSize({ defined: { name: 'FeeBucket' } }, types), 303);
  assert.ok(idl.accounts.some((a) => a.name === 'FeeBucket'), 'FeeBucket is a program account');
  assert.deepEqual(wk.seeds.feeBucket, [{ kind: 'literal', value: 'fee-bucket' }]);
});

test('init_fee_bucket and set_fee_split: admin-signed, the same three settings', () => {
  const settings = [
    { name: 'recipients', type: { array: ['pubkey', 3] } },
    { name: 'split_bps', type: { array: ['u16', 3] } },
    { name: 'expense_wallet', type: 'pubkey' },
  ];
  for (const name of ['init_fee_bucket', 'set_fee_split']) {
    assert.deepEqual(ix(name).discriminator, anchorDiscriminator('global', name));
    assert.deepEqual(ix(name).args, settings, `${name} args`);
  }
  assert.deepEqual(shape('init_fee_bucket'), [
    ['admin', true, true],
    ['config', false, false],
    ['fee_bucket', true, false],
    ['usd_mint', false, false],
    ['bucket_usd_ata', true, false],
    ['token_program', false, false],
    ['associated_token_program', false, false],
    ['system_program', false, false],
  ]);
  assert.deepEqual(shape('set_fee_split'), [
    ['admin', false, true],
    ['config', false, false],
    ['fee_bucket', true, false],
  ]);
});

test('pay_fee_expense and distribute_fees: admin-signed, every destination writable', () => {
  assert.deepEqual(ix('pay_fee_expense').args, [{ name: 'amount', type: 'u64' }]);
  assert.deepEqual(shape('pay_fee_expense'), [
    ['admin', false, true],
    ['config', false, false],
    ['fee_bucket', true, false],
    ['usd_mint', false, false],
    ['bucket_usd_ata', true, false],
    ['expense_usd_ata', true, false],
    ['token_program', false, false],
  ]);
  assert.deepEqual(ix('distribute_fees').args, []);
  assert.deepEqual(shape('distribute_fees'), [
    ['admin', false, true],
    ['config', false, false],
    ['fee_bucket', true, false],
    ['usd_mint', false, false],
    ['bucket_usd_ata', true, false],
    ['recipient_0_usd_ata', true, false],
    ['recipient_1_usd_ata', true, false],
    ['recipient_2_usd_ata', true, false],
    ['token_program', false, false],
  ]);
});

test('the fee bucket events carry the published fields', () => {
  const fields = (name) => types.get(name).type.fields.map((f) => [f.name, f.type]);
  assert.deepEqual(fields('WkFeeSplitSet'), [
    ['recipients', { array: ['pubkey', 3] }],
    ['split_bps', { array: ['u16', 3] }],
    ['expense_wallet', 'pubkey'],
  ]);
  assert.deepEqual(fields('WkFeeExpensePaid'), [
    ['amount', 'u64'], ['expense_wallet', 'pubkey'], ['remaining', 'u64'],
  ]);
  assert.deepEqual(fields('WkFeesDistributed'), [
    ['total', 'u64'],
    ['shares', { array: ['u64', 3] }],
    ['recipients', { array: ['pubkey', 3] }],
    ['remaining', 'u64'],
  ]);
  for (const name of ['WkFeeSplitSet', 'WkFeeExpensePaid', 'WkFeesDistributed']) {
    assert.ok(idl.events.some((e) => e.name === name), `${name} is not an event`);
  }
});
