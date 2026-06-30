/**
 * contract-calls — orchestrator-signed entry-point calls on the deployed Casper3643
 * contracts, used by the dashboard's write actions (issue/mint token, register identity).
 *
 * Uses the `casper-client` CLI (same tool that deployed the suite in scripts/deploy_all.sh)
 * so the call format matches the proven deploy path exactly. Requires `casper-client` on
 * PATH and the orchestrator key funded with CSPR on testnet. On any failure the thrown
 * message surfaces to the dashboard so the demo stays honest.
 */

import { execFileSync } from "node:child_process";
import { config } from "dotenv";

config();

const RPC = process.env.RPC_URL!;
const CHAIN = process.env.CHAIN_NAME!;
const SK = process.env.ORCHESTRATOR_KEY!;
const PAYMENT = "5000000000";

function pkg(envName: string): string {
  const v = (process.env[envName] || "").replace(/^hash-/, "");
  if (!v) throw new Error(`${envName} not set in .env`);
  return v;
}

/** Parse the first JSON object from casper-client output (it prints a preamble line). */
function parseTxHash(out: string): string {
  const i = out.indexOf("{");
  if (i < 0) throw new Error(`no JSON in casper-client output: ${out.slice(-200)}`);
  const d = JSON.parse(out.slice(i));
  return d?.result?.transaction_hash?.Version1 || d?.result?.deploy_hash || "";
}

function call(packageHash: string, entryPoint: string, args: string[]): string {
  const out = execFileSync(
    "casper-client",
    [
      "put-transaction", "session",
      "--node-address", RPC,
      "--chain-name", CHAIN,
      "--secret-key", SK,
      "--package-hash", packageHash,
      "--entry-point", entryPoint,
      "--pricing-mode", "classic",
      "--payment-amount", PAYMENT,
      "--standard-payment", "true",
      "--gas-price-tolerance", "1",
      ...args,
    ],
    { encoding: "utf8" },
  );
  const tx = parseTxHash(out);
  if (!tx) throw new Error(`casper-client returned no tx hash: ${out.slice(-200)}`);
  return tx;
}

/** Issue (mint) RWA tokens to an investor wallet. Entry point: SecurityToken::mint. */
export function deploySecurityToken(body: { to?: string; amount?: string }): string {
  const to = (body.to || "").replace(/^account-hash-/, "").replace(/^0x/, "");
  if (!to) throw new Error("issue-token: `to` (investor account hash hex) required");
  const amount = body.amount || "1000000";
  return call(pkg("SecurityToken"), "mint", [
    `to:key:'account-hash-${to}'`,
    `amount:u256:'${amount}'`,
  ]);
}

/** Register an investor identity + country. Entry point: IdentityRegistry::register_identity. */
export function registerIdentity(body: { wallet?: string; country?: number | string }): string {
  const wallet = (body.wallet || "").replace(/^account-hash-/, "").replace(/^0x/, "");
  if (!wallet) throw new Error("register-identity: `wallet` (account hash hex) required");
  const country = String(body.country ?? "826"); // 826 = GB default
  return call(pkg("IdentityRegistry"), "register_identity", [
    `wallet:key:'account-hash-${wallet}'`,
    `country:u32:'${country}'`,
  ]);
}
