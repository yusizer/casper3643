# Casper3643 — Demo Walkthrough

Script for the hackathon demo video + a reproducible live run. ~3–4 minutes.

## Prereqs (one-time)

- `agent/.env` filled: `OPENAI_API_KEY` (NVIDIA NIM or OpenAI), `OPENAI_BASE_URL`,
  `CSPR_CLOUD_ACCESS_TOKEN`, `FACILITATOR_API_KEY`, deployed package hashes (already set),
  `ORCHESTRATOR_KEY=./keys/secret_key.pem`, funded CSPR on testnet.
- `casper-client` on PATH (only for the frontend `/api/issue-token` & `/api/register-identity`
  write endpoints; the CLI demo below does not need it).
- `cd agent && npm install` (done).

## Live run (terminal)

```bash
cd agent

# 1) Start the paid data-feed server (x402, WCSPR). It also hosts /quorum + /api/*.
npm run data-feed   # http://localhost:4021 — leave running in its own terminal

# 2) Run the end-to-end demo: 3-specialist quorum → signed attestation → on-chain submit.
npm run demo
```

Expected output (annotated for the video):

1. **"fanning out 3 specialist agents (parallel, isolated)…"** — 3 specialists fire in
   parallel; each pays (x402, WCSPR) for its data feed (`/sanctions`, `/valuation`, `/legal`)
   via the CSPR.cloud facilitator and returns an independent safety-first verdict. No
   specialist sees another's verdict before voting (no anchoring bias).
2. **"=== Quorum verdict ==="** — orchestrator tallies: 2/3 supermajority APPROVE; any
   high-confidence (≥0.9) REJECT dominates; otherwise VERIFY_FURTHER (never APPROVE on
   disagreement).
3. **"canonical digest (verified on-chain by AttestationRegistry): 0x…"** —
   `keccak256(subject ‖ [verdict] ‖ confidence_be32 ‖ reasoning_hash ‖ evidence_hash)` — the
   exact bytes `AttestationRegistry::canonical_hash` recomputes and `verify_signature` checks
   each agent signature against.
4. **"agent identities:"** — each agent's secp256k1 public key + account hash.
5. **"=== On-chain attestation (Verifiable AI) ==="** — the `ComplianceAttestation` JSON
   (verdict + reasoning/evidence hashes + 3 signed `AgentVote`s carrying each x402 payment tx
   hash).
6. **"attestation recorded on Casper testnet, tx: <hash>"** — the Casper transaction hash;
   paste into https://testnet.cspr.live for on-chain proof. The `VerdictAttested` event is
   emitted; `AttestationRegistry::record_verdict` verified all 3 agent signatures on-chain.

## Dashboard (browser)

```bash
cd web && npm install && npm run dev   # http://localhost:5173 (proxies /quorum + /api → :4021)
```

With `npm run data-feed` running in the agent:

1. **Connect Casper Wallet** — `window.casperwallet` provider (Casper Wallet extension).
2. **1. Issue a regulated RWA token** — Mint the deployed SecurityToken to an investor
   wallet (POST `/api/issue-token` → `SecurityToken::mint`, orchestrator-signed).
3. **2. Investor identity & compliance gate** — Register investor in IdentityRegistry with
   country (POST `/api/register-identity` → `IdentityRegistry::register_identity`).
   Non-verified or non-allowlisted-country transfers revert on-chain.
4. **3. Compliance Quorum (live)** — Run the 3-specialist quorum in the browser; verdict +
   per-agent votes rendered live.
5. **4. On-chain attestations** — reads `VerdictAttested` events via CSPR.cloud.
6. **5. Agent reputation** — Brier score + correct/total + stake per agent.

## Narrative for judges (voiceover)

> Casper3643 is the first ERC-3643-compliant permissioned token suite on Casper, with a
> Verifiable AI compliance layer. Three specialist A2A agents independently audit a
> real-world asset — each pays per query for its data feed via x402 micropayments, returns a
> structured safety-first verdict, and votes without anchoring bias. The orchestrator tallies
> a 2/3 supermajority, and the verdict plus a reasoning hash, evidence hash, three agent
> signatures, and three x402 payment transaction hashes are attested ON-CHAIN on Casper —
> closing the agent accountability gap: WHY the agent decided, WHAT it paid, WHAT it
> received. On a sanctions hit the agent autonomously freezes the wallet — no human in the
> loop. This builds Casper Manifest initiative #6 (Compliant Security Tokens / ERC-3643,
> Tier-1, buildable today) plus the agentic transact-don't-chat layer the roadmap calls for.

## Honest caveats to state on screen

- The three specialist signatures in the testnet demo are produced by the deployer key (one
  PEM) — identical under deterministic ECDSA. In production each specialist has its own key
  (set `AGENT_SANCTIONS_KEY` / `AGENT_VALUATION_KEY` / `AGENT_LEGAL_KEY` to distinct PEMs).
- Without a funded WCSPR balance or a working facilitator, specialists fall back to
  safety-first VERIFY_FURTHER; the quorum still returns a verdict and the attestation still
  submits (with empty payment tx hashes).
- On-chain attestation submit uses `CLValue::Any` carrying the bytesrepr of
  `ComplianceAttestation`; the canonical digest is exact, but the CLValue routing is
  best-effort and degrades to a logged attestation if the runtime rejects the arg shape.
