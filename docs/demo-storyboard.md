# Casper3643 — Demo Video Storyboard (≈3 min)

Synchronized with `docs/demo-voiceover.txt` (one continuous voiceover take, ~170s at 140 wpm).
For each shot: **timecode**, **visual** (what's on screen), **on-screen text** (burn-in lower-
third / title card), **terminal snippet to show**, and **transition**. Editor: align cuts to
the voiceover sentences below; burn-in word-by-word captions on every shot.

Total: ~180s. Tx hashes are verifiable on https://testnet.cspr.live.

---

## Shot 1 — Title / hook (0:00–0:14)

- **Visual:** Title card (dark navy bg, Casper-orange accent).
- **On-screen text:**
  `Casper3643`
  `ERC-3643 Permissioned Tokens + Verifiable AI on Casper`
  `Casper Agentic Buildathon 2026 · github.com/yusizer/casper3643`
- **Voiceover cue:** "Casper3643 is the first ERC-3643-compliant … Verifiable AI compliance layer."
- **Transition:** fade to architecture diagram.

## Shot 2 — Architecture diagram (0:14–0:26)

- **Visual:** `README.md` architecture diagram (slow zoom on the Compliance Quorum → x402 →
  AttestationRegistry flow).
- **On-screen text (lower-third):** `3 specialist A2A agents · x402 paid data feeds · on-chain attestation`
- **Voiceover cue:** "Three specialist AI agents independently audit … no anchoring bias … safety-first."
- **Transition:** cut to Terminal 3.

## Shot 3 — Run the demo (0:26–0:34)

- **Visual:** Terminal 3, type the command.
- **Terminal snippet (type live):**
  ```
  cd agent && npm run demo
  ```
- **On-screen text:** `Live on Casper testnet · casper:casper-test`
- **Voiceover cue:** "Let me run the live demo. Three agents fan out in parallel —"
- **Transition:** show output scrolling.

## Shot 4 — Quorum verdict + x402 payments (0:34–1:02)

- **Visual:** Terminal 3, the demo output (from `docs/demo-output.txt`). Slow-scroll.
- **Terminal snippet (highlight on screen):**
  ```
  === Quorum verdict ===
  decision: VERIFY_FURTHER | confidence: 0.167
  votes:
    - VERIFY_FURTHER conf=0.50 payment_tx=db717db3a7b64a3f…
    - VERIFY_FURTHER conf=0.00 payment_tx=968618be08fc065d…
    - VERIFY_FURTHER conf=0.00 payment_tx=04f203af6681983…
  ```
- **On-screen text (callout on each payment_tx):** `real WCSPR settle tx`
- **Voiceover cue:** "Each payment you see is a real Casper settle transaction in WCSPR … safety-first verdicts."
- **Transition:** cut to digest line.

## Shot 5 — Canonical digest (1:02–1:14)

- **Visual:** Terminal 3, the digest + agent identities block.
- **Terminal snippet:**
  ```
  canonical digest (verified on-chain by AttestationRegistry): b7e72bce…
  agent identities: [ { agent_pk: "020280eecbdb…", agent_address: "341e9b97…" }, … ]
  ```
- **On-screen text:** `canonical digest = keccak256(subject ‖ verdict ‖ conf_be32 ‖ reasoning_hash ‖ evidence_hash)`
- **Voiceover cue:** "Now the Verifiable AI part … recomputes the exact canonical digest … verifies every agent signature."
- **Transition:** cut to attestation JSON.

## Shot 6 — On-chain attestation (1:14–1:34)

- **Visual:** Terminal 3, attestation JSON + recorded tx line. Pause 2s on the tx hash.
- **Terminal snippet:**
  ```
  === On-chain attestation (Verifiable AI) ===
  { "subject": "rwa-real-estate-unit-42", "verdict": 1, "confidence": 1667,
    "reasoning_hash": "…", "evidence_hash": "…", "votes": 3 }
  attestation recorded on Casper testnet, tx: b7e72bce025fa1ef110a23f0fb340750e0aad48bec709d6f4266d21e91e02dd7
  ```
- **On-screen text:** `AttestationRegistry::record_verdict · VerdictAttested emitted`
- **Voiceover cue:** "Recorded on Casper testnet … verified all three signatures on-chain … closes the agent accountability gap."
- **Transition:** cut to browser explorer.

## Shot 7 — Explorer proof (1:34–1:50)

- **Visual:** Browser, https://testnet.cspr.live. Paste tx hash
  `b7e72bce025fa1ef110a23f0fb340750e0aad48bec709d6f4266d21e91e02dd7`. Show the finalized
  transaction + `VerdictAttested` event. Hold 3s.
- **On-screen text:** `testnet.cspr.live · transaction finalized`
- **Voiceover cue:** (continues) "why the agent decided, what it paid, and what it received — all on-chain."
- **Transition:** cut to dashboard.

## Shot 8 — Dashboard (1:50–2:34)

- **Visual:** Browser, http://localhost:5173. Walk through:
  1. Click **Connect Casper Wallet** → "Connected: 0202…"
  2. Section 1 **Issue a regulated RWA token** → enter investor account hash → **Mint SecurityToken**
  3. Section 2 **Investor identity & compliance gate** → **Register identity**
  4. Section 3 **Compliance Quorum (live)** → click **Run Compliance Quorum** → JSON verdict renders
  5. Section 4 **On-chain attestations** + Section 5 **Agent reputation (Brier + stake/slash)**
- **On-screen text (per action, lower-third):**
  - `Casper Wallet connected`
  - `SecurityToken::mint → orchestrator-signed`
  - `IdentityRegistry::register_identity`
  - `Live Compliance Quorum · 3 specialists`
  - `VerdictAttested on-chain · Brier reputation`
- **Voiceover cue:** "On the dashboard, I connect a Casper Wallet … compliance gate reverts … autonomously freezes … Brier score slashes stake."
- **Transition:** cut to closing title.

## Shot 9 — Why this wins (2:34–2:56)

- **Visual:** Title card (navy bg). Text fades in bullet by bullet.
- **On-screen text:**
  `Casper Manifest #6 · ERC-3643 · Tier-1, buildable today`
  `Only ERC-3643 standard submission on Casper`
  `Agents that transact, not chat`
- **Voiceover cue:** "Why this wins. Casper's Manifest … most detailed initiative … no other submission … agents that transact, not chat."
- **Transition:** cut to final card.

## Shot 10 — Proof card (2:56–3:00)

- **Visual:** Final card (navy bg, orange accent).
- **On-screen text:**
  `10 contracts · Casper testnet`
  `14/14 OdraVM tests green`
  `github.com/yusizer/casper3643`
  `On-chain: 073320d2… · bf93c9dd… · 8670f31f… · b7e72bce… · f8107f4f…`
- **Voiceover cue:** "Ten contracts deployed on Casper testnet. Fourteen OdraVM tests green. Live Verifiable AI attestations. Casper3643."
- **Transition:** fade out.

---

## Editor checklist

- **Captions:** burn-in word-by-word on every shot (CapCut/Premiere auto-captions → fix timing).
- **Terminal font:** ≥ 16pt, 1080p, 60fps if possible.
- **Pacing:** slow-scroll terminal; pause 2s on the `attestation recorded on Casper testnet, tx:`
  line and 3s on the explorer tx page.
- **Highlights:** draw a brief orange box/callout on each `payment_tx=…` (Shot 4) and on the
  final tx hash (Shot 6).
- **Audio:** record voiceover in one take per `demo-voiceover.txt`; denoise; level to -16 LUFS.
- **Music (optional):** low-volume ambient bed under -24 dB; duck under voiceover.
- **Honest caveats (optional lower-third, Shot 4 or 8):**
  - `Specialist data feeds are mocked for the demo; x402 payment path is live.`
  - `Without WCSPR funded, specialists return safety-first VERIFY_FURTHER; verdict still attests.`
  - `3 agent signatures share the deployer key for the testnet smoke test.`
- **Export:** 1920×1080, H.264, ~8 Mbps, MP4.
