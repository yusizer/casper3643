//! AttestationRegistry — Verifiable AI layer for the Compliance Quorum.
//!
//! After 3 specialist A2A agents independently audit an RWA, the orchestrator records the
//! consensus verdict here. Each agent's vote carries: its on-chain address + public key,
//! a discrete decision (APPROVE / VERIFY_FURTHER / REJECT) + confidence (basis points),
//! an EIP-712-style signature over the canonical attestation digest, and the Casper
//! deploy hash of its x402 payment for the data feed. The reasoning trace and evidence
//! are referenced by hash (IPFS CID / Merkle root), so the on-chain attestation is
//! verifiable and replayable without operator infrastructure. This closes the agent
//! accountability gap: WHY (reasoning hash), WHAT paid (tx hash), WHAT received (verdict).

use odra::casper_types::bytesrepr::Bytes;
use odra::casper_types::PublicKey;
use odra::prelude::*;

use crate::roles::agent_role::AgentRole;

/// Decision enum: 0 = APPROVE, 1 = VERIFY_FURTHER, 2 = REJECT.
pub const DECISION_APPROVE: u8 = 0;
pub const DECISION_VERIFY_FURTHER: u8 = 1;
pub const DECISION_REJECT: u8 = 2;

/// A single specialist agent's signed vote.
#[odra::odra_type]
pub struct AgentVote {
    pub agent: Address,
    pub agent_pk: PublicKey,
    /// 0 = APPROVE, 1 = VERIFY_FURTHER, 2 = REJECT.
    pub decision: u8,
    /// Confidence in basis points (0..=10000).
    pub confidence: u32,
    /// Signature over the canonical attestation digest.
    pub signature: Bytes,
    /// Casper deploy hash of the agent's x402 payment for its data feed.
    pub payment_tx_hash: Bytes,
}

/// The consensus attestation recorded on-chain.
#[odra::odra_type]
pub struct ComplianceAttestation {
    /// Subject identifier (asset id / investor wallet).
    pub subject: String,
    /// Final tally verdict (0/1/2).
    pub verdict: u8,
    /// Aggregate confidence (basis points).
    pub confidence: u32,
    /// Hash of the full reasoning trace (IPFS CID / keccak).
    pub reasoning_hash: [u8; 32],
    /// Merkle root of the evidence references.
    pub evidence_hash: [u8; 32],
    /// The 3 specialist votes.
    pub votes: Vec<AgentVote>,
    /// Human-readable tally rule applied (e.g. "2of3_supermajority").
    pub tally_rule: String,
    pub timestamp: u64,
}

#[odra::event]
pub struct VerdictAttested {
    pub id: u32,
    pub subject: String,
    pub verdict: u8,
    pub reasoning_hash: [u8; 32],
    pub agent_count: u32,
    pub timestamp: u64,
}

#[odra::odra_error]
pub enum ArError {
    NotAgent = 700,
    NotFound = 701,
    BadSignature = 702,
    NoVotes = 703,
    AgentPkMismatch = 704,
}

/// Verifiable AI attestation registry.
#[odra::module(events = [VerdictAttested], errors = ArError, name = "AttestationRegistry", version = "1.0.0")]
pub struct AttestationRegistry {
    agents: SubModule<AgentRole>,
    attestations: Mapping<u32, ComplianceAttestation>,
    by_subject: Mapping<String, u32>,
    count: Var<u32>,
}

#[odra::module]
impl AttestationRegistry {
    /// Initialise with the orchestrator as the first agent.
    pub fn init(&mut self, agent: Address) {
        self.agents.init(agent);
    }

    /// Orchestrator records the consensus verdict with all specialist votes.
    /// Every agent signature is verified against the canonical digest; the recovered
    /// address must match the claimed agent address.
    pub fn record_verdict(&mut self, att: ComplianceAttestation) -> u32 {
        self.agents.assert_agent(&self.env().caller());
        if att.votes.is_empty() {
            self.env().revert(ArError::NoVotes);
        }
        let digest = self.canonical_hash(&att);
        let msg = Bytes::from(digest.to_vec());
        for v in &att.votes {
            if Address::from(v.agent_pk.clone()) != v.agent {
                self.env().revert(ArError::AgentPkMismatch);
            }
            if !self.env().verify_signature(&msg, &v.signature, &v.agent_pk) {
                self.env().revert(ArError::BadSignature);
            }
        }

        let id = self.count.get_or_default();
        self.count.set(id + 1);
        let mut stored = att.clone();
        stored.timestamp = self.env().get_block_time_secs();
        self.attestations.set(&id, stored.clone());
        self.by_subject.set(&att.subject, id);
        self.env().emit_event(VerdictAttested {
            id,
            subject: stored.subject,
            verdict: stored.verdict,
            reasoning_hash: stored.reasoning_hash,
            agent_count: stored.votes.len() as u32,
            timestamp: stored.timestamp,
        });
        id
    }

    pub fn get(&self, id: u32) -> ComplianceAttestation {
        self.attestations
            .get(&id)
            .unwrap_or_revert_with(self, ArError::NotFound)
    }

    pub fn get_by_subject(&self, subject: String) -> ComplianceAttestation {
        let id = self
            .by_subject
            .get(&subject)
            .unwrap_or_revert_with(self, ArError::NotFound);
        self.get(id)
    }

    pub fn count(&self) -> u32 {
        self.count.get_or_default()
    }
}

impl AttestationRegistry {
    /// keccak256(subject || verdict || confidence || reasoning_hash || evidence_hash).
    fn canonical_hash(&self, att: &ComplianceAttestation) -> [u8; 32] {
        use sha3::{Digest, Keccak256};
        let mut h = Keccak256::default();
        h.update(att.subject.as_bytes());
        h.update([att.verdict]);
        h.update(att.confidence.to_be_bytes());
        h.update(att.reasoning_hash);
        h.update(att.evidence_hash);
        let out = h.finalize();
        let mut r = [0u8; 32];
        r.copy_from_slice(&out);
        r
    }
}
