/**
 * Shared verdict schema + tally rule for the Compliance Quorum.
 *
 * Each specialist agent returns a `Verdict` (decision enum + confidence + reasoning +
 * evidence_refs). The orchestrator tallies 3 verdicts with a safety-first rule:
 *   - 2/3 supermajority APPROVE -> APPROVE
 *   - any high-confidence (>=0.9) REJECT -> REJECT (asymmetric safety)
 *   - otherwise -> VERIFY_FURTHER (never APPROVE on disagreement)
 */

export enum Decision {
  APPROVE = "APPROVE",
  VERIFY_FURTHER = "VERIFY_FURTHER",
  REJECT = "REJECT",
}

export const DECISION_BYTE: Record<Decision, number> = {
  [Decision.APPROVE]: 0,
  [Decision.VERIFY_FURTHER]: 1,
  [Decision.REJECT]: 2,
};

export interface Verdict {
  decision: Decision;
  /** 0..1 */
  confidence: number;
  reasoning: string;
  evidence_refs: string[];
  /** Valuation specialist only. */
  estimated_value?: number;
  /** Casper deploy hash of the x402 payment for this agent's data feed. */
  payment_tx_hash?: string;
  /** This agent's on-chain address (00<64hex>). */
  agent_address?: string;
}

export interface TallyResult {
  verdict: Decision;
  confidence: number; // aggregate, 0..1
  tally_rule: string;
  votes: Verdict[];
}

const REJECT_THRESHOLD = 0.9;
const APPROVE_THRESHOLD = 0.6;

function clamp(x: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Safety-first tally over 3 independent specialist verdicts. */
export function tally(votes: Verdict[]): TallyResult {
  if (votes.length === 0) {
    return { verdict: Decision.VERIFY_FURTHER, confidence: 0, tally_rule: "empty", votes };
  }

  // Asymmetric safety: any high-confidence REJECT dominates.
  const highConfReject = votes.some(
    (v) => v.decision === Decision.REJECT && v.confidence >= REJECT_THRESHOLD,
  );
  if (highConfReject) {
    return {
      verdict: Decision.REJECT,
      confidence: clamp(Math.max(...votes.filter((v) => v.decision === Decision.REJECT).map((v) => v.confidence))),
      tally_rule: "any_high_conf_reject",
      votes,
    };
  }

  const approves = votes.filter((v) => v.decision === Decision.APPROVE);
  const approveCount = approves.length;

  // 2/3 supermajority APPROVE (and each approve confidence >= APPROVE_THRESHOLD).
  if (approveCount >= 2 && approves.every((v) => v.confidence >= APPROVE_THRESHOLD)) {
    const avg = approves.reduce((s, v) => s + v.confidence, 0) / approves.length;
    return { verdict: Decision.APPROVE, confidence: clamp(avg), tally_rule: "2of3_supermajority", votes };
  }

  // Otherwise: never APPROVE on disagreement -> VERIFY_FURTHER.
  const avgConf = votes.reduce((s, v) => s + v.confidence, 0) / votes.length;
  return { verdict: Decision.VERIFY_FURTHER, confidence: clamp(avgConf), tally_rule: "disagreement_safety_default", votes };
}
