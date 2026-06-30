//! IdentityRegistry + IdentityRegistryStorage — ERC-3643 identity layer.
//!
//! `IdentityRegistryStorage` maps investor wallets to a country code. `IdentityRegistry`
//! implements `is_verified(wallet)`: for every required claim topic (from
//! `ClaimTopicsRegistry`) there must exist a non-revoked claim for `(wallet, topic)` signed
//! by a trusted issuer (from `TrustedIssuersRegistry`) for that topic.
//!
//! Prototype simplification: claims are stored directly on the IdentityRegistry (keyed by
//! (wallet, topic, issuer)) rather than on a separate ONCHAINID contract — Odra does not
//! expose a dynamic external-contract call by address, so co-locating claims avoids a
//! cross-call while preserving the ERC-3643 `isVerified` semantics. The AI compliance agent
//! acts as a Trusted Issuer: it signs a KYC/AML claim and submits it here.

use odra::casper_types::bytesrepr::{Bytes, ToBytes};
use odra::casper_types::PublicKey;
use odra::prelude::*;
use odra_modules::access::Ownable;

/// Country code (ISO-3166) stored per investor.
#[odra::odra_type]
pub struct IdentityData {
    pub country: u32,
}

/// A signed claim that an investor satisfies a topic (KYC, AML, …).
#[odra::odra_type]
pub struct Claim {
    pub topic: u32,
    pub data: Bytes,
    pub issuer: Address,
    pub signature: Bytes,
    pub revoked: bool,
    pub uri: String,
}

/// Composite key for claims: (wallet, topic, issuer).
#[odra::odra_type]
pub struct ClaimKey {
    pub wallet: Address,
    pub topic: u32,
    pub issuer: Address,
}

// --- External contract views ---

#[odra::external_contract]
pub trait ClaimTopicsView {
    fn get_claim_topics(&self) -> Vec<u32>;
}

#[odra::external_contract]
pub trait TrustedIssuersView {
    fn is_trusted_issuer(&self, issuer: &Address, topic: u32) -> bool;
    fn list_trusted_issuers(&self) -> Vec<Address>;
}

#[odra::event]
pub struct IdentityRegistered {
    pub wallet: Address,
    pub country: u32,
    pub caller: Address,
}

#[odra::event]
pub struct IdentityRemoved {
    pub wallet: Address,
    pub caller: Address,
}

#[odra::event]
pub struct IdentityVerified {
    pub wallet: Address,
    pub verified: bool,
}

#[odra::event]
pub struct ClaimAdded {
    pub wallet: Address,
    pub topic: u32,
    pub issuer: Address,
}

#[odra::event]
pub struct ClaimRevoked {
    pub wallet: Address,
    pub topic: u32,
    pub issuer: Address,
}

#[odra::odra_error]
pub enum IrError {
    NotRegistered = 400,
    NotVerified = 401,
    NotOwner = 402,
    AlreadyRegistered = 403,
    ClaimNotFound = 404,
    InvalidSignature = 405,
    AlreadyRevoked = 406,
    NotAuthorized = 407,
}

/// Storage: wallet -> IdentityData (+ enumerable investor list).
#[odra::module(errors = IrError, name = "IdentityRegistryStorage", version = "1.0.0")]
pub struct IdentityRegistryStorage {
    identities: Mapping<Address, IdentityData>,
    registered: Mapping<Address, bool>,
    investors: List<Address>,
}

#[odra::module]
impl IdentityRegistryStorage {
    pub fn init(&self) {}

    pub fn store_identity(&mut self, wallet: Address, country: u32) {
        if self.registered.get_or_default(&wallet) {
            self.env().revert(IrError::AlreadyRegistered);
        }
        self.identities.set(&wallet, IdentityData { country });
        self.registered.set(&wallet, true);
        self.investors.push(wallet);
    }

    pub fn get_identity(&self, wallet: &Address) -> IdentityData {
        if !self.registered.get_or_default(wallet) {
            self.env().revert(IrError::NotRegistered);
        }
        self.identities
            .get(wallet)
            .unwrap_or_revert_with(self, IrError::NotRegistered)
    }

    pub fn get_country(&self, wallet: &Address) -> u32 {
        self.get_identity(wallet).country
    }

    pub fn is_registered(&self, wallet: &Address) -> bool {
        self.registered.get_or_default(wallet)
    }

    pub fn delete_identity(&mut self, wallet: &Address) {
        if !self.registered.get_or_default(wallet) {
            self.env().revert(IrError::NotRegistered);
        }
        self.registered.set(wallet, false);
    }

    pub fn list_investors(&self) -> Vec<Address> {
        self.investors
            .iter()
            .filter(|w| self.registered.get_or_default(w))
            .collect()
    }
}

/// IdentityRegistry — the `is_verified` gate used by the SecurityToken, and the claim store.
#[odra::module(events = [IdentityRegistered, IdentityRemoved, IdentityVerified, ClaimAdded, ClaimRevoked], errors = IrError, name = "IdentityRegistry", version = "1.0.0")]
pub struct IdentityRegistry {
    storage: SubModule<IdentityRegistryStorage>,
    ownable: SubModule<Ownable>,
    topics: External<ClaimTopicsViewContractRef>,
    issuers: External<TrustedIssuersViewContractRef>,
    /// (wallet, topic, issuer) -> Claim.
    claims: Mapping<ClaimKey, Claim>,
}

#[odra::module]
impl IdentityRegistry {
    /// Initialise with the addresses of the ClaimTopicsRegistry and TrustedIssuersRegistry.
    pub fn init(&mut self, topics_addr: Address, issuers_addr: Address) {
        let caller = self.env().caller();
        self.ownable.init(caller);
        self.topics.set(topics_addr);
        self.issuers.set(issuers_addr);
    }

    /// Owner registers an investor with a country code.
    pub fn register_identity(&mut self, wallet: Address, country: u32) {
        self.ownable.assert_owner(&self.env().caller());
        self.storage.store_identity(wallet, country);
        self.env().emit_event(IdentityRegistered {
            wallet,
            country,
            caller: self.env().caller(),
        });
    }

    /// Owner removes an investor (e.g. sanctions hit — the agent triggers this).
    pub fn delete_identity(&mut self, wallet: &Address) {
        self.ownable.assert_owner(&self.env().caller());
        self.storage.delete_identity(wallet);
        self.env().emit_event(IdentityRemoved {
            wallet: *wallet,
            caller: self.env().caller(),
        });
    }

    /// A trusted issuer (the AI agent) adds a signed claim for (wallet, topic).
    /// The signature must verify against `claim_digest(topic, data)` and recover to `issuer`.
    pub fn add_claim(
        &mut self,
        wallet: Address,
        topic: u32,
        data: Bytes,
        issuer: Address,
        issuer_pk: PublicKey,
        signature: Bytes,
        uri: String,
    ) {
        let caller = self.env().caller();
        if caller != issuer {
            // The issuer must be the caller (or the owner on behalf, in a relay model).
            self.ownable.assert_owner(&caller);
        }
        let digest = Self::claim_digest(&wallet, topic, &data);
        let msg = Bytes::from(digest.to_vec());
        if !self.env().verify_signature(&msg, &signature, &issuer_pk) {
            self.env().revert(IrError::InvalidSignature);
        }
        if Address::from(issuer_pk) != issuer {
            self.env().revert(IrError::InvalidSignature);
        }
        self.claims.set(
            &ClaimKey {
                wallet,
                topic,
                issuer,
            },
            Claim {
                topic,
                data,
                issuer,
                signature,
                revoked: false,
                uri,
            },
        );
        self.env().emit_event(ClaimAdded {
            wallet,
            topic,
            issuer,
        });
    }

    /// Revoke a claim (issuer or owner).
    pub fn revoke_claim(&mut self, wallet: Address, topic: u32, issuer: Address) {
        let caller = self.env().caller();
        if caller != issuer {
            self.ownable.assert_owner(&caller);
        }
        let key = ClaimKey {
            wallet,
            topic,
            issuer,
        };
        let mut c = self
            .claims
            .get(&key)
            .unwrap_or_revert_with(self, IrError::ClaimNotFound);
        if c.revoked {
            self.env().revert(IrError::AlreadyRevoked);
        }
        c.revoked = true;
        self.claims.set(&key, c);
        self.env().emit_event(ClaimRevoked {
            wallet,
            topic,
            issuer,
        });
    }

    /// ERC-3643 `isVerified`: every required topic has a non-revoked claim by a
    /// trusted issuer for this wallet.
    pub fn is_verified(&self, wallet: &Address) -> bool {
        if !self.storage.is_registered(wallet) {
            self.env().emit_event(IdentityVerified {
                wallet: *wallet,
                verified: false,
            });
            return false;
        }
        let topics = self.topics.get_claim_topics();
        let trusted_issuers = self.issuers.list_trusted_issuers();

        for topic in topics {
            let mut topic_satisfied = false;
            for issuer in &trusted_issuers {
                if self.issuers.is_trusted_issuer(issuer, topic)
                    && self.has_claim(wallet, topic, *issuer)
                {
                    topic_satisfied = true;
                    break;
                }
            }
            if !topic_satisfied {
                self.env().emit_event(IdentityVerified {
                    wallet: *wallet,
                    verified: false,
                });
                return false;
            }
        }

        self.env().emit_event(IdentityVerified {
            wallet: *wallet,
            verified: true,
        });
        true
    }

    pub fn has_claim(&self, wallet: &Address, topic: u32, issuer: Address) -> bool {
        self.claims
            .get(&ClaimKey {
                wallet: *wallet,
                topic,
                issuer,
            })
            .map(|c| !c.revoked)
            .unwrap_or(false)
    }

    pub fn get_country(&self, wallet: &Address) -> u32 {
        self.storage.get_country(wallet)
    }

    pub fn is_registered(&self, wallet: &Address) -> bool {
        self.storage.is_registered(wallet)
    }

    pub fn list_investors(&self) -> Vec<Address> {
        self.storage.list_investors()
    }
}

impl IdentityRegistry {
    /// keccak256(wallet || topic_be || data) — claim digest the issuer signs.
    /// The wallet is bound into the digest so a signature issued for one investor cannot be
    /// replayed to verify a different wallet (cross-investor claim-replay protection).
    fn claim_digest(wallet: &Address, topic: u32, data: &Bytes) -> [u8; 32] {
        use sha3::{Digest, Keccak256};
        let mut h = Keccak256::default();
        h.update(wallet.to_bytes().unwrap_or_default());
        h.update(topic.to_be_bytes());
        h.update(data);
        let out = h.finalize();
        let mut r = [0u8; 32];
        r.copy_from_slice(&out);
        r
    }
}
