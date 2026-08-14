// Shared test helpers. No dependencies — everything here is node built-ins.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
export const readRaw = (rel) => readFileSync(join(root, rel));
export const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');

/** Anchor discriminator: first 8 bytes of sha256("<namespace>:<name>"). */
export function anchorDiscriminator(namespace, name) {
  return [...createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8)];
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58 → bytes, or null if the string is not valid base58. Enough to validate addresses. */
export function base58Decode(s) {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const out = [];
  while (n > 0n) {
    out.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
}

/** Is this a well-formed Solana address (base58 of exactly 32 bytes)? */
export function isAddress(s) {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  const bytes = base58Decode(s);
  return bytes !== null && bytes.length === 32;
}

/** Byte size of one IDL type, recursing through arrays and defined structs. */
export function idlTypeSize(type, typesByName) {
  if (typeof type === 'string') {
    const scalar = { bool: 1, u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8, u128: 16, i128: 16, pubkey: 32 };
    if (type in scalar) return scalar[type];
    throw new Error(`unsupported scalar type "${type}"`);
  }
  if (type.array) {
    const [inner, len] = type.array;
    return idlTypeSize(inner, typesByName) * len;
  }
  if (type.defined) {
    const name = type.defined.name ?? type.defined;
    const def = typesByName.get(name);
    if (!def) throw new Error(`unknown defined type "${name}"`);
    if (def.type.kind !== 'struct') throw new Error(`cannot size non-struct "${name}"`);
    return def.type.fields.reduce((n, f) => n + idlTypeSize(f.type, typesByName), 0);
  }
  throw new Error(`unsupported type ${JSON.stringify(type)} — variable-length types have no fixed size`);
}
