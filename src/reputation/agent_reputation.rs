//! AgentReputation — Brier-score reputation with stake/slash for the Compliance Quorum
//! specialist agents.
//!
//! Brier score is a strictly proper scoring rule: `BS = (1/N)·Σ(p − o)²`, minimised only
//! when the reported probability equals the true probability, so it rewards honest,
//! well-calibrated confidence. When a real-world outcome resolves (asset defaulted?
//! sanctions confirmed?), `resolve` updates each agent's running Brier sum and slashes a
//! percentage of the stake of agents whose confident call was on the wrong side. This is
//! the on-chain analogue of Pantheon's calibrated reputation and the soulbound reputation
//! pattern seen in recent DoraHacks winners.

use odra::casper_types::{U256, U512};
use odra::prelude::*;
use odra_modules::access::Ownable;

/// Per-agent reputation state.
#[odra::odra_type]
#[derive(Default)]
pub struct AgentRep {
    pub correct_count: u32,
    pub total_count: u32,
    /// Sum of (p − o)² in basis points² (p, o in 0..=10000). U256 because u128 is not a Casper CL type.
    pub sum_brier: U256,
    /// Staked CSPR (motes).
    pub stake: U512,
}

/// A pending verdict awaiting real-world resolution.
#[odra::odra_type]
#[derive(Default)]
pub struct PendingVerdict {
    /// Agent's YES-probability in basis points (confidence mapped to the APPROVE side).
    pub p_bps: u32,
    /// Whether the agent's decision was APPROVE.
    pub approve: bool,
}

#[odra::event]
pub struct VerdictLogged {
    pub agent: Address,
    pub subject: String,
    pub approve: bool,
    pub p_bps: u32,
}

#[odra::event]
pub struct ReputationUpdated {
    pub agent: Address,
    pub total: u32,
    pub correct: u32,
    pub avg_brier: u64,
    pub stake: U512,
}

#[odra::event]
pub struct StakeDeposited {
    pub agent: Address,
    pub amount: U512,
}

#[odra::odra_error]
pub enum RepError {
    NotOwner = 800,
    NotFound = 801,
    NoStake = 802,
    InvalidSlashPct = 803,
}

/// Brier-score reputation contract.
#[odra::module(events = [VerdictLogged, ReputationUpdated, StakeDeposited], errors = RepError, name = "AgentReputation", version = "1.0.0")]
pub struct AgentReputation {
    ownable: SubModule<Ownable>,
    reps: Mapping<Address, AgentRep>,
    pending: Mapping<(Address, String), PendingVerdict>,
    /// Slash percentage on a wrong confident call (0..=100).
    slash_pct: Var<u32>,
}

#[odra::module]
impl AgentReputation {
    pub fn init(&mut self, slash_pct: u32) {
        let caller = self.env().caller();
        self.ownable.init(caller);
        // slash_pct is a percentage; bound it to 0..=100 to avoid stake underflow in slash math.
        if slash_pct > 100 {
            self.env().revert(RepError::InvalidSlashPct);
        }
        self.slash_pct.set(slash_pct);
    }

    /// An agent deposits stake (called via a token transfer in a full impl; recorded here).
    pub fn deposit_stake(&mut self, agent: Address, amount: U512) {
        self.ownable.assert_owner(&self.env().caller());
        let mut r = self.reps.get(&agent).unwrap_or_default();
        r.stake = r.stake.checked_add(amount).unwrap_or_revert(self);
        self.reps.set(&agent, r.clone());
        self.env().emit_event(StakeDeposited { agent, amount });
    }

    /// Orchestrator logs a pending verdict for an agent on a subject.
    /// `p_bps` = the agent's confidence (basis points) mapped to the APPROVE side.
    pub fn log_verdict(&mut self, agent: Address, subject: String, approve: bool, p_bps: u32) {
        self.ownable.assert_owner(&self.env().caller());
        self.pending.set(
            &(agent, subject.clone()),
            PendingVerdict {
                p_bps: p_bps.min(10000),
                approve,
            },
        );
        self.env().emit_event(VerdictLogged {
            agent,
            subject,
            approve,
            p_bps: p_bps.min(10000),
        });
    }

    /// Owner (or a resolver oracle in production) resolves the real-world outcome and
    /// updates reputation: Brier always updates; a wrong confident call slashes stake.
    pub fn resolve(&mut self, agent: Address, subject: String, outcome_yes: bool) {
        self.ownable.assert_owner(&self.env().caller());
        let key = (agent, subject.clone());
        let pv = self
            .pending
            .get(&key)
            .unwrap_or_revert_with(self, RepError::NotFound);
        self.pending.set(&key, PendingVerdict::default());

        let p = pv.p_bps as i64;
        let o = if outcome_yes { 10000 } else { 0 };
        let brier = U256::from((p - o).pow(2) as u64);

        let mut r = self.reps.get(&agent).unwrap_or_default();
        r.total_count += 1;
        r.sum_brier = r.sum_brier.saturating_add(brier);

        // "Correct" = the agent's side matched the outcome with confidence >= 50%.
        let correct = (outcome_yes && pv.approve && p >= 5000)
            || (!outcome_yes && !pv.approve && p >= 5000);
        if correct {
            r.correct_count += 1;
        } else if p >= 5000 {
            // Wrong confident call → slash.
            let slash_pct = self.slash_pct.get_or_default();
            if slash_pct > 0 && !r.stake.is_zero() {
                let slash = r.stake * U512::from(slash_pct) / U512::from(100);
                r.stake -= slash;
            }
        }
        let avg_brier = if r.total_count > 0 {
            (r.sum_brier / U256::from(r.total_count)).as_u64()
        } else {
            0
        };
        self.reps.set(&agent, r.clone());
        self.env().emit_event(ReputationUpdated {
            agent,
            total: r.total_count,
            correct: r.correct_count,
            avg_brier,
            stake: r.stake,
        });
    }

    pub fn get_rep(&self, agent: &Address) -> AgentRep {
        self.reps.get(agent).unwrap_or_default()
    }

    /// Average Brier score (lower is better; 0 = perfect, 10000 = always wrong).
    pub fn brier_score(&self, agent: &Address) -> u64 {
        let r = self.get_rep(agent);
        if r.total_count == 0 {
            0
        } else {
            (r.sum_brier / U256::from(r.total_count)).as_u64()
        }
    }

    /// Skill in basis points: (1 − Brier/25000000) · 10000 (reference = always-p=0.5).
    pub fn skill_bps(&self, agent: &Address) -> i64 {
        let b = self.brier_score(agent) as i64;
        let skill = 10000 - (b * 10000 / 25_000_000);
        skill.max(0).min(10000)
    }

    pub fn slash_pct(&self) -> u32 {
        self.slash_pct.get_or_default()
    }
}
