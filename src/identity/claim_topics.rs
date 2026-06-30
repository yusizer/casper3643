//! ClaimTopicsRegistry — the set of claim topics a security token requires from every
//! investor's ONCHAINID (e.g. KYC, AML, accreditation). ERC-3643 `ClaimTopicsRegistry`.
//!
//! Odra `Mapping` is not iterable, so we keep a parallel `List<u32>` of topic ids and a
//! `Mapping<u32, bool>` membership flag (remove = flip flag, consistent with the
//! `module_nesting.rs` counter pattern).

use odra::prelude::*;
use odra_modules::access::Ownable;

#[odra::event]
pub struct ClaimTopicAdded {
    pub topic: u32,
    pub caller: Address,
}

#[odra::event]
pub struct ClaimTopicRemoved {
    pub topic: u32,
    pub caller: Address,
}

#[odra::odra_error]
pub enum CtrError {
    /// Topic already registered.
    AlreadyRegistered = 300,
    /// Topic not registered.
    NotRegistered = 301,
    /// Caller is not the owner.
    NotOwner = 302,
}

/// Registry of required claim topics for a token.
#[odra::module(events = [ClaimTopicAdded, ClaimTopicRemoved], errors = CtrError, name = "ClaimTopicsRegistry", version = "1.0.0")]
pub struct ClaimTopicsRegistry {
    ownable: SubModule<Ownable>,
    active: Mapping<u32, bool>,
    topics_list: List<u32>,
}

#[odra::module]
impl ClaimTopicsRegistry {
    /// Initialise with the deployer as owner and no required topics.
    pub fn init(&mut self) {
        let caller = self.env().caller();
        self.ownable.init(caller);
    }

    /// Owner adds a required claim topic (e.g. 1 = KYC).
    pub fn add_claim_topic(&mut self, topic: u32) {
        self.assert_owner();
        if self.active.get_or_default(&topic) {
            self.env().revert(CtrError::AlreadyRegistered);
        }
        self.active.set(&topic, true);
        self.topics_list.push(topic);
        self.env().emit_event(ClaimTopicAdded {
            topic,
            caller: self.env().caller(),
        });
    }

    /// Owner removes a required claim topic (flips the active flag).
    pub fn remove_claim_topic(&mut self, topic: u32) {
        self.assert_owner();
        if !self.active.get_or_default(&topic) {
            self.env().revert(CtrError::NotRegistered);
        }
        self.active.set(&topic, false);
        self.env().emit_event(ClaimTopicRemoved {
            topic,
            caller: self.env().caller(),
        });
    }

    /// The list of currently required topics (off-chain / UI / isVerified loop).
    pub fn get_claim_topics(&self) -> Vec<u32> {
        self.topics_list
            .iter()
            .filter(|t| self.active.get_or_default(t))
            .collect()
    }

    /// Whether a topic is currently required.
    pub fn is_topic_required(&self, topic: u32) -> bool {
        self.active.get_or_default(&topic)
    }
}

impl ClaimTopicsRegistry {
    fn assert_owner(&self) {
        self.ownable.assert_owner(&self.env().caller());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef, NoArgs};

    #[test]
    fn add_and_list_topics() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let mut registry = ClaimTopicsRegistry::deploy(&env, NoArgs);
        env.set_caller(owner);
        registry.add_claim_topic(1); // KYC
        registry.add_claim_topic(4); // AML
        assert_eq!(registry.get_claim_topics(), vec![1, 4]);
        assert!(registry.is_topic_required(1));
    }

    #[test]
    fn remove_topic_flips_flag() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let mut registry = ClaimTopicsRegistry::deploy(&env, NoArgs);
        env.set_caller(owner);
        registry.add_claim_topic(1);
        registry.remove_claim_topic(1);
        assert!(!registry.is_topic_required(1));
        assert!(registry.get_claim_topics().is_empty());
    }

    #[test]
    fn non_owner_cannot_add() {
        let env = odra_test::env();
        let alice = env.get_account(1);
        let mut registry = ClaimTopicsRegistry::deploy(&env, NoArgs);
        env.set_caller(alice);
        let res = registry.try_add_claim_topic(1);
        assert!(res.is_err());
    }

    #[test]
    fn cannot_add_duplicate() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let mut registry = ClaimTopicsRegistry::deploy(&env, NoArgs);
        env.set_caller(owner);
        registry.add_claim_topic(1);
        let res = registry.try_add_claim_topic(1);
        assert!(res.is_err());
    }
}
