/**
 * Shared LLM structured-verdict helper for the specialist agents.
 *
 * Uses the OpenAI SDK against any OpenAI-compatible chat endpoint — by default NVIDIA NIM
 * (integrate.api.nvidia.com) via OPENAI_BASE_URL, or OpenAI directly if BASE_URL is unset.
 * NVIDIA NIM does not support `json_schema` strict mode, so we request `json_object` mode
 * (attempt 1) and fall back to plain generation + regex JSON extraction (attempt 2).
 *
 * Post-validation/clamp + bounded retry. The bounded-agent pattern: the model returns a
 * strict enum decision + confidence; we never trust raw confidence as a probability, and on
 * any validation failure we fall back to VERIFY_FURTHER (safety-first).
 */

import OpenAI from "openai";
import { config } from "dotenv";
import { Decision, Verdict } from "../verdict.js";

config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

export interface LlmVerdictInput {
  /** Extra optional fields the specialist may ask the model for (e.g. estimated_value). */
  extraProperties?: Record<string, unknown>;
  /** Extra schema properties to merge into the JSON shape documented to the model. */
  extraSchema?: Record<string, unknown>;
}

function clampConfidence(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toDecision(s: string): Decision {
  if (s === "APPROVE") return Decision.APPROVE;
  if (s === "REJECT") return Decision.REJECT;
  return Decision.VERIFY_FURTHER;
}

function schemaDoc(extra?: Record<string, unknown>): string {
  const extras = extra
    ? ", " +
      Object.keys(extra)
        .map((k) => `"${k}": <${(extra[k] as { type?: string }).type || "value"}>`)
        .join(", ")
    : "";
  return (
    '{"decision": "APPROVE"|"VERIFY_FURTHER"|"REJECT", ' +
    '"confidence": number in [0,1], "reasoning": string, "evidence_refs": string[]' +
    extras +
    "}"
  );
}

function extractJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  throw new Error("no JSON object in LLM response");
}

function pickExtra(parsed: Record<string, unknown>, extraSchema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(extraSchema)) {
    if (k in parsed) out[k] = parsed[k];
  }
  return out;
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
  const fullSystem =
    `${systemPrompt}\n\nRespond with ONLY a JSON object matching this exact shape ` +
    `(no markdown fences, no prose around it):\n${schemaDoc(opts.extraSchema)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: fullSystem },
          { role: "user", content: userPrompt },
        ],
      };
      // Attempt 1: json_object mode (NVIDIA NIM / OpenAI both accept this). Attempt 2:
      // plain generation + regex extraction (fallback if json_object unsupported).
      if (attempt === 0) params.response_format = { type: "json_object" };

      const res = await openai.chat.completions.create(params);
      const text = res.choices[0]?.message?.content || "";
      const parsed = extractJson(text);

      const decision = toDecision(String(parsed.decision));
      const confidence = clampConfidence(Number(parsed.confidence));
      const reasoning = String(parsed.reasoning || "");
      const evidence_refs = Array.isArray(parsed.evidence_refs)
        ? parsed.evidence_refs.map(String)
        : [];

      return {
        decision,
        confidence,
        reasoning,
        evidence_refs,
        ...(opts.extraSchema ? pickExtra(parsed, opts.extraSchema) : {}),
      } as Omit<Verdict, "payment_tx_hash" | "agent_address">;
    } catch (err) {
      // Retry once with the fallback strategy; on second failure -> safety-first.
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
