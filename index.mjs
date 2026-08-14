// @whiteknight-solana/abi — the canonical WhiteKnight ABI.
//
// Three artifacts, one rule: consume this package by git COMMIT HASH, never by branch.
//
//   idl        the Anchor IDL exactly as `anchor build` produced it (instructions, accounts,
//              events, errors, types — with their discriminators)
//   addresses  per-cluster on-chain addresses; null = not deployed there yet (see `pending`)
//   constants  byte-exact layout facts the IDL cannot express: account lengths, PDA seed
//              recipes, param/flag tables, and the Sat Rush account sizes we CPI against
//   manifest   sha256 of each artifact plus the program-source commit they were exported from
//
// The .mjs wrappers under dist/ are generated from the JSONs and committed, so importing this
// package needs no JSON-module support, no build step, and no install scripts.

export { default as idl } from './dist/idl.mjs';
export { default as addresses } from './dist/addresses.mjs';
export { default as constants } from './dist/constants.mjs';
export { default as manifest } from './dist/manifest.mjs';
