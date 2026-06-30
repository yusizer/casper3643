/**
 * SANCTIONS / KYC specialist agent.
 *
 * Pays (x402) for an OFAC/PEP sanctions + KYC identity data feed, then returns a strict,
 * safety-first verdict. Hard rules: every load-bearing claim must cite retrieved evidence;
 * insufficient evidence -> VERIFY_FURTHER (never guess); OFAC/PEP hit -> REJECT (>=0.9).
 */

import { config } from "dotenv";
import { Decision, Verdict } from "../verdict.js";
import { paidCall } from "../x402-client.js";
import { llmVerdict } from "./common.js";

config();

const SYSTEM_PROMPT = `You are a SANCTIONS/KYC compliance agent. Operate ONLY on the retrieved evidence
provided to you (tagged as DATA). You may NOT use prior knowledge for load-bearing claims.

HARD RULES:
1. Every load-bearing claim MUST be grounded in DATA. No grounding -> decision="VERIFY_FURTHER".
2. Insufficient or missing identity fields -> decision="VERIFY_FURTHER" and list the gaps in reasoning.
3. OFAC/PEP/sanctions match in DATA -> decision="REJECT", confidence>=0.9, put the list+entity id in evidence_refs.
4. No sanctions hit AND identity docs present and consistent -> decision="APPROVE".
5. Fuzzy-name ambiguity or unavailable screening -> decision="VERIFY_FURTHER".
6. confidence is your calibrated probability that your decision is correct (0..1). When unsure, lower it.

Return JSON {decision, confidence(0..1), reasoning, evidence_refs[]}.`;

export interface AuditInput {
  asset_id: string;
  investor_address: string;
  investor_name: string;
  /** Free-form context (documents summary, jurisdiction, …). */
  context?: string;
}

export async function audit(input: AuditInput): Promise<Verdict> {
  // 1) Pay for the sanctions/KYC data feed (x402).
  const endpoint = `${process.env.DATA_FEED_URL || "http://localhost:4021"}/sanctions?addr=${encodeURIComponent(
    input.investor_address,
  )}`;
  const paid = await paidCall(process.env.AGENT_SANCTIONS_KEY!, endpoint);

  // 2) LLM verdict grounded in the paid data.
  const userPrompt = `ASSET_ID: ${input.asset_id}
INVESTOR: ${input.investor_name} (${input.investor_address})
CONTEXT: ${input.context || "none"}

DATA (retrieved via x402, cite as [SRC-sanctions]):
${JSON.stringify(paid.data, null, 2)}

Return your verdict.`;

  const v = await llmVerdict(SYSTEM_PROMPT, userPrompt);
  return {
    ...v,
    payment_tx_hash: paid.paymentTxHash,
    agent_address: paid.payer,
  };
}

// Run as a standalone specialist (for isolated process / A2A-style deployment).
if (import.meta.url === `file://${process.argv[1]}`) {
  const sample: AuditInput = {
    asset_id: "rwa-001",
    investor_address: "0xABC123",
    investor_name: "Acme Holdings",
  };
  audit(sample).then((v) => {
    console.log("[sanctions] verdict:", Decision[v.decision], v.confidence, "tx:", v.payment_tx_hash);
    console.log(JSON.stringify(v, null, 2));
  });
}
