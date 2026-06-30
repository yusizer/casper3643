//! SecurityToken — the ERC-3643 `Token` contract, implemented as an Odra composite over
//! the ready-made `Cep18` (CEP-18 = Casper's ERC-20 equivalent in `odra_modules`).
//!
//! `transfer`/`transfer_from` are NOT delegated to Cep18: they are overridden to enforce
//! the ERC-3643 gate — `!paused && !frozen[from] && isVerified(from) && isVerified(to) &&
//! compliance.canTransfer(...)`. `mint`/`burn` are owner-only and also gated. Agent-only
//! operational functions (`forced_transfer`, `freeze`, `unfreeze`, `pause`, `unpause`)
//! let the AI compliance agent enforce compliance autonomously (EIP-3643 "agent" role).

use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::access::Ownable;
use odra_modules::cep18_token::Cep18;
use odra_modules::security::Pauseable;

use crate::compliance::modular_compliance::{ModularCompliance, ModularComplianceContractRef};
use crate::roles::agent_role::AgentRole;

#[odra::external_contract]
pub trait IdentityRegistryInterface {
    fn is_verified(&self, wallet: &Address) -> bool;
}

#[odra::event]
pub struct Transfer {
    pub from: Option<Address>,
    pub to: Option<Address>,
    pub amount: U256,
}

#[odra::event]
pub struct Frozen {
    pub wallet: Address,
    pub caller: Address,
}

#[odra::event]
pub struct Unfrozen {
    pub wallet: Address,
    pub caller: Address,
}

#[odra::event]
pub struct ForcedTransfer {
    pub from: Address,
    pub to: Address,
    pub amount: U256,
    pub caller: Address,
}

#[odra::odra_error]
pub enum StError {
    Frozen = 600,
    NotVerified = 601,
    TransferNotAllowed = 602,
    NotAgent = 603,
    NotOwner = 604,
    Paused = 605,
    InsufficientBalance = 606,
    InsufficientAllowance = 607,
}

/// ERC-3643 SecurityToken over Cep18.
#[odra::module(events = [Transfer, Frozen, Unfrozen, ForcedTransfer], errors = StError, name = "SecurityToken", version = "1.0.0")]
pub struct SecurityToken {
    token: SubModule<Cep18>,
    ownable: SubModule<Ownable>,
    pauseable: SubModule<Pauseable>,
    agent_role: SubModule<AgentRole>,
    identity: External<IdentityRegistryInterfaceContractRef>,
    compliance: External<ModularComplianceContractRef>,
    frozen: Mapping<Address, bool>,
}

#[odra::module]
impl SecurityToken {
    /// Initialise the token and link the identity registry + compliance engine.
    /// The deployer becomes owner and the first agent.
    pub fn init(
        &mut self,
        symbol: String,
        name: String,
        decimals: u8,
        initial_supply: U256,
        identity_addr: Address,
        compliance_addr: Address,
    ) {
        let caller = self.env().caller();
        self.ownable.init(caller);
        self.agent_role.init(caller);
        self.identity.set(identity_addr);
        self.compliance.set(compliance_addr);
        self.token.init(symbol, name, decimals, initial_supply);
    }

    /// ERC-20 transfer with the full ERC-3643 compliance gate.
    pub fn transfer(&mut self, to: &Address, amount: &U256) {
        self.pauseable.require_not_paused();
        let from = self.env().caller();
        if self.frozen.get_or_default(&from) {
            self.env().revert(StError::Frozen);
        }
        self.assert_can_transfer(&from, to, amount);
        self.token.raw_transfer(&from, to, amount);
        self.compliance.transferred(&from, to, amount);
        self.env().emit_event(Transfer {
            from: Some(from),
            to: Some(*to),
            amount: *amount,
        });
    }

    /// ERC-20 transferFrom with the compliance gate + allowance burn.
    pub fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256) {
        self.pauseable.require_not_paused();
        if self.frozen.get_or_default(owner) {
            self.env().revert(StError::Frozen);
        }
        self.assert_can_transfer(owner, recipient, amount);
        let spender = self.env().caller();
        let allow = self.token.allowance(owner, &spender);
        let remaining = allow
            .checked_sub(*amount)
            .unwrap_or_revert_with(self, StError::InsufficientAllowance);
        self.token.raw_approve(owner, &spender, &remaining);
        self.token.raw_transfer(owner, recipient, amount);
        self.compliance.transferred(owner, recipient, amount);
        self.env().emit_event(Transfer {
            from: Some(*owner),
            to: Some(*recipient),
            amount: *amount,
        });
    }

    /// Owner mints to a verified recipient. Mint is a transfer from the zero/mint source,
    /// NOT from the minter's identity, so the compliance country check on the source is
    /// skipped (the owner need not be a registered investor to mint). The recipient must
    /// still be verified.
    pub fn mint(&mut self, to: &Address, amount: &U256) {
        let caller = self.env().caller();
        self.ownable.assert_owner(&caller);
        self.pauseable.require_not_paused();
        if !self.identity.is_verified(to) {
            self.env().revert(StError::NotVerified);
        }
        self.token.raw_mint(to, amount);
        self.env().emit_event(Transfer {
            from: None,
            to: Some(*to),
            amount: *amount,
        });
    }

    /// Owner burns from a wallet.
    pub fn burn(&mut self, from: &Address, amount: &U256) {
        self.ownable.assert_owner(&self.env().caller());
        self.token.raw_burn(from, amount);
    }

    // -- Agent-only operational functions (autonomous compliance enforcement) --

    /// Agent forces a transfer (ignores frozen, still passes compliance).
    pub fn forced_transfer(&mut self, from: &Address, to: &Address, amount: &U256) {
        self.agent_role.assert_agent(&self.env().caller());
        if !self.compliance.can_transfer(from, to, amount) {
            self.env().revert(StError::TransferNotAllowed);
        }
        self.token.raw_transfer(from, to, amount);
        self.compliance.transferred(from, to, amount);
        self.env().emit_event(ForcedTransfer {
            from: *from,
            to: *to,
            amount: *amount,
            caller: self.env().caller(),
        });
    }

    /// Agent freezes a wallet (e.g. sanctions hit detected off-chain).
    pub fn freeze(&mut self, wallet: &Address) {
        self.agent_role.assert_agent(&self.env().caller());
        self.frozen.set(wallet, true);
        self.env().emit_event(Frozen {
            wallet: *wallet,
            caller: self.env().caller(),
        });
    }

    /// Agent unfreezes a wallet.
    pub fn unfreeze(&mut self, wallet: &Address) {
        self.agent_role.assert_agent(&self.env().caller());
        self.frozen.set(wallet, false);
        self.env().emit_event(Unfrozen {
            wallet: *wallet,
            caller: self.env().caller(),
        });
    }

    /// Agent pauses all transfers (emergency).
    pub fn pause(&mut self) {
        self.agent_role.assert_agent(&self.env().caller());
        self.pauseable.pause();
    }

    /// Agent unpauses.
    pub fn unpause(&mut self) {
        self.agent_role.assert_agent(&self.env().caller());
        self.pauseable.unpause();
    }

    /// Owner adds an agent.
    pub fn add_agent(&mut self, agent: Address) {
        self.ownable.assert_owner(&self.env().caller());
        self.agent_role.add_agent(agent);
    }

    /// Owner removes an agent (revoke agent-only privileges, e.g. a compromised key).
    pub fn remove_agent(&mut self, agent: Address) {
        self.ownable.assert_owner(&self.env().caller());
        self.agent_role.remove_agent(agent);
    }

    pub fn is_frozen(&self, wallet: &Address) -> bool {
        self.frozen.get_or_default(wallet)
    }

    pub fn is_verified(&self, wallet: &Address) -> bool {
        self.identity.is_verified(wallet)
    }

    // -- Forwarded Cep18 read-only + approve entry points (NOT transfer) --

    delegate! {
        to self.token {
            fn name(&self) -> String;
            fn symbol(&self) -> String;
            fn decimals(&self) -> u8;
            fn total_supply(&self) -> U256;
            fn balance_of(&self, owner: &Address) -> U256;
            fn allowance(&self, owner: &Address, spender: &Address) -> U256;
            fn approve(&mut self, spender: &Address, amount: &U256);
        }
    }

    delegate! {
        to self.ownable {
            fn get_owner(&self) -> Address;
            fn transfer_ownership(&mut self, new_owner: &Address);
        }
    }

    delegate! {
        to self.pauseable {
            fn is_paused(&self) -> bool;
        }
    }

    delegate! {
        to self.agent_role {
            fn is_agent(&self, agent: &Address) -> bool;
            fn list_agents(&self) -> Vec<Address>;
        }
    }
}

impl SecurityToken {
    fn assert_can_transfer(&self, from: &Address, to: &Address, amount: &U256) {
        let owner = self.ownable.get_owner();
        // The issuer/owner is exempt from the is_verified(from) gate so they can distribute
        // the initial supply without first registering as an investor. The recipient is still
        // verified and compliance still applies to both sides.
        if (from != &owner && !self.identity.is_verified(from)) || !self.identity.is_verified(to) {
            self.env().revert(StError::NotVerified);
        }
        if !self.compliance.can_transfer(from, to, amount) {
            self.env().revert(StError::TransferNotAllowed);
        }
    }
}
