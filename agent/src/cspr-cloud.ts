/**
 * cspr-cloud — best-effort on-chain reads for the dashboard via the CSPR.cloud REST API.
 *
 * `getAttestations` queries VerdictAttested events / stored attestations for the deployed
 * AttestationRegistry package. CSPR.cloud's public REST surface for contract events may
 * require an API key and varies by revision, so this degrades gracefully to [] (the
 * dashboard shows "No attestations yet") rather than throwing. The attestation tx hashes
 * are also printed by `npm run demo` for direct verification on the explorer.
 */

import { config } from "dotenv";

config();

const CSPR_CLOUD = "https://api.testnet.cspr.cloud";

export interface AttestationView {
  id: number;
  subject: string;
  verdict: number; // 0=APPROVE,1=VERIFY_FURTHER,2=REJECT
  confidence: number; // bps
  reasoning_hash: string;
  agent_count: number;
  timestamp: number;
}

export async function getAttestations(): Promise<AttestationView[]> {
  const pkg = (process.env.ATTESTATION_REGISTRY_PACKAGE || "").replace(/^hash-/, "");
  const token = process.env.CSPR_CLOUD_ACCESS_TOKEN;
  if (!pkg) return [];
  try {
    // CSPR.cloud contract-events endpoint (best-effort; shape varies by revision).
    const url = `${CSPR_CLOUD}/contract-events?contract_package_hash=hash-${pkg}&limit=50`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: unknown[] };
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows
      .filter((r) => isVerdictAttested(r))
      .map((r) => toView(r as Record<string, unknown>))
      .filter(Boolean) as AttestationView[];
  } catch {
    return [];
  }
}

function isVerdictAttested(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const name = (r as Record<string, unknown>).event_type as string | undefined;
  return name === "VerdictAttested";
}

function toView(r: Record<string, unknown>): AttestationView | null {
  try {
    const args = (r.arguments ?? r.args ?? {}) as Record<string, unknown>;
    return {
      id: Number(args.id ?? r.id ?? 0),
      subject: String(args.subject ?? r.subject ?? ""),
      verdict: Number(args.verdict ?? r.verdict ?? 1),
      confidence: Number(args.confidence ?? 0),
      reasoning_hash: String(args.reasoning_hash ?? ""),
      agent_count: Number(args.agent_count ?? 0),
      timestamp: Number(args.timestamp ?? r.timestamp ?? 0),
    };
  } catch {
    return null;
  }
}
