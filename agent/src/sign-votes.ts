/**
 * sign-votes — each specialist agent signs the canonical attestation digest with its own
 * secp256k1 key. The signature is the 65-byte algo-prefixed form (`[0x02 | 64sig]`) that
 * Casper's `verify_signature` and Odra's `env().verify_signature` expect, and that
 * `AttestationRegistry::record_verdict` checks against each `AgentVote.agent_pk`.
 *
 * In production each specialist has its OWN PEM (AGENT_SANCTIONS_KEY / AGENT_VALUATION_KEY /
 * AGENT_LEGAL_KEY) so the three signatures are independent and isolated. For the testnet
 * demo they may all point at the deployer key — the signatures are then identical (RFC 6979
 * deterministic ECDSA over the same digest+key), which is fine for a wiring smoke test but
 * should be replaced with per-agent keys before any reputation/stake logic is meaningful.
 */

import { readFileSync } from "node:fs";
import { config } from "dotenv";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const casperSdk: any = await import("casper-js-sdk");

import { canonicalDigest } from "./attestation-submit.js";

config();

const { PrivateKey, KeyAlgorithm } = casperSdk;

export interface AgentSig {
  /** 64 hex chars — account hash bytes (no `account-hash-` / `00` prefix), 32 bytes. */
  agent_address: string;
  /** 66 hex chars — `[algo|32 pubkey]`, 33 bytes (e.g. `02…` for secp256k1). */
  agent_pk: string;
  /** 130 hex chars — 65-byte `[algo|64sig]`. */
  signature: string;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function loadPriv(pemPath: string): typeof PrivateKey {
  const algo =
    process.env.AGENT_KEY_ALGO === "secp256k1"
      ? KeyAlgorithm.SECP256K1
      : KeyAlgorithm.ED25519;
  return PrivateKey.fromPem(readFileSync(pemPath, "utf8"), algo);
}

/** Derive the on-chain identity (public key + account hash) for the agent at `pemPath`. */
export function agentIdentity(pemPath: string): { agent_pk: string; agent_address: string } {
  const priv = loadPriv(pemPath);
  const pub = priv.publicKey;
  const algoByte = pub.cryptoAlg ?? KeyAlgorithm.SECP256K1;
  const agentPk = toHex(new Uint8Array([algoByte, ...pub.bytes()]));
  // pub.accountHash() -> AccountHash; .toBytes() -> 32 raw bytes.
  const ahBytes: Uint8Array = pub.accountHash().toBytes
    ? pub.accountHash().toBytes()
    : pub.accountHash().bytes();
  return { agent_pk: agentPk, agent_address: toHex(ahBytes) };
}

/**
 * Sign the canonical attestation digest with the agent key at `pemPath`.
 * The digest MUST match `AttestationRegistry::canonical_hash` (see attestation-submit.ts).
 */
export function signVote(
  subject: string,
  verdict: number,
  confidenceBps: number,
  reasoningHash: string,
  evidenceHash: string,
  pemPath: string,
): AgentSig {
  const digestHex = canonicalDigest("", subject, verdict, confidenceBps, reasoningHash, evidenceHash);
  const digestBytes = hexToBytes(digestHex); // 32 bytes
  const priv = loadPriv(pemPath);
  const sig: Uint8Array = priv.signAndAddAlgorithmBytes(digestBytes); // 65 bytes
  const { agent_pk, agent_address } = agentIdentity(pemPath);
  return { agent_address, agent_pk, signature: toHex(sig) };
}

// CLI entry: `npm run sign-votes -- <pemPath> <subject> <verdict> <confBps> <reasoningHex> <evidenceHex>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , pemPath, subject, verdict, conf, reasoning, evidence] = process.argv;
  if (!pemPath || !subject) {
    console.error("usage: sign-votes <pemPath> <subject> <verdict> <confBps> <reasoningHex> <evidenceHex>");
    process.exit(1);
  }
  const sig = signVote(subject, Number(verdict ?? 0), Number(conf ?? 9000), reasoning || "0".repeat(64), evidence || "0".repeat(64), pemPath);
  console.log(JSON.stringify(sig, null, 2));
}
