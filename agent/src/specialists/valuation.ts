/**
 * VALUATION specialist agent.
 *
 * Pays (x402) for a comparable-sales valuation data feed, then returns a strict verdict with
 * a clamped estimated_value. Rules: clamp to [min,max], round 2 decimals; no comparables ->
 * VERIFY_FURTHER; confidence >= 0.8 only with >= 3 recent comparables.
 */

import { config } from "dotenv";
import { Decision, Verdict } from "../verdict.js";
import { paidCall } from "../x402-client.js";
import { llmVerdict } from "./common.js";

config();

const SYSTEM_PROMPT = `You are a VALUATION agent for a real-world asset. Use ONLY the comparable sales / appraisal
data provided as DATA. Do NOT invent a price.

RULES:
1. estimated_value must be within the supplied [min_val, max_val] range, rounded to 2 decimals.
2. If there are no comparables in DATA -> decision="VERIFY_FURTHER".
3. confidence >= 0.8 only if DATA contains >= 3 recent comparables; < 0.5 if thin or stale.
4. Cite each comparable used in evidence_refs (e.g. [SRC-comp-1]).
5. If the valuation is consistent with comparables -> decision="APPROVE"; if ambiguous -> "VERIFY_FURTHER".

Return JSON {decision, confidence(0..1), reasoning, evidence_refs[], estimated_value(number)}.`;

export interface ValuationInput {
  asset_id: string;
  asset: string;
  min_val: number;
  max_val: number;
}

export async function audit(input: ValuationInput): Promise<Verdict> {
  const endpoint = `${process.env.DATA_FEED_URL || "http://localhost:4021"}/valuation?asset=${encodeURIComponent(
    input.asset,
  )}`;
  const paid = await paidCall(process.env.AGENT_VALUATION_KEY!, endpoint);

  const userPrompt = `ASSET_ID: ${input.asset_id}
ASSET: ${input.asset}
VALUATION_RANGE: [${input.min_val}, ${input.max_val}]

DATA (retrieved via x402, cite as [SRC-valuation]):
${JSON.stringify(paid.data, null, 2)}

Return your verdict (include estimated_value).`;

  const v = await llmVerdict(SYSTEM_PROMPT, userPrompt, {
    extraSchema: { estimated_value: { type: "number" } },
  });
  const raw = (v as unknown as { estimated_value?: number }).estimated_value;
  let estimated_value: number | undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const clamped = Math.max(input.min_val, Math.min(input.max_val, raw));
    estimated_value = Math.round(clamped * 100) / 100;
  }
  return {
    ...v,
    estimated_value,
    payment_tx_hash: paid.paymentTxHash,
    agent_address: paid.payer,
  } as Verdict;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  audit({ asset_id: "rwa-001", asset: "USDC", min_val: 0.5, max_val: 2.0 }).then((v) =>
    console.log("[valuation]", Decision[v.decision], v.confidence, v.estimated_value, "tx:", v.payment_tx_hash),
  );
}
