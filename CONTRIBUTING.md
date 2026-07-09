# Contributing

Thanks for your interest in improving Casper3643.

## Project layout

- `src/`: Odra/Rust contracts for the ERC-3643 suite, attestation registry, and agent reputation
- `agent/`: TypeScript agent backend, x402 data-feed server, orchestrator, and demo scripts
- `web/`: React dashboard for wallet connection, token issuance, quorum runs, and attestations
- `docs/`: judge-facing walkthroughs, video scripts, and demo evidence
- `scripts/`: deployment, wiring, optimization, and helper scripts

## Local setup

### Contracts

Use the Docker builder described in `README.md`:

```bash
docker build -t casper3643-builder .
docker run --rm -v "$PWD":/workspace -w /workspace casper3643-builder cargo odra test
```

### Agent layer

```bash
cd agent
npm install
npm run typecheck
```

### Web dashboard

```bash
cd web
npm install
npm run build
```

## Pull request guidance

- Keep changes scoped and explain the user-facing or protocol-facing impact
- Update `README.md` or `docs/` when behavior or test steps change
- Do not commit secrets, key material, or populated `.env` files
- Include verification notes in the pull request description

## Reporting issues

For bugs, please include:

- What you were trying to do
- The exact command or page involved
- The observed output or error
- Whether the issue affects contracts, the agent layer, the dashboard, or deployment docs
