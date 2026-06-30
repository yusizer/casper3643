/**
 * Casper Wallet connection — uses the Casper Wallet browser extension provider
 * (window.casperwallet) directly. The CSPR.click SDK is not on npm, so the dashboard
 * talks to the wallet provider the CSPR.click skill documents: requestConnection,
 * getActivePublicKey, sign.
 *
 * NOTE: the connected public key is used for read-only identity / display in the
 * dashboard. Write actions (mint, register_identity, record_verdict) are built and signed
 * server-side by the orchestrator key via the agent backend (/api/*), NOT by the browser
 * wallet — the Casper Wallet extension's `sign()` is message-signing, not deploy-signing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    casperwallet?: CasperWalletProvider;
  }
}

export interface CasperWalletProvider {
  requestConnection(): Promise<boolean>;
  disconnectFromActiveProvider(): Promise<void>;
  getActivePublicKey(): Promise<string>;
  isConnected(): Promise<boolean>;
  sign(message: string, publicKey?: string): Promise<string>;
}

export function onReady(cb: () => void): () => void {
  // Casper Wallet injects the provider on load; poll briefly if not yet present.
  let tries = 0;
  const id = setInterval(() => {
    tries += 1;
    if (window.casperwallet || tries > 20) {
      clearInterval(id);
      cb();
    }
  }, 100);
  return () => clearInterval(id);
}

export async function connectWallet(): Promise<string | null> {
  const provider = window.casperwallet;
  if (!provider) {
    alert("Install the Casper Wallet browser extension to connect.");
    return null;
  }
  try {
    const ok = await provider.requestConnection();
    if (!ok) return null;
    return await provider.getActivePublicKey();
  } catch (e) {
    console.error("wallet connect failed", e);
    return null;
  }
}

export async function activeAccount(): Promise<{ public_key: string; address: string } | null> {
  const provider = window.casperwallet;
  if (!provider) return null;
  try {
    const connected = await provider.isConnected();
    if (!connected) return null;
    const public_key = await provider.getActivePublicKey();
    return { public_key, address: public_key };
  } catch {
    return null;
  }
}

export function getProvider(): CasperWalletProvider | null {
  return window.casperwallet ?? null;
}
