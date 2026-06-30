//! CountryAllowlist — a compliance module that allows transfers only between investors
//! whose country is on the allowlist. Reads country from the IdentityRegistry.
//!
//! (u32 country code — Casper's CL types do not include u16.)

use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::access::Ownable;

#[odra::external_contract]
pub trait IdentityRegistryView {
    fn get_country(&self, wallet: &Address) -> u32;
}

#[odra::event]
pub struct CountryAllowed {
    pub country: u32,
    pub caller: Address,
}

#[odra::event]
pub struct CountryDisallowed {
    pub country: u32,
    pub caller: Address,
}

#[odra::odra_error]
pub enum CaError {
    NotOwner = 510,
}

/// Compliance module: per-country allowlist.
#[odra::module(events = [CountryAllowed, CountryDisallowed], errors = CaError, name = "CountryAllowlist", version = "1.0.0")]
pub struct CountryAllowlist {
    ownable: SubModule<Ownable>,
    identity: External<IdentityRegistryViewContractRef>,
    allowed: Mapping<u32, bool>,
}

#[odra::module]
impl CountryAllowlist {
    pub fn init(&mut self, identity_addr: Address) {
        let caller = self.env().caller();
        self.ownable.init(caller);
        self.identity.set(identity_addr);
    }

    pub fn add_country(&mut self, country: u32) {
        self.assert_owner();
        self.allowed.set(&country, true);
        self.env().emit_event(CountryAllowed {
            country,
            caller: self.env().caller(),
        });
    }

    pub fn remove_country(&mut self, country: u32) {
        self.assert_owner();
        self.allowed.set(&country, false);
        self.env().emit_event(CountryDisallowed {
            country,
            caller: self.env().caller(),
        });
    }

    pub fn is_allowed(&self, country: u32) -> bool {
        self.allowed.get_or_default(&country)
    }

    /// Compliance check: both sender and receiver must be in an allowlisted country.
    pub fn can_transfer(&self, from: &Address, to: &Address, _amount: &U256) -> bool {
        let cf = self.identity.get_country(from);
        let ct = self.identity.get_country(to);
        self.allowed.get_or_default(&cf) && self.allowed.get_or_default(&ct)
    }

    pub fn transferred(&mut self, _from: &Address, _to: &Address, _amount: &U256) {}

    pub fn name(&self) -> String {
        "CountryAllowlist".to_string()
    }
}

impl CountryAllowlist {
    fn assert_owner(&self) {
        self.ownable.assert_owner(&self.env().caller());
    }
}
