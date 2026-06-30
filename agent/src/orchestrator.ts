/**
 * Orchestrator — the Compliance Quorum wiring.
 *
 * INTENTIONALLY "dumb": no LLM, no routing. It snapshots the input, fans out 3 specialist
 * calls IN PARALLEL (Promise.all, return_exceptions), and only after all 3 complete does
 * it tally. Each specialist is an independent call with its own system prompt and its own
 * x402 key — none sees another's verdict before voting (no anchoring bias / consensus
 * cascade). The shared scratchpad is written exactly once, at tally time.
 *
 * Safety-first tally: 2/3 supermajority APPROVE; any high-confidence REJECT dominates;
 * otherwise VERIFY_FURTHER (never APPROVE on disagreement).
 */

import { config } from "dotenv";
import { Decision, tally, Verdict, TallyResult } from "./verdict.js";
import * as sanctions from "./specialists/sanctions.js";
import * as valuation from "./specialists/valuation.js";
import * as legal from "./specialists/legal.js";

config();

export interface QuorumInput {
  asset_id: string;
  investor_address: string;
  investor_name: string;
  asset: string;
  jurisdiction: string;
  min_val: number;
  max_val: number;
  context?: string;
}

export interface QuorumOutput extends TallyResult {
  input: QuorumInput;
}

/**
 * Run the 3-specialist quorum in parallel and tally the verdict.
 * A specialist failure (e.g. x402 payment failure) becomes a safety-first
 * VERIFY_FURTHER vote rather than crashing the quorum.
 */
export async function runQuorum(input: QuorumInput): Promise<QuorumOutput> {
  const snapshot = { ...input }; // frozen input for all 3

  const [s, v, l] = await Promise.allSettled([
    sanctions.audit({
      asset_id: snapshot.asset_id,
      investor_address: snapshot.investor_address,
      investor_name: snapshot.investor_name,
      context: snapshot.context,
    }),
    valuation.audit({
      asset_id: snapshot.asset_id,
      asset: snapshot.asset,
      min_val: snapshot.min_val,
      max_val: snapshot.max_val,
    }),
    legal.audit({
      asset_id: snapshot.asset_id,
      jurisdiction: snapshot.jurisdiction,
      asset: snapshot.asset,
    }),
  ]);

  const votes: Verdict[] = [s, v, l].map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // Failure -> safety-first abstention.
    const names = ["sanctions", "valuation", "legal"] as const;
    return {
      decision: Decision.VERIFY_FURTHER,
      confidence: 0,
      reasoning: `specialist ${names[i]} failed: ${(r.reason as Error)?.message || r.reason}`,
      evidence_refs: [],
    };
  });

  const result = tally(votes);
  return { ...result, input };
}

// CLI entry: `npm run quorum`
if (import.meta.url === `file://${process.argv[1]}`) {
  const sample: QuorumInput = {
    asset_id: "rwa-001",
    investor_address: "0xABC123",
    investor_name: "Acme Holdings",
    asset: "RealEstate-Unit-42",
    jurisdiction: "EU",
    min_val: 1000,
    max_val: 2000,
  };
  runQuorum(sample).then((out) => {
    console.log("=== Compliance Quorum verdict ===");
    console.log("asset:", out.input.asset_id);
    console.log("verdict:", out.verdict, "| confidence:", out.confidence.toFixed(3));
    console.log("rule:", out.tally_rule);
    console.log("votes:");
    for (const v of out.votes) {
      console.log(
        `  - ${Decision[v.decision]} conf=${v.confidence.toFixed(2)} tx=${v.payment_tx_hash || "n/a"}`,
      );
      console.log(`    reasoning: ${v.reasoning.slice(0, 120)}`);
    }
  });
}
