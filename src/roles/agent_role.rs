//! AgentRole — ERC-3643 "agent" access control.
//!
//! ERC-3643 reserves a set of operational functions (forced transfer, freeze, recovery,
//! pause) for "agents" — automated systems that programmatically enforce compliance.
//! This module is the Casper/Odra analogue: a managed list of agent addresses plus an
//! `assert_agent` guard. It is intentionally lighter than `AccessControl` (single role),
//! modelled on `odra_modules::access::ownable::Ownable`.

use odra::prelude::*;

#[odra::event]
pub struct AgentAdded {
    pub agent: Address,
    pub caller: Address,
}

#[odra::event]
pub struct AgentRemoved {
    pub agent: Address,
    pub caller: Address,
}

#[odra::odra_error]
pub enum AgentError {
    /// Caller is not a registered agent.
    NotAgent = 100,
    /// Address is already an agent.
    AlreadyAgent = 101,
    /// Address is not an agent (cannot remove).
    NotAnAgent = 102,
}

/// ERC-3643 AgentRole: a set of agent addresses authorised to run operational
/// (compliance-enforcement) entry points. The deployer becomes the first agent.
#[odra::module(events = [AgentAdded, AgentRemoved], errors = AgentError, name = "AgentRole", version = "1.0.0")]
pub struct AgentRole {
    agents: Mapping<Address, bool>,
    agents_list: List<Address>,
}

#[odra::module]
impl AgentRole {
    /// Initialise with the deployer as the first agent.
    pub fn init(&mut self, agent: Address) {
        self.add_agent_internal(agent, agent);
    }

    /// Add a new agent. Only an existing agent may add another.
    pub fn add_agent(&mut self, agent: Address) {
        let caller = self.env().caller();
        self.assert_agent(&caller);
        self.add_agent_internal(caller, agent);
    }

    /// Remove an agent. Only an existing agent may remove another.
    pub fn remove_agent(&mut self, agent: Address) {
        let caller = self.env().caller();
        self.assert_agent(&caller);
        if !self.is_agent(&agent) {
            self.env().revert(AgentError::NotAnAgent);
        }
        self.agents.set(&agent, false);
        self.env().emit_event(AgentRemoved {
            agent,
            caller,
        });
    }

    /// Read-only membership check.
    pub fn is_agent(&self, agent: &Address) -> bool {
        self.agents.get_or_default(agent)
    }

    /// Enumerable list of agent addresses (for off-chain audit / UI). Filters out agents
    /// that have been removed (the list is append-only; membership is the source of truth).
    pub fn list_agents(&self) -> Vec<Address> {
        self.agents_list.iter().filter(|a| self.is_agent(a)).collect()
    }
}

impl AgentRole {
    /// Revert if the given address is not a registered agent.
    /// Analogue of `Ownable::assert_owner`.
    pub fn assert_agent(&self, addr: &Address) {
        if !self.is_agent(addr) {
            self.env().revert(AgentError::NotAgent);
        }
    }

    fn add_agent_internal(&mut self, caller: Address, agent: Address) {
        if self.agents.get_or_default(&agent) {
            self.env().revert(AgentError::AlreadyAgent);
        }
        self.agents.set(&agent, true);
        self.agents_list.push(agent);
        self.env().emit_event(AgentAdded {
            agent,
            caller,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostRef, NoArgs};

    #[test]
    fn deployer_is_first_agent() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let mut agent = AgentRole::deploy(&env, AgentRoleInitArgs { agent: owner });
        env.set_caller(owner);
        assert!(agent.is_agent(&owner));
        assert_eq!(agent.list_agents(), vec![owner]);
    }

    #[test]
    fn agent_can_add_another_agent() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let alice = env.get_account(1);
        let mut agent = AgentRole::deploy(&env, AgentRoleInitArgs { agent: owner });
        env.set_caller(owner);
        agent.add_agent(alice);
        assert!(agent.is_agent(&alice));
        assert_eq!(agent.list_agents(), vec![owner, alice]);
    }

    #[test]
    fn non_agent_cannot_add() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let alice = env.get_account(1);
        let bob = env.get_account(2);
        let mut agent = AgentRole::deploy(&env, AgentRoleInitArgs { agent: owner });
        // alice is not an agent yet
        env.set_caller(alice);
        let res = agent.try_add_agent(bob);
        assert!(res.is_err(), "non-agent must not be able to add an agent");
        env.set_caller(owner);
        assert!(!agent.is_agent(&bob));
    }

    #[test]
    fn remove_agent_works() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let alice = env.get_account(1);
        let mut agent = AgentRole::deploy(&env, AgentRoleInitArgs { agent: owner });
        env.set_caller(owner);
        agent.add_agent(alice);
        agent.remove_agent(alice);
        assert!(!agent.is_agent(&alice));
    }

    #[test]
    fn cannot_add_duplicate_agent() {
        let env = odra_test::env();
        let owner = env.get_account(0);
        let mut agent = AgentRole::deploy(&env, AgentRoleInitArgs { agent: owner });
        env.set_caller(owner);
        let res = agent.try_add_agent(owner);
        assert!(res.is_err(), "duplicate agent must be rejected");
    }
}
