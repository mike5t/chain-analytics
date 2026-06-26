const ALCHEMY_KEY = process.env.ALCHEMY_KEY || "";

const ALCHEMY_RPCS: Record<string, string> = {
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  base:     `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  polygon:  `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
  optimism: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
};

export interface AlchemyTransferRecord {
  tx_hash: string;
  chain: string;
  from_address: string;
  to_address: string;
  asset: string;
  value: number;
  category: string;
  block_num: number;
  block_time: string;
}

export async function getAssetTransfers(
  chain = "ethereum",
  fromAddress?: string,
  toAddress?: string,
  minValue = 0.0,
  category: string[] = ["external", "erc20", "erc721"],
  fromBlock = "0x0",
  toBlock = "latest",
  maxCount = 1000
): Promise<AlchemyTransferRecord[]> {
  const rpcUrl = ALCHEMY_RPCS[chain];
  if (!rpcUrl) {
    throw new Error(`Alchemy not configured or key missing for chain: ${chain}`);
  }

  const params: Record<string, any> = {
    fromBlock,
    toBlock,
    category,
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: "0x" + Math.min(maxCount, 1000).toString(16),
  };

  if (fromAddress) params["fromAddress"] = fromAddress;
  if (toAddress) params["toAddress"] = toAddress;

  const transfers: AlchemyTransferRecord[] = [];
  let pageKey: string | null = null;

  while (true) {
    if (pageKey) {
      params["pageKey"] = pageKey;
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [params],
      }),
    });

    if (!response.ok) {
      throw new Error(`Alchemy API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.result || {};
    const raw = result.transfers || [];

    for (const tx of raw) {
      const value = parseFloat(tx.value || "0.0");
      if (value < minValue) continue;

      const blockTime = tx.metadata?.blockTimestamp
        ? new Date(tx.metadata.blockTimestamp).toISOString()
        : "";

      transfers.push({
        tx_hash: tx.hash || "",
        chain,
        from_address: (tx.from || "").toLowerCase(),
        to_address: (tx.to || "").toLowerCase(),
        asset: tx.asset || "ETH",
        value,
        category: tx.category || "",
        block_num: parseInt(tx.blockNum || "0x0", 16),
        block_time: blockTime,
      });
    }

    pageKey = result.pageKey || null;
    if (!pageKey || transfers.length >= maxCount) {
      break;
    }
  }

  return transfers;
}

export async function countWalletsByThreshold(
  chain = "ethereum",
  minEth = 10.0,
  fromBlock = "0x0",
  toBlock = "latest",
  maxCount = 500
): Promise<{
  transfers: number;
  unique_senders: number;
  unique_receivers: number;
  total_volume: number;
  transfers_raw: AlchemyTransferRecord[];
}> {
  const transfers = await getAssetTransfers(
    chain,
    undefined,
    undefined,
    minEth,
    ["external"],
    fromBlock,
    toBlock,
    maxCount
  );

  const senders = new Set(transfers.map((t) => t.from_address));
  const receivers = new Set(transfers.map((t) => t.to_address));
  const totalVolume = transfers.reduce((acc, t) => acc + t.value, 0);

  return {
    transfers: transfers.length,
    unique_senders: senders.size,
    unique_receivers: receivers.size,
    total_volume: totalVolume,
    transfers_raw: transfers,
  };
}
