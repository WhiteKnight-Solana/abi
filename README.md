# WhiteKnight ABI

The canonical, versioned interface of the WhiteKnight program — an autominer for
[Sat Rush](https://satrush.io). If you are building against WhiteKnight, this repo is the one
source of truth for *what the program looks like on the wire*: its IDL, its addresses, and the
byte-exact layout facts an IDL cannot carry.

> **Status: this commit describes the sub-miner SOL release** (owner `withdraw_sol`, the one-time
> sub-miner SOL sweep, `close_shard`'s RUSH leg, the 26-account settle). The program id is
> **`WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS`**, published in `addresses.json` and
> test-pinned. Verify it yourself rather than trusting this file:
>
> ```bash
> solana program show WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS --url mainnet-beta
> ```
>
> **Custody, stated plainly:** that command also prints the program's **upgrade authority** —
> currently the single key `3B8wpWfD1T9oAhyDrAWEQU3Zxpog3nmrShr2XoEVXUML`, which is also the
> platform admin and fee collector. Whoever holds it can replace the deployed code, including
> the withdraw path, in one transaction with no delay. Deposits are non-custodial *as far as
> the deployed code goes*, and the deployed code can be changed by that key. A move to a
> multisig is planned before meaningful TVL; until the on-chain authority says a multisig,
> assume a single key. The release bytecode this commit describes is sha256
> `fd3db487966f6211ce015cd887855d96cbfa5ed0fe3b1a79b45097185da25cd6` over its 699,992-byte release prefix, also published as
> `constants.whiteknight.wkBytecode` (`solana program dump` pads with zeros to the allocated
> length: truncate before hashing).

## What is in here

| Artifact | Contents |
| --- | --- |
| `idl/whiteknight.json` | The Anchor IDL exactly as `anchor build` produced it: 27 instructions, 3 accounts, 27 events, 42 error codes, all discriminators |
| `addresses.json` | Per-cluster addresses: the WhiteKnight program, the Sat Rush program, USDC/cbBTC mints, token programs. A `null` means "not on that cluster"; the `pending` list names every null so absence is machine-checked |
| `constants.json` | What the IDL cannot express: account lengths (`WkConfig` 753, `Manager` 331, `Deployer` 443; these double as `getProgramAccounts` dataSize filters), the launch reserves (`WkConfig` has carved `sol_sweep_done` at byte 497, leaving 255), PDA seed recipes for both programs, the param/flag tables, the per-user remaining-account strides, the release bytecode (`wkBytecode`), the accounts a sub-miner's first deploy pays rent for (`subMinerDeployRentBytes`), and every Sat Rush account size |
| `fixtures/satstacker-onboard.json` | A byte copy of the program's onboarding fixture: the settings struct the program is proven to accept, for client encoders to test against |
| `MANIFEST.json` | sha256 of each artifact + the program-source commit they were exported from |

The `dist/*.mjs` files are generated ESM wrappers of the JSONs, committed so that consuming
this package needs no build step, no install scripts, and no JSON-module support.

## How to consume it

**Always pin a commit hash.** Branches move; the hash you audited is the hash you run.

```jsonc
// package.json
"dependencies": {
  "@whiteknight-solana/abi": "github:WhiteKnight-Solana/abi#<commit-sha>"
}
```

```js
import { idl, addresses, constants, manifest } from '@whiteknight-solana/abi';

const programId = addresses.clusters.mainnet.whiteknightProgram; // WKhLkiPw8dSMoV1n81Mxyo61Eu3rH9CKtQTnLjGv4BS
const deployerLen = constants.whiteknight.accountLens.Deployer;  // 443
```

Install with `--ignore-scripts` if you want — nothing here needs a lifecycle script.

## Staleness checks

This repo's tests exist to make drift impossible to ship, in either direction:

- **`test/idl.test.mjs`** re-derives every discriminator from `sha256("global:…" / "account:…" /
  "event:…")` and every account length from the IDL's own type definitions, then compares them
  to what the IDL and `constants.json` claim. A hand-edited IDL or a constants file that
  survived a program change fails by name.
- **`test/manifest.test.mjs`** recomputes each artifact's sha256 against `MANIFEST.json`.
- **`test/generated.test.mjs`** deep-compares each committed `dist/*.mjs` against its source
  JSON, so the generated wrappers cannot go stale.
- **`test/addresses.test.mjs`** validates every address as 32-byte base58, requires `pending` to
  name exactly the nulls, and enforces the one rule with real teeth: the development
  `declare_id` (which is in public git history) can never be published as the mainnet program id.
- **`scripts/sync-check.mjs`** is the maintainer-side gate: it byte-compares this IDL and the
  onboarding fixture against the program pinned in `package.json`, and the user_flag bits
  against its `state.rs`. Install the pin first (`npm install --ignore-scripts`; the program
  repo is private, so this needs read access to it). A missing file fails; it never skips.

```
npm test            # all of the above
npm run check       # verify committed dist/ + MANIFEST are current
npm run sync-check  # maintainers: compare against the program build
```

## Updating (maintainers)

1. Pin the program commit being published (already on GitHub):
   `npm pkg set "devDependencies.@whiteknight-solana/whiteknight=github:WhiteKnight-Solana/whiteknight#<commit>"`,
   then `npm install --ignore-scripts`.
2. Copy the pinned `idl/whiteknight.json` and `programs/whiteknight/tests/fixtures/satstacker-onboard.json`
   from `node_modules/@whiteknight-solana/whiteknight/` over `idl/` and `fixtures/`.
3. Adjust `constants.json` / `addresses.json` if layouts, addresses or the release bytecode changed.
4. `WK_SOURCE_COMMIT=<program-commit> WK_EXPORTED_AT=<date> node scripts/build.mjs`
5. `npm test`, `npm run sync-check`, commit, push, and announce the new commit hash to consumers.

## Dependencies

Zero runtime dependencies, so consumers install nothing through this package. One dev
dependency, the program itself, pinned by commit hash from its own repo and read only by
`sync-check`; the tests run on `node:test` with no install. There is nothing here for a
supply-chain attack to ride in on.

There is deliberately no `build` script (the generator is `npm run generate`). npm "prepares"
a git dependency that has a `build`, `prepare`, `prepack` or install script by installing its
dev dependencies first, so with one every consumer's install would try to fetch the private
program pin, and fail wherever it has no access to that repo (CI, Render, Vercel).
