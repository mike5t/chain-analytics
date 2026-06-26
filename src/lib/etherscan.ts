import { CHAINS, BURN_ADDRESS } from "./config";
import { queryRows } from "./db";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple semaphore / lock to enforce 300ms gap between Etherscan V2 calls
let lastV2CallTime = 0;
async function throttleV2() {
  const now = Date.now();
  const diff = now - lastV2CallTime;
  if (diff < 350) {
    await sleep(350 - diff);
  }
  lastV2CallTime = Date.now();
}

async function fetchExplorer(url: string, params: Record<string, string>): Promise<any> {
  const queryStr = new URLSearchParams(params).toString();
  const fullUrl = `${url}?${queryStr}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(fullUrl, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Explorer returned HTTP status ${response.status}`);
      }
      return await response.json();
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(Math.pow(1.5, attempt) * 1000);
    }
  }
}

function buildParams(cfg: any, base: Record<string, string>): Record<string, string> {
  const params = { ...base };
  if (cfg.explorer_v2) {
    params["chainid"] = String(cfg.chain_id);
  }
  if (cfg.explorer_key) {
    params["apikey"] = cfg.explorer_key;
  }
  return params;
}

export interface FlowRecord {
  tx_hash: string;
  chain: string;
  from_address: string;
  to_address: string;
  token: string;
  token_address: string;
  amount: number;
  block_number: number;
  block_time: string;
}

export interface InvestigationResult {
  wallet: string;
  chain: string;
  all_flows: FlowRecord[];
  inflows: FlowRecord[];
  outflows: FlowRecord[];
  burns: FlowRecord[];
  nfts: FlowRecord[];
}

export async function fetchTokenTransfers(wallet: string, chain: string): Promise<FlowRecord[]> {
  const cfg = CHAINS[chain];
  if (!cfg || !cfg.explorer_supported) return [];

  if (cfg.explorer_v2) await throttleV2();

  try {
    const data = await fetchExplorer(
      cfg.explorer,
      buildParams(cfg, {
        module: "account",
        action: "tokentx",
        address: wallet,
        sort: "asc",
      })
    );

    if (data.status !== "1" || !Array.isArray(data.result)) {
      return [];
    }

    return data.result.map((tx: any) => {
      const decimals = parseInt(tx.tokenDecimal || "18");
      return {
        tx_hash: tx.hash,
        chain,
        from_address: tx.from.toLowerCase(),
        to_address: tx.to.toLowerCase(),
        token: tx.tokenSymbol,
        token_address: tx.contractAddress.toLowerCase(),
        amount: parseInt(tx.value) / Math.pow(10, decimals),
        block_number: parseInt(tx.blockNumber),
        block_time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      };
    });
  } catch (e) {
    console.error(`[etherscan] fetchTokenTransfers error on ${chain}:`, e);
    return [];
  }
}

export async function fetchNativeTransfers(wallet: string, chain: string): Promise<FlowRecord[]> {
  const cfg = CHAINS[chain];
  if (!cfg || !cfg.explorer_supported) return [];

  if (cfg.explorer_v2) await throttleV2();

  try {
    const data = await fetchExplorer(
      cfg.explorer,
      buildParams(cfg, {
        module: "account",
        action: "txlist",
        address: wallet,
        sort: "asc",
      })
    );

    if (data.status !== "1" || !Array.isArray(data.result)) {
      return [];
    }

    const flows: FlowRecord[] = [];
    for (const tx of data.result) {
      const valueEth = parseInt(tx.value) / 1e18;
      if (valueEth === 0) continue;

      flows.push({
        tx_hash: tx.hash,
        chain,
        from_address: tx.from.toLowerCase(),
        to_address: tx.to ? tx.to.toLowerCase() : "",
        token: cfg.native,
        token_address: "native",
        amount: valueEth,
        block_number: parseInt(tx.blockNumber),
        block_time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      });
    }
    return flows;
  } catch (e) {
    console.error(`[etherscan] fetchNativeTransfers error on ${chain}:`, e);
    return [];
  }
}

export async function fetchInternalTransfers(wallet: string, chain: string): Promise<FlowRecord[]> {
  const cfg = CHAINS[chain];
  if (!cfg || !cfg.explorer_supported) return [];

  if (cfg.explorer_v2) await throttleV2();

  try {
    const data = await fetchExplorer(
      cfg.explorer,
      buildParams(cfg, {
        module: "account",
        action: "txlistinternal",
        address: wallet,
        sort: "asc",
      })
    );

    if (data.status !== "1" || !Array.isArray(data.result)) {
      return [];
    }

    const flows: FlowRecord[] = [];
    for (const tx of data.result) {
      const valueEth = parseInt(tx.value || "0") / 1e18;
      if (valueEth === 0) continue;

      flows.push({
        tx_hash: tx.hash,
        chain,
        from_address: tx.from.toLowerCase(),
        to_address: tx.to.toLowerCase(),
        token: `${cfg.native}_internal`,
        token_address: "native_internal",
        amount: valueEth,
        block_number: parseInt(tx.blockNumber),
        block_time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      });
    }
    return flows;
  } catch (e) {
    console.error(`[etherscan] fetchInternalTransfers error on ${chain}:`, e);
    return [];
  }
}

export async function fetchNftTransfers(wallet: string, chain: string): Promise<FlowRecord[]> {
  const cfg = CHAINS[chain];
  if (!cfg || !cfg.explorer_supported) return [];

  if (cfg.explorer_v2) await throttleV2();

  try {
    const data = await fetchExplorer(
      cfg.explorer,
      buildParams(cfg, {
        module: "account",
        action: "tokennfttx",
        address: wallet,
        sort: "asc",
      })
    );

    if (data.status !== "1" || !Array.isArray(data.result)) {
      return [];
    }

    return data.result.map((tx: any) => ({
      tx_hash: tx.hash,
      chain,
      from_address: tx.from.toLowerCase(),
      to_address: tx.to.toLowerCase(),
      token: `${tx.tokenName || "NFT"} #${tx.tokenID || "?"} [${tx.tokenSymbol || ""}]`,
      token_address: tx.contractAddress.toLowerCase(),
      amount: 1.0,
      block_number: parseInt(tx.blockNumber),
      block_time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
    }));
  } catch (e) {
    // Some networks/explorers do not support token nft endpoint
    return [];
  }
}

export async function investigateAddress(wallet: string, chain: string): Promise<InvestigationResult> {
  const cleanWallet = wallet.toLowerCase();
  const burnAddr = BURN_ADDRESS.toLowerCase();

  // Try to query the database cache first
  try {
    const cachedFlows = await queryRows(
      `SELECT tx_hash, chain, from_address, to_address, token, token_address, amount, block_number, block_time 
       FROM address_flows 
       WHERE (from_address = ? OR to_address = ?) AND chain = ?`,
      [cleanWallet, cleanWallet, chain]
    );

    if (cachedFlows && cachedFlows.length > 0) {
      const flows: FlowRecord[] = cachedFlows.map((row: any) => ({
        tx_hash: row.tx_hash,
        chain: row.chain,
        from_address: row.from_address.toLowerCase(),
        to_address: row.to_address ? row.to_address.toLowerCase() : "",
        token: row.token,
        token_address: row.token_address ? row.token_address.toLowerCase() : "",
        amount: Number(row.amount),
        block_number: Number(row.block_number),
        block_time: row.block_time,
      }));

      const tokenFlows = flows.filter((f) => f.token_address !== "native" && f.token_address !== "native_internal");
      const nftFlows = flows.filter((f) => f.token.includes("#"));

      return {
        wallet: cleanWallet,
        chain,
        all_flows: flows,
        inflows: flows.filter((f) => f.to_address === cleanWallet),
        outflows: flows.filter((f) => f.from_address === cleanWallet),
        burns: tokenFlows.filter((f) => f.to_address === burnAddr),
        nfts: nftFlows,
      };
    }
  } catch (e) {
    console.warn(`[etherscan] failed to query database cache for ${cleanWallet}:`, e);
  }

  // Run in parallel if not found in database cache
  const [tokenFlows, nativeFlows, nftFlows] = await Promise.all([
    fetchTokenTransfers(cleanWallet, chain),
    fetchNativeTransfers(cleanWallet, chain),
    fetchNftTransfers(cleanWallet, chain),
  ]);

  const all_flows = [...tokenFlows, ...nativeFlows, ...nftFlows];

  return {
    wallet: cleanWallet,
    chain,
    all_flows,
    inflows: all_flows.filter((f) => f.to_address === cleanWallet),
    outflows: all_flows.filter((f) => f.from_address === cleanWallet),
    burns: tokenFlows.filter((f) => f.to_address === burnAddr),
    nfts: nftFlows,
  };
}

export async function investigateAllChains(wallet: string): Promise<{ wallet: string; chains: Record<string, InvestigationResult> }> {
  const supported = Object.keys(CHAINS).filter((c) => CHAINS[c].explorer_supported);
  const v2Chains = supported.filter((c) => CHAINS[c].explorer_v2);
  const otherChains = supported.filter((c) => !CHAINS[c].explorer_v2);

  const combined: Record<string, InvestigationResult> = {};

  const runChain = async (chain: string, delay = 0) => {
    if (delay) await sleep(delay);
    try {
      combined[chain] = await investigateAddress(wallet, chain);
    } catch (e) {
      console.error(`[etherscan] investigateAllChains ${chain} error:`, e);
    }
  };

  // Stagger Etherscan V2 chains to avoid rate limits
  const v2Promises = v2Chains.map((c, i) => runChain(c, i * 600));
  // Run other chains in parallel
  const otherPromises = otherChains.map((c) => runChain(c));

  await Promise.all([...v2Promises, ...otherPromises]);

  return {
    wallet,
    chains: combined,
  };
}
