#!/usr/bin/env bash
# Post-deploy wiring: configure the deployed Casper3643 contracts for the demo flow.
# Idempotent-ish: calls entry points on the deployed packages. Run inside the Docker builder
# (which has casper-client) with /workspace mounted, AFTER deploy_all.sh.
#
#   docker run --rm -e USER=root -v "$PWD":/workspace -v casper3643-rustup:/usr/local/rustup \
#     -v casper3643-cargo:/usr/local/cargo/registry -w /workspace casper3643-builder \
#     bash scripts/wire.sh
set -uo pipefail
cd /workspace
RPC=https://node.testnet.casper.network
CHAIN=casper-test
SK=/workspace/keys/secret_key.pem
PAYMENT=40000000000
WAIT=12
H=/workspace/deploy_hashes.sh
ACCOUNT=account-hash-341e9b97a43f1381474aa7f4eb9c067179298bbdca9cf4002641bcb628cc4ff4

J='import sys,json
raw=sys.stdin.read()
i=raw.find("{")
d=json.loads(raw[i:]) if i>=0 else {}'

get_hash() { grep "^export $1=" "$H" 2>/dev/null | cut -d= -f2 | sed 's/^hash-//'; }

# call <package_env_name> <entry_point> <args...>
call() {
  local pkg_env="$1"; local ep="$2"; shift 2
  local pkg; pkg=$(get_hash "$pkg_env")
  [ -z "$pkg" ] && { echo "NO PACKAGE for $pkg_env"; return 1; }
  echo ""; echo "==== $pkg_env :: $ep ===="
  local out txh
  out=$(casper-client put-transaction session \
    --node-address "$RPC" --chain-name "$CHAIN" --secret-key "$SK" \
    --package-hash "$pkg" --entry-point "$ep" \
    --pricing-mode classic --payment-amount "$PAYMENT" \
    --standard-payment true --gas-price-tolerance 1 "$@" 2>&1)
  txh=$(echo "$out" | python3 -c "$J; print(d.get('result',{}).get('transaction_hash',{}).get('Version1',''))" 2>/dev/null)
  [ -z "$txh" ] && { echo "NO TX HASH:"; echo "$out" | tail -12; return 1; }
  echo "tx: $txh"; sleep "$WAIT"
  local res em
  res=$(casper-client get-transaction --node-address "$RPC" "$txh" 2>&1)
  em=$(echo "$res" | python3 -c "$J; v=d.get('result',{}).get('execution_info',{}).get('execution_result',{}).get('Version2',{}); print(v.get('error_message') or '')" 2>/dev/null)
  if [ -n "$em" ]; then echo "EXEC FAILED ($pkg_env::$ep): $em"; return 1; fi
  echo "  ok"
}

# 1. Allowlist GB (826) so EU/GB investor transfers pass the country gate.
call CountryAllowlist add_country "country:u32:'826'" || true
# 2. Register KYC claim topic = 1.
call ClaimTopicsRegistry add_claim_topic "topic:u32:'1'" || true
# 3. Make the deployer (agent) a Trusted Issuer for topic 1.
call TrustedIssuersRegistry add_trusted_issuer "issuer:key:'$ACCOUNT'" "topics:vec<u32>:'[1]'" || true
# 4. Bind the compliance modules onto ModularCompliance.
call ModularCompliance bind_country_module "module_addr:key:'$(get_hash CountryAllowlist)'" || true
call ModularCompliance bind_max_holding_module "module_addr:key:'$(get_hash MaxHolding)'" || true
# 5. Authorize the agent on the SecurityToken (agent-only freeze/pause/mint).
call SecurityToken add_agent "agent:key:'$ACCOUNT'" || true
# 6. Register the agent role (AgentRole.add_agent) — redundant if init(agent) covered it.
call AgentRole add_agent "agent:key:'$ACCOUNT'" || true

echo ""; echo "==== WIRING DONE ===="
