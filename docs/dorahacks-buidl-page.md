# DoraHacks BUIDL Page Copy

Use this text to align the existing BUIDL page with the current GitHub repo.
Do **not** change the already-published demo video link.

## Short description

Casper3643 is an ERC-3643 permissioned token suite on Casper Testnet with a Verifiable AI compliance layer. Three specialist agents independently audit a real-world asset, pay per-query for data feeds via x402 (WCSPR), vote without anchoring bias, and attest the verdict on-chain through `AttestationRegistry::record_verdict`.

**GitHub:** https://github.com/yusizer/casper3643  
**Network:** Casper Testnet (`casper-test`)  
**Explorer:** https://testnet.cspr.live

## What is live today

- 11 Odra contracts deployed on Casper Testnet
- CLI demo: 3-agent quorum → signed attestation → on-chain submit
- React dashboard: wallet connect, mint, identity registration, live quorum, attestation explorer
- 14/14 OdraVM tests green
- Verifiable on-chain proof: package hashes + sample transactions below

## Deployer

`account-hash-341e9b97a43f1381474aa7f4eb9c067179298bbdca9cf4002641bcb628cc4ff4`

## Contract package hashes

| Contract | Package hash |
|---|---|
| ClaimTopicsRegistry | `hash-da6c6e926dbb58ba73f441aca5d94933dbb7ef11fc54adea314572ea8945529d` |
| TrustedIssuersRegistry | `hash-dcfd42d5dd823ac43c144ac63da05b548c15ee20dbcaf279a0fc9341345441bb` |
| IdentityRegistry | `hash-288495fe43bf4953f3e292b4d9412c39627de35351d22b6af5b9ce490ff107d2` |
| CountryAllowlist | `hash-5a019fd6ac1ec3695119e02b9303ebf23aa6b03b675e536dfe2ba8c8c7f771ac` |
| ModularCompliance | `hash-94d87629d87fb35273e47efaedaab2a7b0476a41ad26c13f076d4e3b434fa682` |
| SecurityToken | `hash-902c8706f025f30122903368c3a8d8271b1088d825221eb9244a41e3fb9cc701` |
| MaxHolding | `hash-32dd8e0200c99d9bfc051101303898c565bd652f6c8834ab23cfad063ad9e66b` |
| AttestationRegistry | `hash-6e6d3e60b0cd9cb2427be623f3d38e350a7eaa9280477e01009bf3824a180a13` |
| AgentReputation | `hash-98383423950f3852019052bcbc6ff44a95681eb06dffd45dd07c41a505d71831` |
| OnchainId | `hash-6749330cd9008eeadbc721580f5e28198690d9e723f7d874b8987b4d0bdcb89e` |
| AgentRole | `hash-cd39f4e7c0101f1f501343f103e16566a83594cccc9ae636bb8f179bda543e98` |

Full source: `deploy_hashes.sh`

## Sample Casper Testnet transactions

Verify on https://testnet.cspr.live

| Type | Tx hash | Description |
|---|---|---|
| x402 payment | `3cbe06fc5e82843358004243b7078aff7ab257864b6ac97d0b7a2279c5bab82f` | Sanctions specialist paid for its data feed (WCSPR) |
| x402 payment | `5d22939f4f07d770d9be100f3f4be043864ecdfea29250317b1798739ec1eaea` | Valuation specialist paid for its data feed (WCSPR) |
| x402 payment | `a7b641c832febf70036115eb32c14c2746f739f97bfd1bcac1375546df92f2fb` | Legal specialist paid for its data feed (WCSPR) |
| attestation | `f8107f4f83c296cd84968d66bb1b7fd421ff412091741b57fb7a398da060d870` | `AttestationRegistry::record_verdict` submitted on-chain |

## How to test

### Prereqs

- Clone: `git clone https://github.com/yusizer/casper3643`
- Copy `agent/.env.example` → `agent/.env`
- Fill: `OPENAI_API_KEY`, `CSPR_CLOUD_ACCESS_TOKEN`, `FACILITATOR_API_KEY`, `ORCHESTRATOR_KEY`

### Terminal demo

```bash
cd agent
npm install
npm run data-feed   # Terminal 1
npm run demo        # Terminal 2
```

Expected:
1. 3 specialists run in parallel
2. Each pays via x402 for its data feed
3. Orchestrator tallies a safety-first verdict
4. Terminal prints `attestation recorded on Casper testnet, tx: <hash>`
5. Paste that hash into https://testnet.cspr.live

### Dashboard

```bash
cd web
npm install
npm run dev
```

With `npm run data-feed` running, connect Casper Wallet and walk through mint, identity registration, quorum, and attestation explorer.

## Demo video

Already published on this BUIDL page. Leave the existing video link unchanged.

## Honest limitations

- Specialist data feeds are mocked for the demo; the x402 payment path is live
- Testnet deployment is the initial build; hardened source is in the repo (14/14 tests green)
- 3 agent signatures in the testnet smoke test share the deployer key
- `add_claim` and `freeze` are contract-tested but not invoked end-to-end in the CLI demo
