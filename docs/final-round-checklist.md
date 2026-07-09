# Final Round Checklist

Use this list before the Casper Agentic Buildathon final-round review.

## GitHub repository settings

- [x] Repository visibility: `Public`
- [x] Description set
- [x] Website: DoraHacks BUIDL URL
- [x] Topics: `casper-blockchain`, `casper-network`, `buildathon`, `erc-3643`, `rwa`, `agentic-ai`, `odra`, `verifiable-ai`

## GitHub security settings

- [x] CodeQL workflow added
- [x] Dependabot alerts enabled
- [x] Dependabot security updates enabled
- [x] Secret scan workflow added
- [ ] Confirm CI workflow is green on `master`

## DoraHacks BUIDL page

Copy from `docs/dorahacks-buidl-page.md` into the existing BUIDL page. Do **not** change the already-published demo video link.

- [ ] Short MVP description
- [ ] Contract package hashes from `deploy_hashes.sh`
- [ ] Sample attestation + payment tx hashes
- [ ] Concise test plan
- [x] Demo video already published on BUIDL
- [ ] Honest limitations

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
