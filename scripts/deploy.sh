#!/usr/bin/env bash
# Deploy Casper3643 contracts to Casper testnet (or mainnet) via casper-client.
#
# Run inside the casper3643-builder Docker image (casper-client + wasm/ are there),
# or locally with casper-client installed. Requires a funded keypair (faucet for testnet).
#
#   docker run --rm -e USER=root -v "$PWD":/workspace -v casper3643-rustup:/usr/local/rustup \
#     -v casper3643-cargo:/usr/local/cargo/registry -w /workspace casper3643-builder \
#     bash scripts/deploy.sh
#
# Env: SECRET_KEY (path to secret_key.pem), RPC (node rpc url), CHAIN (casper-test|casper),
#      GAS_TOLERANCE (motes, default 1000 CSPR cap).
#
# Deploy order follows contract dependencies (each contract receives the already-deployed
# addresses of its dependencies in its constructor args):
#   1. ClaimTopicsRegistry, TrustedIssuersRegistry   (no deps)
#   2. IdentityRegistry                               (topics, issuers)
#   3. CountryAllowlist                               (identity)
#   4. ModularCompliance                              (no args; modules bound after)
#   5. MaxHolding                                     (token = SecurityToken, set later)
#   6. SecurityToken                                  (identity, compliance)
#   7. AttestationRegistry, AgentReputation           (no deps)
# After each deploy, record the returned package hash for the next step's args.
set -euo pipefail

SECRET_KEY="${SECRET_KEY:-./keys/secret_key.pem}"
RPC="${RPC:-https://node.testnet.casper.network/rpc}"
CHAIN="${CHAIN:-casper-test}"
GAS_TOLERANCE="${GAS_TOLERANCE:-1000000000000}" # 1000 CSPR cap
WASM_DIR="${WASM_DIR:-./wasm}"

# Reusable Odra deploy args (every Odra contract expects these 4).
odra_cfg () { # $1 = contract name (used as the package-hash key name)
  echo "--session-arg odra_cfg_package_hash_key_name:string:'$1_package_hash'"
  echo "--session-arg odra_cfg_allow_key_override:bool:'true'"
  echo "--session-arg odra_cfg_is_upgradable:bool:'true'"
  echo "--session-arg odra_cfg_is_upgrade:bool:'false'"
}

deploy () { # $1 = name, $2.. = extra session args
  local name="$1"; shift
  echo ">>> Deploying $name ..."
  casper-client put-transaction session \
    --node-address "$RPC" --chain-name "$CHAIN" --secret-key "$SECRET_KEY" \
    --gas-price-tolerance "$GAS_TOLERANCE" --pricing-mode fixed \
    --transaction-path "$WASM_DIR/$name.wasm" \
    $(odra_cfg "$name") "$@"
  echo "    (record the package hash from the deploy receipt before deploying dependents)"
  echo
}

# 1. Leaf registries (no dependencies).
deploy ClaimTopicsRegistry
deploy TrustedIssuersRegistry

# 2. IdentityRegistry — needs topics + issuers package hashes (fill after step 1).
# deploy IdentityRegistry \
#   --session-arg "topics_addr:key='claim_topics_package_hash'" \
#   --session-arg "issuers_addr:key='trusted_issuers_package_hash'"

# 3. CountryAllowlist — needs identity package hash.
# deploy CountryAllowlist --session-arg "identity_addr:key='identity_registry_package_hash'"

# 4. ModularCompliance — no constructor args.
deploy ModularCompliance

# 5. SecurityToken — needs identity + compliance package hashes + token params.
# deploy SecurityToken \
#   --session-arg "symbol:string='SEC'" --session-arg "name:string='Security Token'" \
#   --session-arg "decimals:u8:'8'" --session-arg "initial_supply:u512:'1000000'" \
#   --session-arg "identity_addr:key='identity_registry_package_hash'" \
#   --session-arg "compliance_addr:key='modular_compliance_package_hash'"

# 6. AttestationRegistry + AgentReputation (no deps on the token).
deploy AttestationRegistry # --session-arg "agent:key='<agent_public_key>'"
deploy AgentReputation     # --session-arg "slash_pct:u32:'10'"

# 7. Post-deploy wiring (separate transactions):
#    - ModularCompliance.bind_country_module(CountryAllowlist package)
#    - ModularCompliance.bind_max_holding_module(MaxHolding package)  (deploy MaxHolding first with token=SecurityToken)
#    - ClaimTopicsRegistry.add_claim_topic(1)            # KYC
#    - TrustedIssuersRegistry.add_trusted_issuer(agent, [1])
#    - IdentityRegistry.register_identity(investor_wallet, country)
#    - SecurityToken.add_agent(agent)

echo "=== Deploy script scaffold complete ==="
echo "Fill in the package hashes from each receipt, then re-run with the commented steps."
