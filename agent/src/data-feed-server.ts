/**
 * Paid data-feed server: wraps sanctions / valuation / legal upstream APIs behind x402.
 *
 * Each endpoint costs a few millicents of WCSPR (testnet). The server never touches the
 * agent's key — it forwards the paymentPayload + paymentRequirements to the facilitator
 * (/verify then /settle), and only returns the resource once settle reports success.
 *
 * This is the supply side of the agent economy: agents pay per request for the off-chain
 * data they need to reach a compliance verdict.
 */

import cors from "cors";
import { config } from "dotenv";
import express from "express";
// @ts-ignore
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
// @ts-ignore
import { ExactCasperScheme } from "@make-software/casper-x402/exact/server";
// @ts-ignore
import { HTTPFacilitatorClient } from "@x402/core/server";
// @ts-ignore
import type { AssetAmount, Network } from "@x402/core/types";

config();

const payeeAddress = process.env.PAYEE_ADDRESS!;
const facilitatorURL = process.env.FACILITATOR_URL!;
const facilitatorAPIKey = process.env.FACILITATOR_API_KEY || "";
const chainID = process.env.CAIP2_CHAIN_ID as Network; // casper:casper-test
const assetPackage = process.env.ASSET_PACKAGE!.replace(/^hash-/, "");
const port = parseInt(process.env.DATA_FEED_PORT || "4021", 10);

const auth = facilitatorAPIKey ? { Authorization: facilitatorAPIKey } : undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const facilitatorClient = new HTTPFacilitatorClient({
  url: facilitatorURL,
  ...(auth ? { createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }) } : {}),
} as any);

// 1 WCSPR (9 decimals) per sanctions hit; 2 per valuation; 5 per legal risk.
const wcsp = (units: string): AssetAmount => ({
  asset: assetPackage,
  amount: units,
  extra: {
    name: process.env.ASSET_NAME || "Wrapped CSPR",
    symbol: process.env.ASSET_SYMBOL || "WCSPR",
    version: process.env.ASSET_VERSION || "1",
    decimals: process.env.ASSET_DECIMALS || "9",
  },
});

const casperScheme = new ExactCasperScheme()
  .registerAsset(chainID, assetPackage, 9)
  .registerMoneyParser(async () => {
    // default fallback (overridden per-route below via price)
    return wcsp("1000000000");
  });

const app = express();
app.use(cors({ origin: "*", exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] }));
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      "GET /sanctions": {
        accepts: [{ scheme: "exact", price: "$0.01", network: chainID, payTo: payeeAddress }],
        description: "OFAC/PEP sanctions + KYC identity check",
        mimeType: "application/json",
      },
      "GET /valuation": {
        accepts: [{ scheme: "exact", price: "$0.02", network: chainID, payTo: payeeAddress }],
        description: "RWA valuation from comparable sales",
        mimeType: "application/json",
      },
      "GET /legal": {
        accepts: [{ scheme: "exact", price: "$0.05", network: chainID, payTo: payeeAddress }],
        description: "Chain-of-title / legal provenance risk",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(chainID, casperScheme),
  ),
);

// --- Upstream data (mocked here; swap for real OFAC/appraisal/registry APIs in prod) ---

app.get("/sanctions", (req, res) => {
  const addr = String(req.query.addr || "");
  const hit = addr.toLowerCase().includes("0xbad");
  res.json({
    address: addr,
    sanctioned: hit,
    source: "OFAC SDN (mock)",
    pep: false,
    timestamp: Date.now(),
  });
});

app.get("/valuation", (req, res) => {
  const asset = String(req.query.asset || "");
  res.json({ asset, usd: 1234.56, comparables: 4, as_of: Date.now() });
});

app.get("/legal", (req, res) => {
  const j = String(req.query.j || "EU");
  res.json({ jurisdiction: j, risk: "medium", liens: 0, chain_breaks: 0, timestamp: Date.now() });
});

// --- Compliance Quorum endpoint (called by the web dashboard's "Run Compliance Quorum") ---
// Runs the 3-specialist quorum in-process and returns the tally + per-agent verdicts. The
// specialists still pay per data-feed call via x402 (to this same server's /sanctions etc.);
// without a funded WCSPR balance + facilitator token they fall back to safety-first
// VERIFY_FURTHER, and the quorum still returns a verdict (never APPROVE on disagreement).
app.post("/quorum", express.json(), async (req, res) => {
  try {
    const { runQuorum } = await import("./orchestrator.js");
    const out = await runQuorum(req.body);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Dashboard write endpoints ---
// These orchestrate orchestrator-signed deploys to the deployed contracts. The suite is
// already live on testnet (see deploy_hashes.sh); these endpoints build + sign + submit the
// deploys server-side (the agent acts as the Trusted Issuer / token manager). They return
// the Casper transaction hash on success. Requires the orchestrator key + a CSPR balance.
app.post("/api/issue-token", express.json(), async (req, res) => {
  try {
    const { deploySecurityToken } = await import("./contract-calls.js");
    const tx = await deploySecurityToken(req.body || {});
    res.json({ status: "submitted", tx_hash: tx });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

app.post("/api/register-identity", express.json(), async (req, res) => {
  try {
    const { registerIdentity } = await import("./contract-calls.js");
    const tx = await registerIdentity(req.body || {});
    res.json({ status: "submitted", tx_hash: tx });
  } catch (e) {
    res.status(500).json({ status: "error", error: (e as Error).message });
  }
});

// On-chain attestation reads via CSPR.cloud REST (best-effort; returns [] if unreachable).
app.get("/api/attestations", async (_req, res) => {
  try {
    const { getAttestations } = await import("./cspr-cloud.js");
    res.json(await getAttestations());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(port, () => {
  console.log(`[data-feed] paid sanctions/valuation/legal + /quorum + /api on :${port} (casper:casper-test, WCSPR)`);
});
