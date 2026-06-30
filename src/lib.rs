#![cfg_attr(not(test), no_std)]

//! Casper3643 — ERC-3643 permissioned token suite + multi-agent Compliance Quorum on Casper.
//!
//! Implements initiative #6 of the Casper Manifest (Compliant Security Tokens / ERC-3643,
//! Tier-1 "buildable today") as an Odra/WASM port, plus a Verifiable AI compliance layer:
//! 3 specialist A2A agents audit an RWA, pay per-query for data feeds via x402, vote without
//! anchoring bias, and the verdict + reasoning hash + agent signatures + payment tx hashes
//! are attested on-chain. The AI agent acts as Trusted Issuer (KYC claims) and enforces
//! compliance autonomously (revoke/freeze/pause).

extern crate alloc;

pub mod attestation;
pub mod compliance;
pub mod identity;
pub mod reputation;
pub mod roles;
pub mod token;

pub use roles::agent_role::AgentRole;
