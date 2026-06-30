//! ERC-3643 modular compliance: a pluggable compliance engine + policy modules.
//!
//! `ModularCompliance` is a registry of policy modules; `can_transfer` ANDs every module's
//! vote, and `transferred` notifies them after a transfer (so stateful modules like
//! MaxHolding can update). `CountryAllowlist` is a worked example module that reads the
//! investor's country from the IdentityRegistry.

pub mod country_allowlist;
pub mod max_holding;
pub mod modular_compliance;

pub use country_allowlist::CountryAllowlist;
pub use max_holding::MaxHolding;
pub use modular_compliance::ModularCompliance;
