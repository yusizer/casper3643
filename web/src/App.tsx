import { useEffect, useState } from "react";
import { connectWallet, activeAccount, onReady } from "./lib/cspr-click";
import { getAttestations, runQuorum, issueToken, registerIdentity, type AttestationView, type WriteResult } from "./lib/api";

const VERDICT_LABEL = ["APPROVE", "VERIFY_FURTHER", "REJECT"];
const VERDICT_COLOR = ["#16a34a", "#d97706", "#dc2626"];

export default function App() {
  const [ready, setReady] = useState(false);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [attestations, setAttestations] = useState<AttestationView[]>([]);
  const [quorumBusy, setQuorumBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [quorumResult, setQuorumResult] = useState<any>(null);

  useEffect(() => onReady(() => setReady(true)), []);
  useEffect(() => {
    activeAccount().then((a) => a && setPubkey(a.public_key));
    getAttestations().then(setAttestations);
  }, []);

  async function handleConnect() {
    const pk = await connectWallet();
    setPubkey(pk);
  }

  async function handleRunQuorum() {
    setQuorumBusy(true);
    try {
      const r = await runQuorum({
        asset_id: "rwa-real-estate-unit-42",
        investor_address: "0xABC123",
        investor_name: "Acme Holdings Ltd.",
        asset: "RealEstate-Unit-42",
        jurisdiction: "EU",
        min_val: 1_000_000,
        max_val: 1_500_000,
      });
      setQuorumResult(r);
      getAttestations().then(setAttestations);
    } finally {
      setQuorumBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Casper3643</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            ERC-3643 Permissioned Tokens + Multi-Agent Compliance Quorum on Casper
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={!ready}
          style={{ padding: "8px 16px", background: "#f97316", color: "white", border: "none", borderRadius: 6, cursor: ready ? "pointer" : "wait" }}
        >
          {pubkey ? `Connected: ${pubkey.slice(0, 10)}…` : ready ? "Connect Casper Wallet" : "Loading SDK…"}
        </button>
      </header>

      <section style={{ marginTop: 24 }}>
        <h2>1. Issue a regulated RWA token</h2>
        <p style={{ color: "#6b7280" }}>
          Mint the deployed SecurityToken (ERC-3643 over Cep18) to an investor wallet. The
          orchestrator signs + submits the on-chain <code>mint</code> entry point.
        </p>
        <IssueTokenForm />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>2. Investor identity &amp; compliance gate</h2>
        <p style={{ color: "#6b7280" }}>
          Register the investor in the IdentityRegistry (<code>register_identity</code>) with
          their country. The sanctions/KYC agent then signs a KYC claim as a Trusted Issuer →
          <code>is_verified</code> flips true → transfers allowed. Non-verified or
          non-allowlisted-country transfers revert on-chain.
        </p>
        <IdentityForm />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>3. Compliance Quorum (live)</h2>
        <p style={{ color: "#6b7280" }}>
          3 specialist A2A agents audit the asset in parallel — each pays (x402, WCSPR) for its
          data feed, returns a signed safety-first verdict; the orchestrator tallies (2/3
          supermajority). Verdict + reasoning hash + agent signatures + payment tx hashes are
          attested on Casper.
        </p>
        <button onClick={handleRunQuorum} disabled={quorumBusy} style={{ padding: "8px 16px", background: "#0ea5e9", color: "white", border: "none", borderRadius: 6 }}>
          {quorumBusy ? "Running quorum…" : "Run Compliance Quorum"}
        </button>
        {quorumResult && (
          <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 16, borderRadius: 6, overflow: "auto", marginTop: 12 }}>
            {JSON.stringify(quorumResult, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>4. On-chain attestations (Verifiable AI)</h2>
        {attestations.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No attestations yet — run the quorum above, or <code>npm run demo</code> in the agent.</p>
        ) : (
          <ul>
            {attestations.map((a) => (
              <li key={a.id}>
                <strong style={{ color: VERDICT_COLOR[a.verdict] }}>{VERDICT_LABEL[a.verdict]}</strong>{" "}
                — {a.subject} · conf {(a.confidence / 100).toFixed(2)} · {a.agent_count} agents
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>5. Agent reputation (Brier + stake/slash)</h2>
        <p style={{ color: "#6b7280" }}>
          Each agent's running Brier score + correct/total + stake. A wrong confident call
          slashes stake; the score is a strictly-proper scoring rule that rewards calibration.
          (Demo values below — wired to <code>AgentReputation</code> state in prod.)
        </p>
        <ReputationTable />
      </section>

      <footer style={{ marginTop: 32, color: "#9ca3af", fontSize: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        Casper Agentic Buildathon 2026 · Casper Innovation Track · Apache-2.0
      </footer>
    </div>
  );
}

function IssueTokenForm() {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1000000");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WriteResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setRes(await issueToken({ to, amount }));
    } catch (err) {
      setRes({ status: "error", error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 700 }}>
      <input placeholder="Investor account hash hex" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
      <input placeholder="Amount (u256)" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
      <button disabled={busy || !to} style={{ ...inputStyle, background: "#16a34a", color: "white", cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Submitting…" : "Mint SecurityToken"}
      </button>
      {res && (
        <div style={{ gridColumn: "1 / -1", fontSize: 13, color: res.status === "error" ? "#dc2626" : "#16a34a" }}>
          {res.status === "submitted" ? `✓ tx ${res.tx_hash}` : `✗ ${res.error}`}
        </div>
      )}
    </form>
  );
}

function IdentityForm() {
  const [wallet, setWallet] = useState("");
  const [country, setCountry] = useState("826");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WriteResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setRes(await registerIdentity({ wallet, country }));
    } catch (err) {
      setRes({ status: "error", error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 700 }}>
      <input placeholder="Investor account hash hex" value={wallet} onChange={(e) => setWallet(e.target.value)} style={inputStyle} />
      <input placeholder="Country (ISO 3166 numeric)" value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} />
      <button disabled={busy || !wallet} style={{ ...inputStyle, background: "#0ea5e9", color: "white", cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Submitting…" : "Register identity"}
      </button>
      {res && (
        <div style={{ gridColumn: "1 / -1", fontSize: 13, color: res.status === "error" ? "#dc2626" : "#16a34a" }}>
          {res.status === "submitted" ? `✓ tx ${res.tx_hash}` : `✗ ${res.error}`}
        </div>
      )}
    </form>
  );
}

function ReputationTable() {
  const agents = [
    { name: "sanctions/KYC", brier: 0.12, correct: 17, total: 18, stake: "500" },
    { name: "valuation", brier: 0.18, correct: 15, total: 18, stake: "450" },
    { name: "legal-provenance", brier: 0.09, correct: 18, total: 18, stake: "500" },
  ];
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 700 }}>
      <thead>
        <tr>
          <th style={th}>Agent</th>
          <th style={th}>Brier (lower=better)</th>
          <th style={th}>Correct/Total</th>
          <th style={th}>Stake (CSPR)</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((a) => (
          <tr key={a.name}>
            <td style={td}>{a.name}</td>
            <td style={td}>{a.brier.toFixed(3)}</td>
            <td style={td}>{a.correct}/{a.total}</td>
            <td style={td}>{a.stake}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const inputStyle: React.CSSProperties = { padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 };
const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 };
const td: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: 8 };
