/**
 * LEGAL-PROVENANCE specialist agent.
 *
 * Pays (x402) for a chain-of-title / legal-risk data feed, then returns a strict verdict.
 * Rules: cite each provenance link; gap in chain or missing evidence -> VERIFY_FURTHER;
 * active encumbrance/lien -> REJECT; complete unbroken documented chain -> APPROVE.
 */

import { config } from "dotenv";
import { Decision, Verdict } from "../verdict.js";
import { paidCall } from "../x402-client.js";
import { llmVerdict } from "./common.js";

config();

const SYSTEM_PROMPT = `You are a LEGAL-PROVENANCE agent verifying chain-of-title and encumbrance status for a real-world
asset. Use ONLY the legal data provided as DATA.

RULES:
1. Cite [SRC-legal] for each provenance link or encumbrance claim.
2. A gap in the chain-of-title or missing evidence -> decision="VERIFY_FURTHER".
3. An active lien, dispute, or encumbrance in DATA -> decision="REJECT".
4. A complete, unbroken, documented chain-of-title with no encumbrances -> decision="APPROVE".
5. Do NOT infer a missing link. Missing evidence is always VERIFY_FURTHER, never APPROVE.
6. confidence is your calibrated probability (0..1).

Return JSON {decision, confidence(0..1), reasoning, evidence_refs[]}.`;

export interface LegalInput {
  asset_id: string;
  jurisdiction: string;
  asset: string;
}

export async function audit(input: LegalInput): Promise<Verdict> {
  const endpoint = `${process.env.DATA_FEED_URL || "http://localhost:4021"}/legal?j=${encodeURIComponent(
    input.jurisdiction,
  )}`;
  const paid = await paidCall(process.env.AGENT_LEGAL_KEY!, endpoint);

  const userPrompt = `ASSET_ID: ${input.asset_id}
ASSET: ${input.asset}
JURISDICTION: ${input.jurisdiction}

DATA (retrieved via x402, cite as [SRC-legal]):
${JSON.stringify(paid.data, null, 2)}

Return your verdict.`;

  const v = await llmVerdict(SYSTEM_PROMPT, userPrompt);
  return {
    ...v,
    payment_tx_hash: paid.paymentTxHash,
    agent_address: paid.payer,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  audit({ asset_id: "rwa-001", jurisdiction: "EU", asset: "RealEstate-Unit-42" }).then((v) =>
    console.log("[legal]", Decision[v.decision], v.confidence, "tx:", v.payment_tx_hash),
  );
}
