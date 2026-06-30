/**
 * Read + write helpers for the dashboard.
 *  - Reads (attestations, reputation) hit CSPR.cloud REST / the agent backend.
 *  - Writes (issue token, register identity) POST to the agent backend, which builds + signs
 *    the orchestrator deploy and submits it to the deployed contracts on testnet.
 *  - runQuorum POSTs to the agent orchestrator's in-process /quorum endpoint.
 *
 * In dev, Vite proxies /api and /quorum to the data-feed server (see vite.config.ts) so the
 * browser stays same-origin. In prod, set VITE_AGENT_URL to the public agent origin.
 */

const AGENT = (import.meta.env.VITE_AGENT_URL as string | undefined) || "";
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

export interface ReputationView {
  agent: string;
  correct_count: number;
  total_count: number;
  avg_brier: number;
  skill_bps: number;
  stake: string;
}

function agentUrl(path: string): string {
  return AGENT ? `${AGENT}${path}` : path;
}

export async function getAttestations(): Promise<AttestationView[]> {
  try {
    const res = await fetch(agentUrl("/api/attestations"));
    if (!res.ok) return [];
    const data = (await res.json()) as AttestationView[] | { error: string };
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getReputation(_agent: string): Promise<ReputationView | null> {
  // TODO: query AgentReputation.get_rep via CSPR.cloud once an agent-registry view is wired.
  void _agent;
  return null;
}

export interface WriteResult {
  status: string;
  tx_hash?: string;
  error?: string;
}

export async function issueToken(input: { to: string; amount: string }): Promise<WriteResult> {
  const res = await fetch(agentUrl("/api/issue-token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function registerIdentity(input: { wallet: string; country: string }): Promise<WriteResult> {
  const res = await fetch(agentUrl("/api/register-identity"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function runQuorum(input: {
  asset_id: string;
  investor_address: string;
  investor_name: string;
  asset: string;
  jurisdiction: string;
  min_val: number;
  max_val: number;
}): Promise<unknown> {
  const res = await fetch(agentUrl("/quorum"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export { CSPR_CLOUD };
