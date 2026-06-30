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
cp .env.example .env   # fill keys, OPENAI_API_KEY, facilitator, payee
npm install

# Terminal 1: x402 facilitator (self-host on testnet, or use hosted x402-facilitator.cspr.cloud)
# Terminal 2: paid data-feed server
npm run data-feed
# Terminal 3: end-to-end demo (3 agents pay, vote, tally, attest)
npm run demo
```

---

## Demo flow

1. **Issue** a regulated RWA token (tokenized real-estate unit) on Casper testnet.
2. **Onboard investor**: the sanctions/KYC agent (a Trusted Issuer) verifies identity and
   signs a KYC claim onto the investor's ONCHAINID → `is_verified` = true.
3. **Transfer gate**: a transfer to a non-verified wallet or a non-allowlisted country is
   reverted on-chain by the SecurityToken's compliance check.
4. **Compliance Quorum**: 3 specialist agents independently audit the asset — each pays
   (x402, WCSPR) for its data feed, returns a structured verdict; the orchestrator tallies
   (2/3 supermajority, safety-first). Verdict + reasoning hash + 3 agent signatures + 3
   payment tx hashes are attested on Casper (`VerdictAttested` event) — Verifiable AI.
5. **Autonomous enforcement**: on a REJECT/sanctions hit, the agent calls the agent-only
   `freeze`/`pause` entry points — no human in the loop.
6. **Reputation**: each agent's verdict is logged; when the real-world outcome resolves,
   its Brier score updates and a wrong confident call slashes its stake.

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

- ✅ Phase 1 — Odra contracts (all 9 modules) written
- ✅ Phase 2/3 — agent layer (x402 + 3 specialists + orchestrator + attestation) written
- ⏳ Phase 1 — compile/test in the Docker image, fix Odra API signatures
- ⏳ Phase 4 — CSPR.click dashboard
- ⏳ Phase 5 — deploy to Casper testnet, demo video, DoraHacks BUIDL submit

## License

Apache-2.0.
