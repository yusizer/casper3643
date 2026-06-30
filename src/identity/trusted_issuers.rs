//! TrustedIssuersRegistry — the set of claim issuers trusted to sign claims for each
//! topic, for a given token. ERC-3643 `TrustedIssuersRegistry`.
//!
//! A claim in an investor's ONCHAINID only counts toward `isVerified` if it is signed by
//! an issuer registered here for the relevant topic. This is the bridge that lets the AI
//! compliance agent act as a Trusted Issuer: register the agent's on-chain address here,
//! and its signed KYC/AML claims become authoritative.

use odra::prelude::*;
use odra_modules::access::Ownable;

/// Topics a single trusted issuer is authorised to sign claims for.
#[odra::odra_type]
pub struct IssuerTopics {
    pub topics: Vec<u32>,
}

#[odra::event]
pub struct TrustedIssuerAdded {
    pub issuer: Address,
    pub topics: Vec<u32>,
    pub caller: Address,
}

#[odra::event]
pub struct TrustedIssuerRemoved {
    pub issuer: Address,
    pub caller: Address,
}

#[odra::odra_error]
pub enum TirError {
    /// Issuer already trusted.
    AlreadyTrusted = 310,
    /// Issuer not trusted.
    NotTrusted = 311,
    /// Caller is not the owner.
    NotOwner = 312,
}

/// Registry of trusted claim issuers per topic.
#[odra::module(events = [TrustedIssuerAdded, TrustedIssuerRemoved], errors = TirError, name = "TrustedIssuersRegistry", version = "1.0.0")]
pub struct TrustedIssuersRegistry {
    ownable: SubModule<Ownable>,
    /// issuer -> topics they may sign claims for.
    issuer_topics: Mapping<Address, IssuerTopics>,
    /// issuer -> trusted flag (fast lookup).
    trusted: Mapping<Address, bool>,
    /// list of all trusted issuers (iterable).
    issuers_list: List<Address>,
}

#[odra::module]
impl TrustedIssuersRegistry {
    /// Initialise with the deployer as owner.
    pub fn init(&mut self) {
        let caller = self.env().caller();
        self.ownable.init(caller);
    }

    /// Owner registers a trusted issuer for a set of topics.
    pub fn add_trusted_issuer(&mut self, issuer: Address, topics: Vec<u32>) {
        self.assert_owner();
        if self.trusted.get_or_default(&issuer) {
            self.env().revert(TirError::AlreadyTrusted);
        }
        self.trusted.set(&issuer, true);
        self.issuer_topics.set(&issuer, IssuerTopics { topics: topics.clone() });
        self.issuers_list.push(issuer);
        self.env().emit_event(TrustedIssuerAdded {
            issuer,
            topics,
            caller: self.env().caller(),
        });
    }

    /// Owner removes a trusted issuer entirely.
    pub fn remove_trusted_issuer(&mut self, issuer: Address) {
        self.assert_owner();
        if !self.trusted.get_or_default(&issuer) {
            self.env().revert(TirError::NotTrusted);
        }
        self.trusted.set(&issuer, false);
        self.issuer_topics.set(&issuer, IssuerTopics { topics: Vec::new() });
        self.env().emit_event(TrustedIssuerRemoved {
            issuer,
            caller: self.env().caller(),
        });
    }

    /// Whether `issuer` is trusted to sign claims for `topic`.
    pub fn is_trusted_issuer(&self, issuer: &Address, topic: u32) -> bool {
        if !self.trusted.get_or_default(issuer) {
            return false;
        }
        self.issuer_topics
            .get(issuer)
            .map(|it| it.topics.contains(&topic))
            .unwrap_or(false)
    }

    /// Whether an address is trusted at all.
    pub fn is_trusted(&self, issuer: &Address) -> bool {
        self.trusted.get_or_default(issuer)
    }

    /// The topics an issuer is trusted for.
    pub fn get_issuer_topics(&self, issuer: &Address) -> Vec<u32> {
        self.issuer_topics
            .get(issuer)
            .map(|it| it.topics)
            .unwrap_or_default()
    }

    /// All trusted issuers (for the isVerified loop and off-chain audit).
    pub fn list_trusted_issuers(&self) -> Vec<Address> {
        self.issuers_list
            .iter()
            .filter(|a| self.trusted.get_or_default(a))
            .collect()
    }
}

impl TrustedIssuersRegistry {
    fn assert_owner(&self) {
        self.ownable.assert_owner(&self.env().caller());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef, NoArgs};

    #[test]
    fn add_issuer_and_check_topics() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let issuer = env.get_account(1);
        let mut registry = TrustedIssuersRegistry::deploy(&env, NoArgs);
        env.set_caller(owner);
        registry.add_trusted_issuer(issuer, vec![1, 4]);
        assert!(registry.is_trusted_issuer(&issuer, 1));
        assert!(registry.is_trusted_issuer(&issuer, 4));
        assert!(!registry.is_trusted_issuer(&issuer, 7));
        assert_eq!(registry.get_issuer_topics(&issuer), vec![1, 4]);
    }

    #[test]
    fn remove_issuer() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let issuer = env.get_account(1);
        let mut registry = TrustedIssuersRegistry::deploy(&env, NoArgs);
        env.set_caller(owner);
        registry.add_trusted_issuer(issuer, vec![1]);
        registry.remove_trusted_issuer(issuer);
        assert!(!registry.is_trusted(&issuer));
        assert!(!registry.is_trusted_issuer(&issuer, 1));
    }

    #[test]
    fn non_owner_cannot_add() {
        let env = odra_test::env();
        let alice = env.get_account(1);
        let bob = env.get_account(2);
        let mut registry = TrustedIssuersRegistry::deploy(&env, NoArgs);
        env.set_caller(alice);
        let res = registry.try_add_trusted_issuer(bob, vec![1]);
        assert!(res.is_err());
    }

    #[test]
    fn cannot_add_duplicate_issuer() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let issuer = env.get_account(1);
        let mut registry = TrustedIssuersRegistry::deploy(&env, NoArgs);
        env.set_caller(owner);
        registry.add_trusted_issuer(issuer, vec![1]);
        let res = registry.try_add_trusted_issuer(issuer, vec![4]);
        assert!(res.is_err());
    }
}
