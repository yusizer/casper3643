# Casper3643 — ERC-3643 Permissioned Tokens + Multi-Agent Compliance Quorum on Casper

> The first ERC-3643-compliant permissioned token suite on Casper, with a Verifiable AI
> compliance layer: 3 specialist A2A agents audit a real-world asset, pay per-query for
> data feeds via x402, vote without anchoring bias, and attest the verdict on-chain.

**Casper Agentic Buildathon 2026 — Casper Innovation Track** (Agentic AI + DeFi + RWA).
Implements initiative #6 of the [Casper Manifest](https://www.casper.network/news/manifest)
— **Compliant Security Tokens (ERC-3643)**, Tier-1, *"buildable today with no protocol
changes"* — as an Odra/WASM port, today, before the protocol-level EVM ship.

---

## Why this project

Casper has joined the [ERC-3643 Association](https://www.casper.network/news/casper-network-joins-erc-3643)
and made compliant RWA tokenization its most detailed Manifest initiative. ERC-3643
governs **>$28B** in tokenized assets on Ethereum. But **no submission** in the buildathon
builds an actual ERC-3643 permissioned-token standard on Casper — the gap this project
fills. On top of the standard we add the **agentic layer** Casper's roadmap calls for:
autonomous AI agents that *transact, not chat* — paying for data, issuing KYC claims, and
enforcing compliance on-chain.

It hits all three of Casper's pillars:
- **Native for Machines** — x402 micropayments for per-query data feeds
- **Trusted by Institutions** — ERC-3643 identity registry + modular compliance + enforced transfers
- **Verifiable AI** — verdict + reasoning hash + agent signatures + payment tx hashes anchored on-chain

---

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │           Compliance Quorum (TS)             │
   RWA asset ───────────▶│  orchestrator (parallel, no anchoring bias)  │
                         │   ├─ sanctions/KYC specialist (A2A)          │
                         │   ├─ valuation specialist      (A2A)          │
                         │   └─ legal-provenance specialist (A2A)        │
                         └───────────┬───────────────────┬──────────────┘
                                     │ x402 pay/query    │ signed verdicts + payment tx hashes
                                     ▼                   ▼
                         ┌────────────────────┐  ┌──────────────────────────────────────┐
                         │  paid data-feed    │  │  AttestationRegistry (Odra, Casper)   │
                         │  server (x402)     │  │  record_verdict(...) → VerdictAttested│
                         │  /sanctions /val   │  └──────────────────────────────────────┘
                         │  /legal  (WCSPR)   │
                         └─────────┬──────────┘  ┌──────────────────────────────────────┐
                                   │             │  ERC-3643 suite (Odra, Casper)        │
                            facilitator          │  SecurityToken (extends Cep18)         │
                                   │             │  IdentityRegistry / OnchainId         │
                                   ▼             │  TrustedIssuersRegistry / ClaimTopics │
                         ┌────────────────────┐  │  ModularCompliance + modules          │
                         │  WCSPR (CEP-18)     │  │  AgentReputation (Brier + slash)     │
                         │  on Casper testnet  │  └──────────────────────────────────────┘
                         └────────────────────┘           ▲
                                                          │ AI agent = Trusted Issuer
                                                          │ signs KYC claims -> is_verified
                                                          │ -> RWA transfer allowed
                                                          │ autonomous freeze/pause on REJECT
```

### On-chain contracts (Odra/Rust → WASM, `src/`)
| Module | Role | ERC-3643 counterpart |
|---|---|---|
| `AgentRole` | agent-only operational access | `AgentRole` |
| `ClaimTopicsRegistry` | required claim topics (KYC, AML) | `ClaimTopicsRegistry` |
| `TrustedIssuersRegistry` | trusted claim issuers per topic | `TrustedIssuersRegistry` |
| `OnchainId` | identity + signed claims (EIP-712 verified) | `Identity` / `ClaimHolder` |
| `IdentityRegistry` + Storage | `is_verified(wallet)` gate | `IdentityRegistry` |
| `ModularCompliance` + `CountryAllowlist` + `MaxHolding` | pluggable transfer rules | `ModularCompliance` + modules |
| `SecurityToken` | ERC-20 + compliance gate + agent ops | `Token` |
| `AttestationRegistry` | Verifiable AI verdict anchoring | (Casper-unique) |
| `AgentReputation` | Brier-score reputation + stake/slash | (Casper-unique) |

### Off-chain agent layer (TypeScript, `agent/`)
| File | Role |
|---|---|
| `verdict.ts` | verdict schema + safety-first tally (2/3 supermajority, any high-conf REJECT dominates, else VERIFY_FURTHER) |
| `x402-client.ts` | per-agent x402 payment for a data feed (EIP-712 TransferWithAuthorization, WCSPR) |
| `data-feed-server.ts` | paid sanctions/valuation/legal API behind x402 middleware |
| `specialists/{sanctions,valuation,legal}.ts` | independent specialist agents: OpenAI structured outputs, safety-first prompts, temperature 0 |
| `specialists/common.ts` | strict-JSON LLM helper with post-validation + bounded retry + VERIFY_FURTHER fallback |
| `orchestrator.ts` | parallel fan-out (Promise.allSettled) + tally — no anchoring bias |
| `attestation-submit.ts` | builds `ComplianceAttestation` + submits `record_verdict` to Casper |
| `demo.ts` | end-to-end demo |

---

## Build & test (contracts) — Docker (Windows-friendly)

Odra needs nightly Rust + `wasm32-unknown-unknown` + `wabt`/`binaryen`. The repo ships a
Docker image so you don't have to install MSVC build tools on Windows.

```bash
docker build -t casper3643-builder .
# OdraVM tests (fast, mock VM):
docker run --rm -v "$PWD":/workspace -w /workspace casper3643-builder cargo odra test
# Casper VM backend tests:
docker run --rm -v "$PWD":/workspace -w /workspace casper3643-builder cargo odra test -b casper
# Build WASM for a contract:
docker run --rm -v "$PWD":/workspace -w /workspace casper3643-builder cargo odra build -b casper -c security_token
```

## Run the agent layer (demo)

```bash
cd agent
cp .env.example .env   # fill keys (OPENAI_API_KEY + OPENAI_BASE_URL, CSPR_CLOUD_ACCESS_TOKEN,
                       # FACILITATOR_API_KEY, orchestrator key path, deployed package hashes)
npm install

# Terminal 1: x402 facilitator (use hosted https://x402-facilitator.cspr.cloud + CSPR_CLOUD_ACCESS_TOKEN)
# Terminal 2: paid data-feed server (also hosts /quorum + /api/* for the dashboard)
npm run data-feed
# Terminal 3: end-to-end demo (3 agents pay, vote, tally, sign, attest on Casper)
npm run demo
```

The specialist LLM is called through the OpenAI SDK against any OpenAI-compatible endpoint.
By default `.env` points at **NVIDIA NIM** (`OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1`,
`LLM_MODEL=nvidia/llama-3.1-nemotron-70b-instruct`); unset `OPENAI_BASE_URL` and set
`LLM_MODEL=gpt-4o-mini` to use OpenAI directly. See [`docs/demo-walkthrough.md`](docs/demo-walkthrough.md)
for the annotated demo script + dashboard walkthrough.

Post-deploy contract wiring (allowlist country, claim topic, trusted issuer, bind compliance
modules, authorize agent): `bash scripts/wire.sh` inside the Docker builder.

---

## Demo flow

1. **Issue** a regulated RWA token (tokenized real-estate unit) on Casper testnet.
2. **Onboard investor**: the sanctions/KYC agent (a Trusted Issuer) verifies identity and
   signs a KYC claim onto the investor's ONCHAINID → `is_verified` = true. (Contract supports
   `add_claim` with issuer-signature verification; the CLI demo records the verdict on-chain
   and logs the onboarding intent — see Limitations.)
3. **Transfer gate**: a transfer to a non-verified wallet or a non-allowlisted country is
   reverted on-chain by the SecurityToken's compliance check.
4. **Compliance Quorum (live on testnet)**: 3 specialist agents independently audit the
   asset — each pays (x402, WCSPR) for its data feed, returns a structured verdict; the
   orchestrator tallies (2/3 supermajority, safety-first). Verdict + reasoning hash + 3
   agent signatures + 3 payment tx hashes are attested on Casper (`VerdictAttested` event) —
   Verifiable AI.
5. **Autonomous enforcement**: on a REJECT/sanctions hit, the agent calls the agent-only
   `freeze`/`pause` entry points — no human in the loop. (Contract exposes `freeze`/`pause`;
   the demo records the REJECT verdict on-chain and logs the enforcement intent.)
6. **Reputation**: each agent's verdict is logged; when the real-world outcome resolves,
   its Brier score updates and a wrong confident call slashes its stake. (`AgentReputation`
   contract capability; shown in the dashboard pending an on-chain view read.)

## Limitations (honest)

- Specialist data feeds are mocked (real x402 payment path, static data behind the paywall).
  Settlement requires WCSPR at `ASSET_PACKAGE`; if unfunded, specialists fall back to
  safety-first VERIFY_FURTHER and the verdict still attests on-chain.
- `add_claim` (KYC → `is_verified`) and `freeze` (autonomous enforcement) are contract-level
  + unit/wiring-tested but not invoked end-to-end in the CLI demo (verdict + signatures are
  recorded on-chain; enforcement intent is logged).
- `AgentReputation` Brier/slash is a contract capability; the dashboard reputation table
  shows representative values pending an on-chain view read.
- The 3 specialist signatures in the testnet demo share the deployer key (identical under
  deterministic ECDSA). Production uses distinct per-agent keys (`AGENT_*_KEY`).

---

## Differentiation (vs. the field)

- **Only ERC-3643 standard** submission (others are oracles/escrow, not the permissioned
  token standard with identity registry + enforced transfers).
- **Multi-agent quorum** (not a single oracle) with **anchoring-bias isolation**.
- **Verifiable AI accountability**: reasoning hash + agent signatures + x402 payment tx
  hashes on-chain (closes the agent accountability gap).
- **AI agent as Trusted Issuer** + **autonomous enforcement** (freeze/pause/revoke).
- **Brier-score reputation** with stake/slash (calibrated, not raw LLM confidence).
- **Full toolkit**: Odra + Casper MCP + x402 + casper-eip-712 + CSPR.cloud.

---

## Casper Manifest alignment

| Manifest initiative | This project |
|---|---|
| #6 Compliant Security Tokens (ERC-3643) — Tier-1 | **core** — full Phase-1 port to Odra |
| #7 X402 Micropayments — live | data-feed payments via the live facilitator |
| Agent Infrastructure — scoped perms, verifiable identity | AgentRole + agent as Trusted Issuer |
| Verifiable AI / trust layer for the agent economy | AttestationRegistry |

---

## Status

- ✅ Phase 1 — Odra contracts (10 modules) written, 14/14 OdraVM tests green, 10 optimized
  WASM contracts built
- ✅ Phase 2/3 — agent layer: x402 client + 3 specialists + orchestrator + attestation
  submitter (canonical digest + secp256k1 sign-votes + casper-js-sdk on-chain submit) +
  sign-votes; `tsc --noEmit` clean
- ✅ Phase 4 — dashboard (Casper Wallet connect, mint, register identity, live quorum,
  attestation explorer, reputation) + `/quorum` + `/api/*` endpoints; `tsc --noEmit` clean
- ✅ Phase 5 — 10 contracts deployed on Casper testnet (package hashes in `deploy_hashes.sh`);
  repo public at https://github.com/yusizer/casper3643
- ⏳ Live demo run + demo video + DoraHacks BUIDL submit + community vote

## License

Apache-2.0.
