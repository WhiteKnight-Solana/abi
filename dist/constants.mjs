// GENERATED from constants.json by scripts/build.mjs — do not edit by hand.
// Regenerate with: node scripts/build.mjs
export default {
  "_comment": "Layout constants that are not expressible inside the Anchor IDL. Account lengths are byte-exact and double as getProgramAccounts dataSize filters, so a drift here is a silent empty scan — test/idl.test.mjs re-derives every length from the IDL type definitions and fails if this file disagrees.",
  "whiteknight": {
    "accountLens": {
      "WkConfig": 753,
      "Manager": 331,
      "Deployer": 443
    },
    "reserveWidths": {
      "_comment": "The launch reserve: zero bytes appended pre-deploy that future fields are carved from, front-first, so accountLens never move. Deployer has had 18 bytes carved (btc_share_bps u16 + epoch_units_bought u64 + btc_units_bought u64).",
      "WkConfig": 256,
      "Manager": 256,
      "Deployer": 238
    },
    "paramCount": 32,
    "deployAuthorityOffset": 40,
    "maxShardsHardCap": 21,
    "params": {
      "MIN_DEPLOY_AMOUNT": 2,
      "MAX_PER_ROUND_AMOUNT": 3,
      "MIN_TILE_COUNT": 4,
      "MAX_TILE_COUNT": 5,
      "TILE_TOTAL": 6,
      "HASHRATE_TILE_COEFF": 7,
      "MAX_BATCH_SIZE_DEPLOY": 8,
      "AUTH_PDA_RENT_LAMPORTS": 9,
      "EPOCH_SHARE_CAP_BPS": 10,
      "HASHRATE_BUY_THRESHOLD": 11,
      "ROUND_DURATION_SLOTS_HINT": 12,
      "PLATFORM_BPS_FEE": 13,
      "PLATFORM_FLAT_FEE": 14,
      "CLAIM_SATS_TICKETS": 15,
      "EPOCH_FLOOR_TICKETS": 16
    },
    "flags": {
      "_comment": "Bit INDICES into WkConfig.flags (u64). The flag value is 1n << index.",
      "PAUSED_ALL": 0,
      "PAUSED_DEPLOY": 1,
      "SETTLE_RENT_TO_US": 2,
      "ALLOW_NEW_MANAGERS": 3
    },
    "seeds": {
      "_comment": "PDA seed recipes, in order. kind=literal is UTF-8 bytes of value; kind=pubkey is the named account's 32 bytes; u16le/u32le/u64le are the named argument little-endian.",
      "config": [
        {
          "kind": "literal",
          "value": "wk-config"
        }
      ],
      "manager": [
        {
          "kind": "literal",
          "value": "wk-manager"
        },
        {
          "kind": "pubkey",
          "name": "authority"
        },
        {
          "kind": "u16le",
          "name": "index"
        }
      ],
      "deployer": [
        {
          "kind": "literal",
          "value": "wk-deployer"
        },
        {
          "kind": "pubkey",
          "name": "manager"
        }
      ],
      "auth": [
        {
          "kind": "literal",
          "value": "wk-auth"
        },
        {
          "kind": "pubkey",
          "name": "manager"
        },
        {
          "kind": "u64le",
          "name": "authId"
        }
      ]
    }
  },
  "satrush": {
    "_comment": "Sat Rush is a third-party program WhiteKnight CPIs into. Sizes were verified against live mainnet accounts of every type; its upgrade authority can redeploy at any time, so clients must length-check before decoding and halt on mismatch rather than read shifted fields.",
    "unitsPerTicket": 100,
    "tileCount": 21,
    "sizes": {
      "Board": 93,
      "Miner": 115,
      "PublicDeployment": 136,
      "Round": 470,
      "EpochVaultIteration": 1036,
      "EpochVaultEntry": 89,
      "EpochVaultPage": 1347,
      "EpochVault": 95,
      "OneBtcVault": 79,
      "OneBtcVaultIteration": 104,
      "OneBtcVaultEntry": 94,
      "SatsVault": 67,
      "SatrushConfig": 287,
      "Treasury": 59,
      "PublicAutomation": 129
    },
    "states": {
      "round": [
        "Active",
        "Revealed",
        "Settled",
        "Finished"
      ],
      "epoch": [
        "Open",
        "Settling",
        "Settled",
        "Complete"
      ],
      "oneBtc": [
        "Open",
        "Settled",
        "Complete"
      ]
    },
    "seeds": {
      "config": [
        {
          "kind": "literal",
          "value": "satrush_config"
        }
      ],
      "board": [
        {
          "kind": "literal",
          "value": "board"
        }
      ],
      "satsVault": [
        {
          "kind": "literal",
          "value": "sats_vault"
        }
      ],
      "epochVault": [
        {
          "kind": "literal",
          "value": "epoch_vault"
        }
      ],
      "oneBtcVault": [
        {
          "kind": "literal",
          "value": "one_btc_vault"
        }
      ],
      "treasury": [
        {
          "kind": "literal",
          "value": "treasury"
        }
      ],
      "eventAuthority": [
        {
          "kind": "literal",
          "value": "__event_authority"
        }
      ],
      "round": [
        {
          "kind": "literal",
          "value": "round"
        },
        {
          "kind": "u32le",
          "name": "roundId"
        }
      ],
      "miner": [
        {
          "kind": "literal",
          "value": "miner"
        },
        {
          "kind": "pubkey",
          "name": "authority"
        }
      ],
      "publicDeployment": [
        {
          "kind": "literal",
          "value": "public_deployment"
        },
        {
          "kind": "pubkey",
          "name": "authority"
        },
        {
          "kind": "u32le",
          "name": "roundId"
        }
      ],
      "publicAutomation": [
        {
          "kind": "literal",
          "value": "public_automation"
        },
        {
          "kind": "pubkey",
          "name": "authority"
        }
      ],
      "epochVaultIteration": [
        {
          "kind": "literal",
          "value": "epoch_vault_iteration"
        },
        {
          "kind": "u32le",
          "name": "iterationId"
        }
      ],
      "epochVaultPage": [
        {
          "kind": "literal",
          "value": "epoch_vault_page"
        },
        {
          "kind": "u32le",
          "name": "iterationId"
        },
        {
          "kind": "u16le",
          "name": "pageIndex"
        }
      ],
      "epochVaultEntry": [
        {
          "kind": "literal",
          "value": "epoch_vault_entry"
        },
        {
          "kind": "u32le",
          "name": "iterationId"
        },
        {
          "kind": "pubkey",
          "name": "authority"
        }
      ],
      "oneBtcVaultIteration": [
        {
          "kind": "literal",
          "value": "one_btc_vault_iteration"
        },
        {
          "kind": "u32le",
          "name": "iterationId"
        }
      ]
    }
  }
};
