# Final Round Checklist

Use this list before the Casper Agentic Buildathon final-round review.

## GitHub repository settings

These items must be configured in the GitHub UI, not just in the codebase:

- Repository visibility: `Public`
- Description: `ERC-3643 permissioned token suite + multi-agent Verifiable AI compliance quorum on Casper`
- Website: add your DoraHacks BUIDL URL or demo URL
- Topics:
  - `casper-blockchain`
  - `casper-network`
  - `buildathon`
  - `erc-3643`
  - `rwa`
  - `agentic-ai`
  - `odra`
  - `verifiable-ai`

## GitHub security settings

- Enable CodeQL alerts
- Enable Dependabot alerts
- Enable Dependabot security updates
- Confirm CI workflows are green
- Confirm secret scanning is enabled if available on your plan

## DoraHacks BUIDL page

Make sure the BUIDL page includes:

- A short MVP description focused on what is live today
- Contract package hashes from `deploy_hashes.sh`
- At least one attestation tx hash and several sample payment tx hashes
- A concise test plan copied from `README.md` / `docs/demo-walkthrough.md`
- A demo video link
- Honest limitations, phrased clearly but confidently

## Repo artifacts now present

- `README.md` with architecture, test steps, and testnet proof
- `LICENSE`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/gitleaks.yml`
