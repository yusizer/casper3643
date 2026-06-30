//! ERC-3643 identity layer: claim topics, trusted issuers, identity registry (with claims).
//!
//! Prototype: the ONCHAINID claim store is co-located on the IdentityRegistry (see
//! identity_registry.rs) since Odra does not expose dynamic external-contract calls by
//! address. `onchain_id.rs` is retained as a standalone reference module but not wired.

pub mod claim_topics;
pub mod identity_registry;
pub mod onchain_id;
pub mod trusted_issuers;

pub use claim_topics::ClaimTopicsRegistry;
pub use identity_registry::{
    Claim, ClaimKey, IdentityData, IdentityRegistry, IdentityRegistryStorage,
};
pub use trusted_issuers::TrustedIssuersRegistry;
