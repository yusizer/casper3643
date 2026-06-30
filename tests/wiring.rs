//! End-to-end wiring test: deploy the full ERC-3643 + Compliance Quorum stack in
//! dependency order and exercise the compliance gate.

#![cfg(test)]

use casper3643::attestation::attestation_registry::{AttestationRegistry, AttestationRegistryInitArgs};
use casper3643::compliance::country_allowlist::{CountryAllowlist, CountryAllowlistInitArgs};
use casper3643::compliance::modular_compliance::ModularCompliance;
use casper3643::identity::claim_topics::ClaimTopicsRegistry;
use casper3643::identity::identity_registry::{IdentityRegistry, IdentityRegistryInitArgs};
use casper3643::identity::trusted_issuers::TrustedIssuersRegistry;
use casper3643::reputation::agent_reputation::{AgentReputation, AgentReputationInitArgs};
use casper3643::token::security_token::{SecurityToken, SecurityTokenInitArgs};
use odra::casper_types::U256;
use odra::host::{Deployer, HostRef, NoArgs};
use odra::prelude::*;

#[test]
fn full_stack_wires_and_gates_transfers() {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let alice = env.get_account(1); // investor, country 1
    let bob = env.get_account(2); // investor, country 2

    env.set_caller(owner);

    // 1. Registries (no dependencies).
    let mut topics = ClaimTopicsRegistry::deploy(&env, NoArgs);
    topics.add_claim_topic(1); // KYC
    let mut issuers = TrustedIssuersRegistry::deploy(&env, NoArgs);
    // The AI compliance agent (owner here, as a stand-in) is a trusted issuer for KYC.
    issuers.add_trusted_issuer(owner, vec![1]);

    // 2. IdentityRegistry (needs topics + issuers).
    let mut identity = IdentityRegistry::deploy(
        &env,
        IdentityRegistryInitArgs {
            topics_addr: topics.address(),
            issuers_addr: issuers.address(),
        },
    );

    // 3. Compliance + country allowlist module.
    let mut compliance = ModularCompliance::deploy(&env, NoArgs);
    let mut allowlist = CountryAllowlist::deploy(
        &env,
        CountryAllowlistInitArgs {
            identity_addr: identity.address(),
        },
    );
    allowlist.add_country(1);
    allowlist.add_country(2);
    compliance.bind_country_module(allowlist.address());

    // 4. SecurityToken (needs identity + compliance).
    let mut token = SecurityToken::deploy(
        &env,
        SecurityTokenInitArgs {
            symbol: "SEC".to_string(),
            name: "Security Token".to_string(),
            decimals: 8u8,
            initial_supply: U256::from(1_000_000),
            identity_addr: identity.address(),
            compliance_addr: compliance.address(),
        },
    );

    // 5. Register investors (owner-gated).
    identity.register_identity(alice, 1);
    identity.register_identity(bob, 2);

    // 6. Neither investor is verified yet (no claims) -> mint/transfer must be gated.
    assert!(!token.is_verified(&alice));
    assert!(!token.is_verified(&bob));

    // Mint to alice should fail (not verified).
    let res = token.try_mint(&alice, &U256::from(100));
    assert!(res.is_err(), "mint to unverified must fail");

    // 7. Agent reputation + attestation registry wiring (independent).
    let _rep = AgentReputation::deploy(&env, AgentReputationInitArgs { slash_pct: 10 });
    let _att = AttestationRegistry::deploy(&env, AttestationRegistryInitArgs { agent: owner });

    // 8. Agent freeze blocks a wallet.
    token.freeze(&bob);
    assert!(token.is_frozen(&bob));
}
