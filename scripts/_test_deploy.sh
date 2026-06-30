#!/usr/bin/env bash
set -euo pipefail
cd /workspace
RPC=https://node.testnet.casper.network
CHAIN=casper-test
SK=/workspace/keys/secret_key.pem
NAME=ClaimTopicsRegistry

casper-client put-transaction session \
  --node-address "$RPC" \
  --chain-name "$CHAIN" \
  --secret-key "$SK" \
  --wasm-path "./wasm/CTR_fixed.wasm" \
  --pricing-mode classic \
  --payment-amount 400000000000 \
  --standard-payment true \
  --gas-price-tolerance 1 \
  --install-upgrade \
  --session-arg "odra_cfg_is_upgradable:bool:'true'" \
  --session-arg "odra_cfg_is_upgrade:bool:'false'" \
  --session-arg "odra_cfg_allow_key_override:bool:'true'" \
  --session-arg "odra_cfg_package_hash_key_name:string:'${NAME}_package_hash'"
