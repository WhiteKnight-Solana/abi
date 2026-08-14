# WhiteKnight ABI

The canonical, versioned interface of the WhiteKnight program — an autominer for
[Sat Rush](https://satrush.io). If you are building against WhiteKnight, this repo is the one
source of truth for *what the program looks like on the wire*: its IDL, its addresses, and the
byte-exact layout facts an IDL cannot carry.

> **Status: pre-mainnet.** The program is not deployed to mainnet yet. Every address that does
> not exist yet is an explicit `null` listed under `pending` in `addresses.json`, and is
> published here the moment it is real. Everything else — the IDL, the layouts, the Sat Rush
> anchors — is final and test-pinned.

## What is in here

| Artifact | Contents |
| --- | --- |
| `idl/whiteknight.json` | The Anchor IDL exactly as `anchor build` produced it: 23 instructions, 3 accounts, 21 events, 34 error codes, all discriminators |
| `addresses.json` | Per-cluster addresses: the WhiteKnight program (null until deployed), the Sat Rush program, USDC/cbBTC mints, token programs |
| `constants.json` | What the IDL cannot express: account lengths (`WkConfig` 753, `Manager` 331, `Deployer` 443 — these double as `getProgramAccounts` dataSize filters), PDA seed recipes for both programs, the param/flag tables, and every Sat Rush account size |
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

const programId = addresses.clusters.mainnet.whiteknightProgram; // null until deployed
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
- **`scripts/sync-check.mjs`** is the maintainer-side gate: run next to a checkout of the
  program source, it byte-compares this IDL against the freshly built one. Without that
  checkout (public CI, your machine) it skips cleanly — it can only go red on real drift.

```
npm test            # all of the above
npm run check       # verify committed dist/ + MANIFEST are current
npm run sync-check  # maintainers: compare against the program build
```

## Updating (maintainers)

1. Copy the new `target/idl/whiteknight.json` over `idl/whiteknight.json`.
2. Adjust `constants.json` / `addresses.json` if layouts or addresses changed.
3. `WK_SOURCE_COMMIT=<program-commit> WK_EXPORTED_AT=<date> node scripts/build.mjs`
4. `npm test`, commit, push — and announce the new commit hash to consumers.

## Dependencies

None. Zero runtime dependencies, zero dev dependencies — the tests run on `node:test`. There
is nothing here for a supply-chain attack to ride in on.
