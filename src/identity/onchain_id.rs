//! OnchainId — a simplified ERC-3643 ONCHAINID: an identity contract per participant that
//! holds signed claims (KYC, AML, accreditation, …).
//!
//! A `Claim` is `{topic, data, issuer, signature, revoked, uri}`. The issuer signs a
//! domain-separated digest of `(identity, topic, data)` off-chain (casper-eip-712 style);
//! `add_claim` verifies that signature on-chain with `env::verify_signature` and requires
//! the recovered address to match the claimed issuer. The AI compliance agent acts as a
//! Trusted Issuer: it evaluates an investor and submits a signed claim here, after which
//! `IdentityRegistry::is_verified` returns true and the investor may hold the security token.

use odra::casper_types::bytesrepr::{Bytes, ToBytes};
use odra::casper_types::PublicKey;
use odra::prelude::*;

/// A signed attestation stored on an investor's ONCHAINID.
#[odra::odra_type]
pub struct Claim {
    pub topic: u32,
    /// Arbitrary payload (e.g. hash of the verified document, or a compact verdict).
    pub data: Bytes,
    /// The trusted issuer that signed the claim.
    pub issuer: Address,
    /// EIP-712-style signature of `claim_digest(identity, topic, data)` by the issuer.
    pub signature: Bytes,
    pub revoked: bool,
    /// Off-chain URI of the full evidence (IPFS CID, https URL, …).
    pub uri: String,
}

/// Composite key for the (topic, issuer) -> claim_id lookup.
#[odra::odra_type]
pub struct TopicIssuer {
    pub topic: u32,
    pub issuer: Address,
}

#[odra::event]
pub struct ClaimAdded {
    pub identity: Address,
    pub topic: u32,
    pub issuer: Address,
    pub claim_id: u32,
}

#[odra::event]
pub struct ClaimRemoved {
    pub identity: Address,
    pub topic: u32,
    pub issuer: Address,
}

#[odra::odra_error]
pub enum IdError {
    ClaimNotFound = 200,
    AlreadyRevoked = 201,
    NotAuthorized = 202,
    InvalidSignature = 203,
}

/// ONCHAINID — one instance per investor; stores its claims on itself.
#[odra::module(events = [ClaimAdded, ClaimRemoved], errors = IdError, name = "OnchainId", version = "1.0.0")]
pub struct OnchainId {
    /// claim_id -> Claim.
    claims: Mapping<u32, Claim>,
    /// (topic, issuer) -> claim_id (fast lookup).
    by_topic_issuer: Mapping<TopicIssuer, u32>,
    claim_count: Var<u32>,
    /// Manager (usually the IdentityRegistry) authorised to add/revoke on behalf.
    manager: Var<Address>,
}

#[odra::module]
impl OnchainId {
    /// Initialise with a manager address (the IdentityRegistry or the issuer themselves).
    pub fn init(&mut self, manager: Address) {
        self.manager.set(manager);
    }

    /// Add a claim after verifying the issuer's signature on the claim digest.
    ///
    /// Callable by the manager or by the issuer itself. The signature must be over
    /// `keccak256(identity || topic || data)` and recover to `issuer`.
    pub fn add_claim(
        &mut self,
        topic: u32,
        data: Bytes,
        issuer: Address,
        issuer_pk: PublicKey,
        signature: Bytes,
        uri: String,
    ) -> u32 {
        let caller = self.env().caller();
        let mgr = self.manager.get().unwrap_or_revert(self);
        if caller != mgr && caller != issuer {
            self.env().revert(IdError::NotAuthorized);
        }

        let digest = self.claim_digest(topic, &data);
        let msg = Bytes::from(digest.to_vec());
        if !self.env().verify_signature(&msg, &signature, &issuer_pk) {
            self.env().revert(IdError::InvalidSignature);
        }
        if Address::from(issuer_pk) != issuer {
            self.env().revert(IdError::InvalidSignature);
        }

        let id = self.claim_count.get_or_default();
        self.claim_count.set(id + 1);
        let claim = Claim {
            topic,
            data,
            issuer,
            signature,
            revoked: false,
            uri,
        };
        self.claims.set(&id, claim);
        self.by_topic_issuer.set(
            &TopicIssuer {
                topic,
                issuer,
            },
            id,
        );
        self.env().emit_event(ClaimAdded {
            identity: self.env().self_address(),
            topic,
            issuer,
            claim_id: id,
        });
        id
    }

    /// Fetch the claim for (topic, issuer).
    pub fn get_claim(&self, topic: u32, issuer: Address) -> Claim {
        let id = self
            .by_topic_issuer
            .get(&TopicIssuer { topic, issuer })
            .unwrap_or_revert_with(self, IdError::ClaimNotFound);
        self.claims
            .get(&id)
            .unwrap_or_revert_with(self, IdError::ClaimNotFound)
    }

    /// Whether there is a non-revoked claim for (topic, issuer).
    pub fn has_claim(&self, topic: u32, issuer: Address) -> bool {
        self.by_topic_issuer
            .get(&TopicIssuer { topic, issuer })
            .map(|id| {
                self.claims
                    .get(&id)
                    .map(|c| !c.revoked)
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    /// Revoke a claim (manager or issuer only).
    pub fn revoke_claim(&mut self, topic: u32, issuer: Address) {
        let caller = self.env().caller();
        let mgr = self.manager.get().unwrap_or_revert(self);
        if caller != mgr && caller != issuer {
            self.env().revert(IdError::NotAuthorized);
        }
        let id = self
            .by_topic_issuer
            .get(&TopicIssuer { topic, issuer })
            .unwrap_or_revert_with(self, IdError::ClaimNotFound);
        let mut c = self.claims.get(&id).unwrap_or_revert(self);
        if c.revoked {
            self.env().revert(IdError::AlreadyRevoked);
        }
        c.revoked = true;
        self.claims.set(&id, c);
        self.env().emit_event(ClaimRemoved {
            identity: self.env().self_address(),
            topic,
            issuer,
        });
    }

    /// Number of claims ever added (for off-chain audit).
    pub fn claim_count(&self) -> u32 {
        self.claim_count.get_or_default()
    }
}

impl OnchainId {
    /// keccak256(self_address || topic_be || data) — claim digest the issuer signs.
    /// The OnchainId's own address (the identity) is bound into the digest so a signature
    /// issued for one identity cannot be replayed against another.
    fn claim_digest(&self, topic: u32, data: &Bytes) -> [u8; 32] {
        use sha3::{Digest, Keccak256};
        let mut h = Keccak256::default();
        h.update(self.env().self_address().to_bytes().unwrap_or_default());
        h.update(topic.to_be_bytes());
        h.update(data);
        let out = h.finalize();
        let mut r = [0u8; 32];
        r.copy_from_slice(&out);
        r
    }
}
