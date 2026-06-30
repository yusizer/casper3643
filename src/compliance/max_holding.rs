//! MaxHolding — a stateful compliance module that caps the max token balance any single
//! investor may hold. `transferred` is a no-op here because the cap is checked against
//! the post-transfer balance on the token itself; this module enforces the limit at
//! `can_transfer` time by reading the recipient's current balance from the token view.

use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::access::Ownable;

#[odra::external_contract]
pub trait TokenBalanceView {
    fn balance_of(&self, owner: &Address) -> U256;
}

#[odra::event]
pub struct MaxHoldingSet {
    pub limit: U256,
    pub caller: Address,
}

#[odra::odra_error]
pub enum MhError {
    NotOwner = 520,
    /// Recipient would exceed the max holding cap.
    ExceedsMaxHolding = 521,
}

/// Compliance module: cap on per-investor balance.
#[odra::module(events = [MaxHoldingSet], errors = MhError, name = "MaxHolding", version = "1.0.0")]
pub struct MaxHolding {
    ownable: SubModule<Ownable>,
    token: External<TokenBalanceViewContractRef>,
    limit: Var<U256>,
}

#[odra::module]
impl MaxHolding {
    pub fn init(&mut self, token_addr: Address, limit: U256) {
        let caller = self.env().caller();
        self.ownable.init(caller);
        self.token.set(token_addr);
        self.limit.set(limit);
        self.env().emit_event(MaxHoldingSet {
            limit,
            caller: self.env().caller(),
        });
    }

    pub fn set_limit(&mut self, limit: U256) {
        self.assert_owner();
        self.limit.set(limit);
        self.env().emit_event(MaxHoldingSet {
            limit,
            caller: self.env().caller(),
        });
    }

    pub fn limit(&self) -> U256 {
        self.limit.get_or_default()
    }

    /// ComplianceModule interface: reject if recipient balance + amount > limit.
    pub fn can_transfer(&self, _from: &Address, to: &Address, amount: &U256) -> bool {
        let limit = self.limit.get_or_default();
        if limit == U256::zero() {
            return true;
        }
        let current = self.token.balance_of(to);
        current.checked_add(*amount)
            .map(|after| after <= limit)
            .unwrap_or(false)
    }

    pub fn transferred(&mut self, _from: &Address, _to: &Address, _amount: &U256) {}

    pub fn name(&self) -> String {
        "MaxHolding".to_string()
    }
}

impl MaxHolding {
    fn assert_owner(&self) {
        self.ownable.assert_owner(&self.env().caller());
    }
}
