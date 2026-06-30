# Casper3643 — Judge Entry

**Casper Agentic Buildathon 2026 · Casper Innovation Track**
**Team:** solo · **Repo:** github.com/yusizer/casper3643

## One-line pitch

The first ERC-3643-compliant permissioned token suite on Casper, with a Verifiable AI
compliance layer: 3 specialist A2A agents audit a real-world asset, pay per-query for data
feeds via x402, vote without anchoring bias, and attest the verdict on-chain.

## Why this wins (Manifest alignment + gap)

Casper's Manifest makes **Compliant Security Tokens (ERC-3643)** its most detailed
initiative — Tier-1, *"buildable today with no protocol changes"* — and Casper joined the
ERC-3643 Association. Yet **no submission builds the actual ERC-3643 permissioned-token
standard on Casper** (others are oracles/escrow, not identity-registry + enforced
transfers). This project fills that gap and adds the agentic layer Casper's roadmap calls
for: agents that **transact, not chat**.

It hits all three Casper pillars:
- **Native for Machines** — x402 micropayments for per-query data feeds
- **Trusted by Institutions** — ERC-3643 identity registry + modular compliance + enforced transfers
- **Verifiable AI** — verdict + reasoning hash + agent signatures + payment tx hashes on-chain

## What it does (demo flow)

1. **Issue** a regulated RWA token (tokenized real-estate unit) on Casper testnet.
2. **Onboard investor**: the sanctions/KYC agent (a Trusted Issuer) verifies identity and
   signs a KYC claim → `is_verified` = true → transfers allowed.
3. **Compliance gate**: a transfer to a non-verified wallet or a non-allowlisted country is
   reverted on-chain by the SecurityToken.
4. **Compliance Quorum**: 3 specialist A2A agents independently audit the asset — each pays
   (x402, WCSPR) for its data feed, returns a structured verdict; the orchestrator tallies
   (2/3 supermajority, safety-first). Verdict + reasoning hash + 3 agent signatures + 3
   payment tx hashes are attested on Casper (`VerdictAttested` event).
5. **Autonomous enforcement**: on a REJECT/sanctions hit, the agent calls the agent-only
   `freeze`/`pause` entry points — no human in the loop.
6. **Reputation**: each agent's verdict is logged; when the real-world outcome resolves, its
   Brier score updates and a wrong confident call slashes its stake.

## Architecture

- **On-chain (Odra/Rust → WASM, 12 contracts):** SecurityToken (extends Cep18, compliance
  gate, agent-only ops), IdentityRegistry + claims + is_verified, ClaimTopicsRegistry,
  TrustedIssuersRegistry, ModularCompliance + CountryAllowlist + MaxHolding, AgentRole,
  AttestationRegistry (Verifiable AI), AgentReputation (Brier + stake/slash).
- **Off-chain (TypeScript):** x402 client (per-agent payment, EIP-712
  TransferWithAuthorization), paid data-feed server (sanctions/valuation/legal), 3
  specialist agents (OpenAI structured outputs, safety-first prompts, temperature 0),
  orchestrator (parallel, no anchoring bias), attestation submitter.
- **Frontend (React):** CSPR.click-style dashboard via Casper Wallet — issue token, register
  identity, run quorum, attestation explorer, reputation table.

## Verifiable proof

- 14/14 OdraVM unit + wiring tests green (`cargo odra test`)
- 10 optimized WASM contracts built + deployed on Casper testnet (package hashes in
  `deploy_hashes.sh`; deployer `account-hash-341e9b…`, funded on testnet)
- TypeScript agent + web layers typecheck clean (`tsc --noEmit`)
- Live demo: `cd agent && npm run demo` — 3-specialist quorum fans out (x402 paid data
  feeds), each agent signs the canonical attestation digest (secp256k1, verified on-chain by
  `AttestationRegistry::record_verdict`), and the verdict is submitted on Casper. The
  canonical digest is `keccak256(subject ‖ [verdict] ‖ confidence_be32 ‖ reasoning_hash ‖
  evidence_hash)`, matching the contract's `canonical_hash` exactly.

## Differentiation (vs. the field)

- **Only ERC-3643 standard** submission (others are oracles/escrow, not the permissioned
  token standard with identity registry + enforced transfers).
- **Multi-agent quorum** (not a single oracle) with **anchoring-bias isolation**.
- **Verifiable AI accountability**: reasoning hash + agent signatures + x402 payment tx
  hashes on-chain (closes the agent accountability gap).
- **AI agent as Trusted Issuer** + **autonomous enforcement** (freeze/pause/revoke).
- **Brier-score reputation** with stake/slash (calibrated, not raw LLM confidence).
- **Full toolkit**: Odra + x402 + casper-eip-712 + Casper MCP + CSPR.cloud.

## Build & run

```bash
# contracts (Docker, Windows-friendly)
docker build -t casper3643-builder .
docker run --rm -e USER=root -v "$PWD":/workspace -v casper3643-rustup:/usr/local/rustup \
  -v casper3643-cargo:/usr/local/cargo/registry -w /workspace casper3643-builder cargo odra test
docker run --rm -e USER=root -v "$PWD":/workspace ... casper3643-builder cargo odra build

# agent layer
cd agent && npm install && npm run demo

# frontend
cd web && npm install && npm run dev
```

See README.md for the full architecture, Manifest alignment table, and demo flow.

## Long-term plans

- Mainnet deployment + ERC-3643 Association alignment
- Additional compliance modules (MaxInvestors, SupplyCap, ExchangeMonthlyLimits)
- Full ONCHAINID separation (dynamic external calls) once Odra exposes them
- ZK-KYC (Manifest privacy initiative) for claim privacy
- Compliant orderbook with T+0 settlement via Zug deterministic finality
- Socials: X @<handle>, Discord — community voting on CSPR.fans

## License

Apache-2.0.
