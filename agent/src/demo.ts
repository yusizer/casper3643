/**
 * End-to-end demo script for Casper3643.
 *
 * Flow:
 *   1. Submit an RWA asset to the Compliance Quorum.
 *   2. 3 specialist agents fan out in parallel — each pays (x402) for its data feed on
 *      Casper testnet and returns an independent, signed, safety-first verdict.
 *   3. The orchestrator tallies (2/3 supermajority / safety-first).
 *   4. The verdict + reasoning hash + per-agent signatures + x402 payment tx hashes are
 *      attested on Casper (AttestationRegistry.record_verdict) — Verifiable AI.
 *   5. If APPROVE, the agents (as Trusted Issuers) sign KYC claims onto the investor's
 *      ONCHAINID, IdentityRegistry::is_verified flips true, and the RWA token transfer
 *      is allowed. A sanctions hit triggers autonomous freeze (agent-only).
 *
 * Run: `npm run demo` (requires the data-feed server + facilitator running, agent keys
 * funded with WCSPR, and OPENAI_API_KEY set).
 */

import { config } from "dotenv";
import { runQuorum, QuorumInput } from "./orchestrator.js";
import { Decision } from "./verdict.js";
import {
  buildAttestation,
  submitAttestation,
  hashReasoning,
  hashEvidence,
  canonicalDigest,
} from "./attestation-submit.js";
import { signVote, agentIdentity } from "./sign-votes.js";

config();

async function main() {
  const asset: QuorumInput = {
    asset_id: "rwa-real-estate-unit-42",
    investor_address: "0xABC123definitelyNotSanctioned",
    investor_name: "Acme Holdings Ltd.",
    asset: "RealEstate-Unit-42",
    jurisdiction: "EU",
    min_val: 1_000_000,
    max_val: 1_500_000,
    context: "Tokenized commercial unit; investor is a regulated EU entity.",
  };

  console.log("=== Casper3643 Compliance Quorum demo ===");
  console.log("asset:", asset.asset_id);
  console.log("fanning out 3 specialist agents (parallel, isolated)...\n");

  const result = await runQuorum(asset);

  console.log("\n=== Quorum verdict ===");
  console.log("decision:", result.verdict, "| confidence:", result.confidence.toFixed(3));
  console.log("tally rule:", result.tally_rule);
  console.log("votes:");
  for (const v of result.votes) {
    console.log(
      `  - ${Decision[v.decision]} conf=${v.confidence.toFixed(2)} ` +
        `payment_tx=${v.payment_tx_hash || "(pending)"}`,
    );
    console.log(`    reasoning: ${v.reasoning.slice(0, 160)}`);
  }

  // Verifiable AI: pin the reasoning trace + evidence to hashes, then anchor on Casper.
  // In prod the reasoning trace is pinned to IPFS and reasoning_hash = CID bytes; here we
  // keccak-hash the concatenated reasoning as a deterministic stand-in.
  const reasoningTrace = result.votes.map((v) => v.reasoning).join("\n---\n");
  const reasoningHash = hashReasoning(reasoningTrace);
  const evidenceHash = hashEvidence(
    result.votes.flatMap((v) => v.evidence_refs).concat([asset.asset_id, asset.jurisdiction]),
  );

  // Each specialist signs the canonical attestation digest with its own key. In the testnet
  // demo all three keys point at the deployer PEM, so the signatures are identical — fine
  // for a wiring smoke test; set distinct AGENT_*_KEY PEMs for real isolation.
  const agentKeys = [
    process.env.AGENT_SANCTIONS_KEY || "./keys/secret_key.pem",
    process.env.AGENT_VALUATION_KEY || "./keys/secret_key.pem",
    process.env.AGENT_LEGAL_KEY || "./keys/secret_key.pem",
  ];
  const verdictByte = Decision.APPROVE === result.verdict ? 0 : Decision.REJECT === result.verdict ? 2 : 1;
  const confBps = Math.round(result.confidence * 10000);
  const votesWithSigs = result.votes.map((v, i) => {
    const sig = signVote(asset.asset_id, verdictByte, confBps, reasoningHash, evidenceHash, agentKeys[i]);
    return { vote: v, ...sig };
  });

  // Sanity: print the canonical digest the contract will recompute and verify against.
  const digest = canonicalDigest("", asset.asset_id, verdictByte, confBps, reasoningHash, evidenceHash);
  console.log("\ncanonical digest (verified on-chain by AttestationRegistry):", digest);
  console.log("agent identities:", agentKeys.map((k) => agentIdentity(k)));

  const att = buildAttestation(asset.asset_id, result, reasoningHash, evidenceHash, votesWithSigs);

  console.log("\n=== On-chain attestation (Verifiable AI) ===");
  console.log(JSON.stringify({ ...att, votes: att.votes.length }, null, 2));
  try {
    const txHash = await submitAttestation(att);
    console.log("attestation recorded on Casper testnet, tx:", txHash);
  } catch (e) {
    console.log("attestation submit (skipped):", (e as Error).message);
  }

  if (result.verdict === Decision.APPROVE) {
    console.log(
      "\n=> APPROVE: agents sign KYC claims as Trusted Issuers -> is_verified=true -> RWA transfer allowed.",
    );
  } else if (result.verdict === Decision.REJECT) {
    console.log("\n=> REJECT: agent autonomously freezes the investor wallet (agent-only freeze).");
  } else {
    console.log("\n=> VERIFY_FURTHER: escalation — no transfer, human review required.");
  }
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exit(1);
});
