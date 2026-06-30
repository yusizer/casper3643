#!/usr/bin/env bash
# Auto-deploy Casper3643 suite to Casper testnet (casper-client 5.0).
# Resumable: skips contracts already in deploy_hashes.sh.
# Robust JSON parsing (casper-client prints "Skipping amount checks..." before JSON).
set -uo pipefail
cd /workspace
RPC=https://node.testnet.casper.network
CHAIN=casper-test
SK=/workspace/keys/secret_key.pem
PK=/workspace/keys/public_key.pem
PAYMENT=400000000000
WAIT=14
WASM=/workspace/wasm_opt
HASHES=/workspace/deploy_hashes.sh
ACCOUNT=account-hash-341e9b97a43f1381474aa7f4eb9c067179298bbdca9cf4002641bcb628cc4ff4
CLAIM_TOPICS=hash-da6c6e926dbb58ba73f441aca5d94933dbb7ef11fc54adea314572ea8945529d
TRUSTED_ISSUERS=hash-dcfd42d5dd823ac43c144ac63da05b548c15ee20dbcaf279a0fc9341345441bb

# json: read stdin, find first '{', parse
J='import sys,json
raw=sys.stdin.read()
i=raw.find("{")
d=json.loads(raw[i:]) if i>=0 else {}'

get_hash() { grep "^export $1=" "$HASHES" 2>/dev/null | cut -d= -f2; }
have() { [ -n "$(get_hash "$1")" ]; }

cat > "$HASHES" <<EOF
export CHAIN=$CHAIN
export DEPLOYER=$ACCOUNT
export ClaimTopicsRegistry=$CLAIM_TOPICS
export TrustedIssuersRegistry=$TRUSTED_ISSUERS
EOF

deploy() { # $1=name  rest=extra --session-arg
  local name="$1"; shift
  if have "$name"; then echo "SKIP $name (already deployed: $(get_hash "$name"))"; return 0; fi
  echo ""; echo "========== DEPLOY $name =========="
  local out txh
  out=$(casper-client put-transaction session \
    --node-address "$RPC" --chain-name "$CHAIN" --secret-key "$SK" \
    --wasm-path "$WASM/${name}.wasm" \
    --pricing-mode classic --payment-amount "$PAYMENT" \
    --standard-payment true --gas-price-tolerance 1 --install-upgrade \
    --session-arg "odra_cfg_is_upgradable:bool:'true'" \
    --session-arg "odra_cfg_is_upgrade:bool:'false'" \
    --session-arg "odra_cfg_allow_key_override:bool:'true'" \
    --session-arg "odra_cfg_package_hash_key_name:string:'${name}_package_hash'" \
    "$@" 2>&1)
  txh=$(echo "$out" | python3 -c "$J; print(d.get('result',{}).get('transaction_hash',{}).get('Version1',''))" 2>/dev/null)
  [ -z "$txh" ] && { echo "NO TX HASH:"; echo "$out" | tail -15; return 1; }
  echo "tx: $txh"; echo "  waiting ${WAIT}s..."; sleep "$WAIT"
  local res em cons h
  res=$(casper-client get-transaction --node-address "$RPC" "$txh" 2>&1)
  em=$(echo "$res" | python3 -c "$J; v=d.get('result',{}).get('execution_info',{}).get('execution_result',{}).get('Version2',{}); print(v.get('error_message') or '')" 2>/dev/null)
  if [ -n "$em" ]; then echo "EXEC FAILED: $em"; echo "$res" | tail -25; return 1; fi
  cons=$(echo "$res" | python3 -c "$J; v=d.get('result',{}).get('execution_info',{}).get('execution_result',{}).get('Version2',{}); print(v.get('consumed'))" 2>/dev/null)
  echo "  consumed: $cons"
  h=$(casper-client get-account --node-address "$RPC" --public-key "$PK" 2>&1 \
      | python3 -c "$J; nk={k['name']:k['key'] for k in d.get('result',{}).get('account',{}).get('named_keys',[])}; print(nk.get('${name}_package_hash',''))" 2>/dev/null)
  [ -z "$h" ] && { echo "NO PACKAGE HASH for $name"; return 1; }
  echo "  package: $h"
  echo "export ${name}=$h" >> "$HASHES"
}

deploy IdentityRegistry \
  --session-arg "topics_addr:key:'$CLAIM_TOPICS'" \
  --session-arg "issuers_addr:key:'$TRUSTED_ISSUERS'" \
  || exit 1
deploy CountryAllowlist \
  --session-arg "identity_addr:key:'$(get_hash IdentityRegistry)'" \
  || exit 1
deploy ModularCompliance || exit 1
deploy SecurityToken \
  --session-arg "symbol:string:'SEC'" \
  --session-arg "name:string:'Security Token'" \
  --session-arg "decimals:u8:'6'" \
  --session-arg "initial_supply:u256:'1000000000'" \
  --session-arg "identity_addr:key:'$(get_hash IdentityRegistry)'" \
  --session-arg "compliance_addr:key:'$(get_hash ModularCompliance)'" \
  || exit 1
deploy MaxHolding \
  --session-arg "token_addr:key:'$(get_hash SecurityToken)'" \
  --session-arg "limit:u256:'100000'" \
  || exit 1
deploy AttestationRegistry \
  --session-arg "agent:key:'$ACCOUNT'" \
  || exit 1
deploy AgentReputation \
  --session-arg "slash_pct:u32:'10'" \
  || exit 1
deploy OnchainId \
  --session-arg "manager:key:'$ACCOUNT'" \
  || exit 1
deploy AgentRole \
  --session-arg "agent:key:'$ACCOUNT'" \
  || exit 1

echo ""; echo "================ DONE ================"; cat "$HASHES"
