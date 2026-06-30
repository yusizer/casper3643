/**
 * Shared LLM structured-verdict helper for the specialist agents.
 *
 * OpenAI Structured Outputs (response_format = json_schema, strict), temperature = 0, plus
 * post-validation/clamp and a bounded retry. This is the bounded-agent pattern: the model
 * returns a strict enum decision + confidence; we never trust raw confidence as a
 * probability, and on any validation failure we fall back to VERIFY_FURTHER (safety-first).
 */

import OpenAI from "openai";
import { config } from "dotenv";
import { Decision, Verdict } from "../verdict.js";

config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

const VERDICT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["decision", "confidence", "reasoning", "evidence_refs"],
  properties: {
    decision: { type: "string", enum: ["APPROVE", "VERIFY_FURTHER", "REJECT"] },
    confidence: { type: "number" },
    reasoning: { type: "string" },
    evidence_refs: { type: "array", items: { type: "string" } },
  },
};

function clampConfidence(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toDecision(s: string): Decision {
  if (s === "APPROVE") return Decision.APPROVE;
  if (s === "REJECT") return Decision.REJECT;
  return Decision.VERIFY_FURTHER;
}

export interface LlmVerdictInput {
  /** Extra optional fields the specialist may ask the model for (e.g. estimated_value). */
  extraProperties?: Record<string, unknown>;
  /** Extra schema properties to merge into the JSON schema. */
  extraSchema?: Record<string, unknown>;
}

/**
 * Run one specialist LLM call with a strict verdict schema.
 * @param systemPrompt  The specialist's safety-first system prompt.
 * @param userPrompt    The audit input (asset payload + retrieved data).
 */
export async function llmVerdict(
  systemPrompt: string,
  userPrompt: string,
  opts: LlmVerdictInput = {},
): Promise<Omit<Verdict, "payment_tx_hash" | "agent_address">> {
  const schema = opts.extraSchema
    ? {
        ...VERDICT_SCHEMA,
        required: [...VERDICT_SCHEMA.required, ...Object.keys(opts.extraSchema)],
        properties: { ...VERDICT_SCHEMA.properties, ...opts.extraSchema },
      }
    : VERDICT_SCHEMA;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "verdict", schema, strict: true } },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const text = res.choices[0]?.message?.content || "";
      const parsed = JSON.parse(text);

      const decision = toDecision(parsed.decision);
      const confidence = clampConfidence(Number(parsed.confidence));
      const reasoning = String(parsed.reasoning || "");
      const evidence_refs = Array.isArray(parsed.evidence_refs) ? parsed.evidence_refs.map(String) : [];

      return {
        decision,
        confidence,
        reasoning,
        evidence_refs,
        ...(opts.extraSchema ? pickExtra(parsed, opts.extraSchema) : {}),
      } as Omit<Verdict, "payment_tx_hash" | "agent_address">;
    } catch (err) {
      // Retry once; on second failure fall back to safety-first VERIFY_FURTHER.
      if (attempt === 1) {
        return {
          decision: Decision.VERIFY_FURTHER,
          confidence: 0,
          reasoning: `LLM/validation failure: ${(err as Error).message}`,
          evidence_refs: [],
          ...(opts.extraSchema ? opts.extraProperties || {} : {}),
        } as Omit<Verdict, "payment_tx_hash" | "agent_address">;
      }
    }
  }
  // Unreachable
  return { decision: Decision.VERIFY_FURTHER, confidence: 0, reasoning: "unreachable", evidence_refs: [] };
}

function pickExtra(parsed: Record<string, unknown>, extraSchema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(extraSchema)) {
    if (k in parsed) out[k] = parsed[k];
  }
  return out;
}
