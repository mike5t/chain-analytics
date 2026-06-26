import { CHAINS, TOKENS } from "./config";

// Low-level helper to execute a JSON-RPC call via fetch
async function callRpc(chain: string, method: string, params: any[]): Promise<any> {
  const cfg = CHAINS[chain];
  if (!cfg) {
    throw new Error(`Chain not configured: ${chain}`);
  }

  const response = await fetch(cfg.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC call failed on ${chain} with status ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error on ${chain}: ${data.error.message}`);
  }

  return data.result;
}

export async function getNativeBalance(wallet: string, chain: string): Promise<number> {
  try {
    const balanceHex = await callRpc(chain, "eth_getBalance", [wallet, "latest"]);
    // Parse hex wei value
    const wei = BigInt(balanceHex);
    return Number(wei) / 1e18;
  } catch (e) {
    console.error(`[rpc] getNativeBalance error on ${chain} for ${wallet}:`, e);
    throw e;
  }
}

export async function getAllNativeBalances(wallet: string): Promise<Record<string, number | string>> {
  const results: Record<string, number | string> = {};
  for (const chain of Object.keys(CHAINS)) {
    try {
      results[chain] = await getNativeBalance(wallet, chain);
    } catch (e: any) {
      results[chain] = `error: ${e.message}`;
    }
  }
  return results;
}

export async function getTokenBalance(
  wallet: string,
  tokenAddress: string,
  decimals: number,
  chain: string
): Promise<number> {
  try {
    const cleanWallet = wallet.toLowerCase().replace("0x", "").padStart(64, "0");
    const data = "0x70a08231" + cleanWallet; // balanceOf(address)
    const resHex = await callRpc(chain, "eth_call", [
      { to: tokenAddress, data },
      "latest",
    ]);

    if (!resHex || resHex === "0x") return 0.0;
    const rawVal = BigInt(resHex);
    return Number(rawVal) / Math.pow(10, decimals);
  } catch (e) {
    console.warn(`[rpc] getTokenBalance warning on ${chain} for token ${tokenAddress}:`, e);
    return 0.0;
  }
}

export async function getAllTokenBalances(wallet: string, chain: string): Promise<Record<string, number>> {
  const chainTokens = TOKENS[chain];
  if (!chainTokens) return {};

  const results: Record<string, number> = {};
  for (const [symbol, info] of Object.entries(chainTokens)) {
    try {
      results[symbol] = await getTokenBalance(wallet, info.address, info.decimals, chain);
    } catch (e) {
      results[symbol] = 0.0;
    }
  }
  return results;
}

export async function getTokenTotalSupply(
  tokenAddress: string,
  decimals: number,
  chain: string
): Promise<number> {
  try {
    const data = "0x18160ddd"; // totalSupply()
    const resHex = await callRpc(chain, "eth_call", [
      { to: tokenAddress, data },
      "latest",
    ]);

    if (!resHex || resHex === "0x") return 0.0;
    const rawVal = BigInt(resHex);
    return Number(rawVal) / Math.pow(10, decimals);
  } catch (e) {
    console.error(`[rpc] getTokenTotalSupply error on ${chain} for token ${tokenAddress}:`, e);
    return 0.0;
  }
}

export async function getLatestBlock(chain: string): Promise<number> {
  const blockHex = await callRpc(chain, "eth_blockNumber", []);
  return parseInt(blockHex, 16);
}

export async function getBlockTimestamp(blockNumber: number, chain: string): Promise<number> {
  const hexBlock = "0x" + blockNumber.toString(16);
  const block = await callRpc(chain, "eth_getBlockByNumber", [hexBlock, false]);
  if (!block || !block.timestamp) return 0;
  return parseInt(block.timestamp, 16);
}
