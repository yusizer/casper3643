/**
 * x402 client: a specialist agent pays per-request for a data feed on Casper testnet.
 *
 * Flow (from make-software/casper-x402):
 *   agent -> GET paid endpoint -> 402 + PaymentRequirements
 *   agent signs EIP-712 TransferWithAuthorization (casper-eip-712, casper-js-sdk key)
 *   agent retries with PAYMENT-SIGNATURE header -> facilitator /verify + /settle
 *   facilitator submits transfer_with_authorization on the WCSPR CEP-18 contract (gas paid
 *   by the facilitator, not the agent) -> 200 OK + PAYMENT-RESPONSE (Casper deploy hash)
 *
 * The deploy hash is the proof-of-payment we anchor on-chain in the attestation.
 */

import { config } from "dotenv";
config();

import casperSdk from "casper-js-sdk";
const { KeyAlgorithm } = casperSdk;

// These packages ship with make-software/casper-x402 and @casper-ecosystem/casper-eip-712.
// The exact import paths follow the reference client in js/examples/client/index.ts.
// @ts-ignore — types may not ship for the x402 packages yet.
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
// @ts-ignore
import { createClientCasperSigner } from "@make-software/casper-x402";
// @ts-ignore
import { ExactCasperScheme } from "@make-software/casper-x402/exact/client";

export interface PaidCallResult {
  data: unknown;
  paymentTxHash?: string;
  payer?: string;
  network?: string;
}

/**
 * Pay for a single data-feed call and return the data + the on-chain payment tx hash.
 *
 * @param keyPath  PEM path for THIS specialist agent (isolation: one key per agent).
 * @param endpoint Full URL, e.g. http://localhost:4021/sanctions?addr=0xABC
 */
export async function paidCall(keyPath: string, endpoint: string): Promise<PaidCallResult> {
  const algo =
    process.env.AGENT_KEY_ALGO === "secp256k1"
      ? KeyAlgorithm.SECP256K1
      : KeyAlgorithm.ED25519;

  const signer = await createClientCasperSigner(keyPath, algo);

  // Register the Casper exact-payment scheme for the whole casper:* CAIP-2 family.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new x402Client(((_v: unknown, opts: unknown[]) => opts[0]) as any).register(
    "casper:*",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (ExactCasperScheme as any)(signer),
  );

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // 1) Request -> 402 -> sign -> retry with PAYMENT-SIGNATURE -> settle -> 200
  const res = await fetchWithPayment(endpoint, { method: "GET" });
  const text = await res.text();
  if (process.env.X402_DEBUG === "1") {
    console.error(`[x402] ${endpoint} -> status=${res.status} bodyLen=${text.length} head=${text.slice(0, 240)}`);
  }
  // A 402 here means the paid data was not delivered (e.g. settlement failed due to
  // insufficient WCSPR balance, or the facilitator /settle was rejected). We still pull the
  // payment tx hash from the PAYMENT-RESPONSE header below (settle may have happened on-chain
  // even when the resource response is 402), so the attestation can carry proof-of-payment;
  // the empty body is passed through and the LLM's safety-first prompt yields VERIFY_FURTHER.
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  // 2) Pull the on-chain settle tx hash out of the response headers (for attestation).
  const payResp = new x402HTTPClient(client).getPaymentSettleResponse(
    (name: string) => res.headers.get(name),
  );

  return {
    data,
    paymentTxHash: payResp?.transaction,
    payer: payResp?.payer,
    network: payResp?.network,
  };
}
