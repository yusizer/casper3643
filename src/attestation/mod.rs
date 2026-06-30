//! Verifiable AI attestation registry — records the Compliance Quorum verdict on-chain.

pub mod attestation_registry;

pub use attestation_registry::{
    AttestationRegistry, AgentVote, ComplianceAttestation, DECISION_APPROVE,
    DECISION_VERIFY_FURTHER, DECISION_REJECT,
};
