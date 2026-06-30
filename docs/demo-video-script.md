# Casper3643 — Demo Video Script (≈3 min)

Shot-by-shot script for the hackathon demo video. Voiceover is in English (judges). On-screen
actions are exact commands + the live terminal/dashboard output. Evidence output is captured
in `docs/demo-output.txt`; on-chain tx hashes are verifiable on https://testnet.cspr.live.

## Setup before recording

```bash
cd agent
npm install            # already done
npm run data-feed      # Terminal 1 — :4021 (paid data feeds + /quorum + /api)
cd ../web && npm run dev   # Terminal 2 — :5173 (dashboard)
# Terminal 3 (record this): cd agent
```

Have open in browser: https://testnet.cspr.live (to paste a tx hash), and
http://localhost:5173 (dashboard).

---

## Shot 1 — Hook (0:00–0:15)

**Voiceover:** "Casper3643 is the first ERC-3643-compliant permissioned token suite on Casper,
with a Verifiable AI compliance layer. Three specialist AI agents independently audit a
real-world asset, pay per query for data feeds via x402 micropayments, vote without anchoring
bias, and attest the verdict on-chain."

**On screen:** Title card — "Casper3643 · ERC-3643 + Verifiable AI on Casper · Casper Agentic
Buildathon 2026". Cut to the architecture diagram in `README.md`.

---

## Shot 2 — Live Compliance Quorum (0:15–1:15)

**Voiceover:** "I run the end-to-end demo. Three specialist agents — sanctions, valuation, and
legal — fan out in parallel. Each pays for its data feed via x402 and returns an independent,
safety-first verdict. No agent sees another's verdict before voting."

**On screen (Terminal 3):**

```
cd agent && npm run demo
```

Show the live output (from `docs/demo-output.txt`):

```
=== Casper3643 Compliance Quorum demo ===
asset: rwa-real-estate-unit-42
fanning out 3 specialist agents (parallel, isolated)...

=== Quorum verdict ===
decision: VERIFY_FURTHER | confidence: 0.167
votes:
  - VERIFY_FURTHER conf=0.50 payment_tx=db717db3a7b64a3f...
    reasoning: Insufficient sanctions screening data available...
  - VERIFY_FURTHER conf=0.00 payment_tx=968618be08fc065d...
  - VERIFY_FURTHER conf=0.00 payment_tx=04f203af6681983...

canonical digest (verified on-chain by AttestationRegistry): b7e72bce...
```

**Voiceover:** "Each `payment_tx` is a real Casper settle transaction — the agents literally
paid WCSPR for their data. The orchestrator tallies a 2/3 supermajority, safety-first: on
insufficient data it returns VERIFY_FURTHER, never approving on disagreement."

---

## Shot 3 — Verifiable AI on-chain (1:15–2:00)

**Voiceover:** "The verdict, a reasoning hash, an evidence hash, three agent signatures, and
three x402 payment transaction hashes are attested ON-CHAIN on Casper. The canonical digest is
keccak256 of subject, verdict, confidence, reasoning and evidence hashes — and the contract
recomputes that exact digest and verifies each agent signature."

**On screen (Terminal 3, continue):**

```
=== On-chain attestation (Verifiable AI) ===
{ "subject": "rwa-real-estate-unit-42", "verdict": 1, "confidence": 1667,
  "reasoning_hash": "…", "evidence_hash": "…", "votes": 3,
  "tally_rule": "disagreement_safety_default" }
attestation recorded on Casper testnet, tx: b7e72bce025fa1ef110a23f0fb340750e0aad48bec709d6f4266d21e91e02dd7
```

**Cut to browser:** paste `b7e72bce025fa1ef110a23f0fb340750e0aad48bec709d6f4266d21e91e02dd7` into
https://testnet.cspr.live → show the finalized transaction + `VerdictAttested` event.

**Voiceover:** "Recorded on Casper testnet. `AttestationRegistry::record_verdict` verified all
three agent signatures on-chain and emitted `VerdictAttested`. This closes the agent
accountability gap — WHY the agent decided, WHAT it paid, WHAT it received, all on-chain."

---

## Shot 4 — Dashboard (2:00–2:40)

**Voiceover:** "The dashboard connects a Casper Wallet, mints the security token to an
investor, registers the investor identity, runs the live quorum in the browser, and reads
on-chain attestations and agent reputation."

**On screen (browser, http://localhost:5173):**
1. Click "Connect Casper Wallet" → shows connected public key.
2. Section 1 "Issue a regulated RWA token" — enter investor account hash, "Mint SecurityToken".
3. Section 2 "Investor identity & compliance gate" — "Register identity".
4. Section 3 "Compliance Quorum (live)" — click "Run Compliance Quorum" → JSON verdict renders.
5. Section 4 "On-chain attestations" + Section 5 "Agent reputation (Brier + stake/slash)".

---

## Shot 5 — Why this wins (2:40–3:00)

**Voiceover:** "Casper's Manifest makes compliant security tokens — ERC-3643 — its most
detailed initiative, Tier-1, buildable today. No other submission builds the actual
permissioned-token standard on Casper. We add the agentic layer the roadmap calls for: agents
that transact, not chat — paying for data, issuing KYC claims, and enforcing compliance
on-chain. Ten contracts deployed on Casper testnet, fourteen OdraVM tests green, live Verifiable
AI attestations. Casper3643."

**On screen:** Title card — repo `github.com/yusizer/casper3643` + the 4 on-chain tx hashes:
`073320d2… · bf93c9dd… · 8670f31f… · b7e72bce…`.

---

## Recording tips

- Record in 1080p, 60fps if possible; terminal font ≥ 16pt.
- Slow-scroll the terminal output; pause 2s on the `attestation recorded on Casper testnet, tx:`
  line and on the explorer tx page.
- Voiceover: steady pace, ~140 wpm. Re-record any stumble; keep takes under 30s for easy edits.
- Captions: burn-in word-by-word captions (the H0 AgentLedger submission used this and scored
  well). Tools: CapCut / Premiere auto-captions → fix timing.
- Keep the explorer tx page visible for ≥3s so judges can read the hash.

## Honest on-screen caveats (optional lower-third)

- "Specialist data feeds are mocked for the demo; the x402 payment path is live."
- "Without WCSPR funded at the payment asset, specialists return safety-first VERIFY_FURTHER;
  the verdict still attests on-chain."
- "The three agent signatures share the deployer key for the testnet smoke test; production
  uses distinct per-agent keys."
