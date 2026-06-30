/**
 * Attestation submitter: records the Compliance Quorum verdict on Casper.
 *
 * Builds a `ComplianceAttestation` (verdict + reasoning_hash + evidence_hash + 3 signed
 * AgentVotes carrying each agent's x402 payment tx hash) and submits it to the deployed
 * `AttestationRegistry.record_verdict` entry point via the casper-js-sdk TransactionV1
 * ContractCallBuilder, signed by the orchestrator key.
 *
 * CRITICAL: each agent signature must verify against the SAME canonical digest the Odra
 * contract computes in `AttestationRegistry::canonical_hash`:
 *   keccak256(subject_utf8 || [verdict_u8] || confidence_be32 || reasoning_hash || evidence_hash)
 * Note the digest uses confidence in **big-endian** (the contract calls `to_be_bytes()`),
 * while the on-chain CLValue serialization uses **little-endian** (Casper bytesrepr).
 *
 * The reasoning trace is pinned to IPFS first; its CID's bytes go into reasoning_hash.
 * Here we keccak-hash the reasoning string as a deterministic stand-in when no IPFS node is
 * configured (see `hashReasoning`).
 */

import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { keccak_256 } from "@noble/hashes/sha3";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const casperSdk: any = await import("casper-js-sdk");

import { DECISION_BYTE, TallyResult, Verdict } from "./verdict.js";

config();

const { CLValue, Args, ContractCallBuilder, PrivateKey, PublicKey, KeyAlgorithm, RpcClient } =
  casperSdk;

/** 32-byte hash as a hex string (no 0x). */
type Hash = string;

/** Mirrors the Odra `AgentVote` odra_type. */
export interface AgentVote {
  agent_address: string; // 00<64hex>  (account hash, no prefix)
  agent_pk: string; // 02<64hex>  (secp256k1 public key, algo-prefixed)
  decision: number; // 0/1/2
  confidence: number; // bps 0..10000
  signature: string; // 65-byte hex [algo|64sig]
  payment_tx_hash: string; // casper deploy hash hex (no prefix)
}

/** Mirrors the Odra `ComplianceAttestation` odra_type. */
export interface ComplianceAttestation {
  subject: string;
  verdict: number;
  confidence: number; // bps
  reasoning_hash: Hash;
  evidence_hash: Hash;
  votes: AgentVote[];
  tally_rule: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Canonical digest — MUST match `AttestationRegistry::canonical_hash` in
// src/attestation/attestation_registry.rs:
//   keccak256(subject || [verdict] || confidence.to_be_bytes() || reasoning_hash || evidence_hash)
// ---------------------------------------------------------------------------

/**
 * Canonical digest the contract verifies for every agent signature.
 */
export function canonicalDigest(
  _selfAddress: string,
  subject: string,
  verdict: number,
  confidenceBps: number,
  reasoningHash: Hash,
  evidenceHash: Hash,
): Hash {
  const be32 = new Uint8Array(4);
  // big-endian u32 — matches Rust `u32::to_be_bytes()`
  const c = confidenceBps >>> 0;
  be32[0] = (c >>> 24) & 0xff;
  be32[1] = (c >>> 16) & 0xff;
  be32[2] = (c >>> 8) & 0xff;
  be32[3] = c & 0xff;

  const reasoning = hexToBytes(reasoningHash);
  const evidence = hexToBytes(evidenceHash);
  if (reasoning.length !== 32 || evidence.length !== 32) {
    throw new Error("canonicalDigest: reasoning/evidence hash must be 32 bytes");
  }

  const out = keccak_256(
    Buffer.concat([
      Buffer.from(subject, "utf8"),
      Buffer.from([verdict & 0xff]),
      Buffer.from(be32),
      Buffer.from(reasoning),
      Buffer.from(evidence),
    ]),
  );
  return Buffer.from(out).toString("hex");
}

/** Keccak-256 of the reasoning trace — deterministic stand-in for an IPFS CID. */
export function hashReasoning(trace: string): Hash {
  return Buffer.from(keccak_256(Buffer.from(trace, "utf8"))).toString("hex");
}

/** Keccak-256 Merkle-style root over evidence refs (simple concatenation hash). */
export function hashEvidence(refs: string[]): Hash {
  const enc = refs.map((r) => Buffer.from(r, "utf8")).reduce(
    (acc, b) => Buffer.concat([acc, b]),
    Buffer.alloc(0),
  );
  return Buffer.from(keccak_256(enc)).toString("hex");
}

function confidenceToBps(c: number): number {
  return Math.max(0, Math.min(10000, Math.round(c * 10000)));
}

/**
 * Build the on-chain attestation from a tally result. Signatures are produced off-chain
 * by each specialist agent key over the canonical digest (see sign-votes.ts).
 */
export function buildAttestation(
  subject: string,
  result: TallyResult,
  reasoningHash: Hash,
  evidenceHash: Hash,
  votesWithSigs: { vote: Verdict; agent_pk: string; agent_address: string; signature: string }[],
): ComplianceAttestation {
  return {
    subject,
    verdict: DECISION_BYTE[result.verdict],
    confidence: confidenceToBps(result.confidence),
    reasoning_hash: reasoningHash,
    evidence_hash: evidenceHash,
    votes: votesWithSigs.map((v) => ({
      agent_address: v.agent_address,
      agent_pk: v.agent_pk,
      decision: DECISION_BYTE[v.vote.decision],
      confidence: confidenceToBps(v.vote.confidence),
      signature: v.signature,
      payment_tx_hash: v.vote.payment_tx_hash || "",
    })),
    tally_rule: result.tally_rule,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Casper bytesrepr — little-endian, matches casper-types `FromBytes` for the
// `ComplianceAttestation` / `AgentVote` odra_types. The CLValue is sent as CLType::Any
// carrying these bytes; Odra reads the named arg via `get_named_arg::<T>("att")`.
// ---------------------------------------------------------------------------

function u32Le(n: number): Uint8Array {
  const x = n >>> 0;
  return new Uint8Array([x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff]);
}

function u64Le(n: number): Uint8Array {
  const lo = n >>> 0;
  const hi = Math.floor(n / 0x100000000) >>> 0;
  return new Uint8Array([
    lo & 0xff, (lo >>> 8) & 0xff, (lo >>> 16) & 0xff, (lo >>> 24) & 0xff,
    hi & 0xff, (hi >>> 8) & 0xff, (hi >>> 16) & 0xff, (hi >>> 24) & 0xff,
  ]);
}

function stringBytes(s: string): Uint8Array {
  const utf8 = Buffer.from(s, "utf8");
  return Buffer.concat([Buffer.from(u32Le(utf8.length)), utf8]);
}

function bytesContainer(b: Uint8Array): Uint8Array {
  return Buffer.concat([Buffer.from(u32Le(b.length)), Buffer.from(b)]);
}

/** Serialize an AgentVote to Casper bytesrepr (matches the Odra `AgentVote` field order). */
export function serializeAgentVote(v: AgentVote): Uint8Array {
  const agent = hexToBytes(v.agent_address); // Address = AccountHash(32)
  if (agent.length !== 32) throw new Error(`AgentVote.agent_address must be 32 bytes, got ${agent.length}`);
  const pk = hexToBytes(v.agent_pk); // PublicKey: algo byte + 32 raw
  if (pk.length !== 33) throw new Error(`AgentVote.agent_pk must be 33 bytes (algo|32), got ${pk.length}`);
  const sig = hexToBytes(v.signature);
  const pay = hexToBytes(v.payment_tx_hash || "");
  return Buffer.concat([
    Buffer.from(agent),
    Buffer.from(pk),
    Buffer.from([v.decision & 0xff]),
    Buffer.from(u32Le(v.confidence >>> 0)),
    Buffer.from(bytesContainer(sig)),
    Buffer.from(bytesContainer(pay)),
  ]);
}

/** Serialize a ComplianceAttestation to Casper bytesrepr (matches the Odra field order). */
export function serializeAttestation(att: ComplianceAttestation): Uint8Array {
  const reasoning = hexToBytes(att.reasoning_hash);
  const evidence = hexToBytes(att.evidence_hash);
  if (reasoning.length !== 32 || evidence.length !== 32) {
    throw new Error("ComplianceAttestation: reasoning/evidence_hash must be 32 bytes");
  }
  const votes = Buffer.concat(att.votes.map((v) => Buffer.from(serializeAgentVote(v))));
  return Buffer.concat([
    Buffer.from(stringBytes(att.subject)),
    Buffer.from([att.verdict & 0xff]),
    Buffer.from(u32Le(att.confidence >>> 0)),
    Buffer.from(reasoning),
    Buffer.from(evidence),
    Buffer.from(u32Le(att.votes.length)),
    votes,
    Buffer.from(stringBytes(att.tally_rule)),
    Buffer.from(u64Le(att.timestamp >>> 0)),
  ]);
}

// ---------------------------------------------------------------------------
// On-chain submission
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").replace(/^account-hash-/, "").replace(/^hash-/, "");
  if (clean.length % 2 !== 0) throw new Error(`hexToBytes: odd length for "${hex}"`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

/** Load the orchestrator signing key from the PEM path in ORCHESTRATOR_KEY. */
export function loadOrchestratorKey(): { priv: typeof PrivateKey; pub: typeof PublicKey } {
  const pemPath = process.env.ORCHESTRATOR_KEY!;
  const algo =
    process.env.AGENT_KEY_ALGO === "secp256k1"
      ? KeyAlgorithm.SECP256K1
      : KeyAlgorithm.ED25519;
  const pem = readFileSync(pemPath, "utf8");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = (PrivateKey as any).fromPem(pem, algo);
  const pub = priv.publicKey;
  return { priv, pub };
}

/**
 * Submit the attestation to the deployed AttestationRegistry on Casper testnet.
 * Builds a TransactionV1 ContractCall to `record_verdict`, signs it with the orchestrator
 * key, puts it to the RPC, and polls for finality. Returns the transaction hash.
 */
export async function submitAttestation(att: ComplianceAttestation): Promise<string> {
  const rpcUrl = process.env.RPC_URL!;
  const chainName = process.env.CHAIN_NAME!;
  const pkgHash = (process.env.ATTESTATION_REGISTRY_PACKAGE || process.env.AttestationRegistry || "")
    .replace(/^hash-/, "");
  if (!pkgHash) throw new Error("submitAttestation: ATTESTATION_REGISTRY_PACKAGE not set in .env");

  const { priv, pub } = loadOrchestratorKey();

  // CLValue::Any carrying the bytesrepr(ComplianceAttestation) — Odra reads it via
  // get_named_arg::<ComplianceAttestation>("att").
  const attBytes = serializeAttestation(att);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attCl = (CLValue as any).newCLAny(attBytes);
  const argsMap = new Map<string, unknown>();
  argsMap.set("att", attCl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = new (Args as any)(argsMap);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = new (ContractCallBuilder as any)()
    .from(pub)
    .byPackageHash(pkgHash)
    .entryPoint("record_verdict")
    .runtimeArgs(args)
    .chainName(chainName)
    .payment(10_000_000_000)
    .build();

  // Sign the transaction hash with the orchestrator key (algo-prefixed 65-byte signature).
  const hashBytes = tx.hash.toBytes() as Uint8Array;
  const sig = priv.signAndAddAlgorithmBytes(hashBytes) as Uint8Array;
  tx.setSignature(sig, pub);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = new (RpcClient as any)(rpcUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const put: any = await rpc.putTransaction(tx);
  const txHash: string =
    put?.result?.transaction_hash ||
    put?.transaction_hash ||
    put?.result?.deploy_hash ||
    tx?.hash?.toHex?.() ||
    "";
  if (!txHash) throw new Error(`submitAttestation: no transaction hash in putTransaction response: ${JSON.stringify(put)}`);

  // Poll for finality (~15s on testnet), then surface any execution error.
  await sleep(15_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const info: any = await rpc.getTransactionByTransactionHash(txHash);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exec: any = info?.result?.execution_info?.execution_result?.Version2 || info?.execution_result;
  const err = exec?.error_message;
  if (err) throw new Error(`submitAttestation: execution failed: ${err}`);

  return txHash;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// CLI entry: `npm run attest -- <subject> <reasoning-hash-hex>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const subject = process.argv[2] || "rwa-real-estate-unit-42";
  const reasoning = process.argv[3] || hashReasoning("demo reasoning trace");
  const att: ComplianceAttestation = {
    subject,
    verdict: 0,
    confidence: 9000,
    reasoning_hash: reasoning,
    evidence_hash: hashEvidence(["ofac-sdn", "comparable-sales-4"]),
    votes: [],
    tally_rule: "2of3_supermajority",
    timestamp: Math.floor(Date.now() / 1000),
  };
  console.log("canonical digest:", canonicalDigest("", subject, att.verdict, att.confidence, att.reasoning_hash, att.evidence_hash));
  submitAttestation(att)
    .then((h) => console.log("attestation recorded on Casper testnet, tx:", h))
    .catch((e) => {
      console.error("attest failed:", e);
      process.exit(1);
    });
}
