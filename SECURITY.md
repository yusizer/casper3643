# Security Policy

## Supported scope

Security reports are welcome for:

- Odra/Rust smart contracts in `src/`
- TypeScript backend and x402 payment flow in `agent/`
- React dashboard and API integration surface in `web/`
- Deployment and wiring scripts that affect Casper Testnet or future mainnet release paths

## Reporting a vulnerability

Please do not open public issues for undisclosed vulnerabilities.

Instead, report security concerns privately with:

- A clear description of the issue
- Impact and affected component
- Reproduction steps or proof of concept
- Any suggested mitigation, if known

If private contact is not available, open a minimal GitHub issue requesting a secure contact
channel without disclosing exploit details.

## Response expectations

The maintainer will aim to:

- Acknowledge the report within 72 hours
- Triage severity and reproduction details
- Ship a fix or mitigation plan as quickly as practical

## Operational notes

- Never commit PEM files, private keys, or populated `.env` files
- Treat package hashes, deploy accounts, and transaction hashes as public evidence, but keep all
  signing material private
