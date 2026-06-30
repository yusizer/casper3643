//! ModularCompliance — ERC-3643 `Compliance` engine.
//!
//! `can_transfer` AND-reduces every bound policy module; `transferred` notifies them after
//! a transfer. Odra does not support a dynamic list of external-contract refs in storage,
//! so the prototype binds the two policy modules (CountryAllowlist + MaxHolding) as typed
//! `External` fields set by the owner. This preserves the ERC-3643 modular-compliance
//! behaviour (pluggable policies, AND-reduction, post-transfer hooks) for the demo.

use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::access::Ownable;

use crate::compliance::country_allowlist::CountryAllowlistContractRef;
use crate::compliance::max_holding::MaxHoldingContractRef;

#[odra::event]
pub struct CountryModuleBound {
    pub module: Address,
    pub caller: Address,
}

#[odra::event]
pub struct MaxHoldingModuleBound {
    pub module: Address,
    pub caller: Address,
}

#[odra::event]
pub struct ComplianceCheck {
    pub from: Address,
    pub to: Address,
    pub amount: U256,
    pub ok: bool,
}

#[odra::odra_error]
pub enum McError {
    NotOwner = 500,
    TransferNotAllowed = 502,
}

/// Pluggable compliance engine with two bound policy modules.
#[odra::module(events = [CountryModuleBound, MaxHoldingModuleBound, ComplianceCheck], errors = McError, name = "ModularCompliance", version = "1.0.0")]
pub struct ModularCompliance {
    ownable: SubModule<Ownable>,
    country: External<CountryAllowlistContractRef>,
    country_bound: Var<bool>,
    max_holding: External<MaxHoldingContractRef>,
    max_holding_bound: Var<bool>,
}

#[odra::module]
impl ModularCompliance {
    pub fn init(&mut self) {
        let caller = self.env().caller();
        self.ownable.init(caller);
    }

    /// Owner binds the CountryAllowlist module.
    pub fn bind_country_module(&mut self, module_addr: Address) {
        self.assert_owner();
        self.country.set(module_addr);
        self.country_bound.set(true);
        self.env().emit_event(CountryModuleBound {
            module: module_addr,
            caller: self.env().caller(),
        });
    }

    /// Owner binds the MaxHolding module.
    pub fn bind_max_holding_module(&mut self, module_addr: Address) {
        self.assert_owner();
        self.max_holding.set(module_addr);
        self.max_holding_bound.set(true);
        self.env().emit_event(MaxHoldingModuleBound {
            module: module_addr,
            caller: self.env().caller(),
        });
    }

    /// AND-reduction of every bound module's `can_transfer`. Called by the SecurityToken
    /// before moving funds.
    pub fn can_transfer(&self, from: &Address, to: &Address, amount: &U256) -> bool {
        let country_on = self.country_bound.get_or_default();
        let max_holding_on = self.max_holding_bound.get_or_default();
        let mut ok = true;
        if country_on {
            ok = ok && self.country.can_transfer(from, to, amount);
        }
        if max_holding_on {
            ok = ok && self.max_holding.can_transfer(from, to, amount);
        }
        self.env().emit_event(ComplianceCheck {
            from: *from,
            to: *to,
            amount: *amount,
            ok,
        });
        ok
    }

    /// Post-transfer notification to every bound module.
    pub fn transferred(&mut self, from: &Address, to: &Address, amount: &U256) {
        let country_on = self.country_bound.get_or_default();
        let max_holding_on = self.max_holding_bound.get_or_default();
        if country_on {
            self.country.transferred(from, to, amount);
        }
        if max_holding_on {
            self.max_holding.transferred(from, to, amount);
        }
    }

    /// Enumerable list of bound module names (off-chain audit / UI).
    pub fn list_modules(&self) -> Vec<String> {
        let mut out = Vec::new();
        if self.country_bound.get_or_default() {
            out.push("CountryAllowlist".to_string());
        }
        if self.max_holding_bound.get_or_default() {
            out.push("MaxHolding".to_string());
        }
        out
    }
}

impl ModularCompliance {
    fn assert_owner(&self) {
        self.ownable.assert_owner(&self.env().caller());
    }
}
