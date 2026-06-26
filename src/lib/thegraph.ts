const GRAPH_KEY = process.env.GRAPH_KEY || "";

const SUBGRAPHS: Record<string, string> = {
  uniswap_v3: `https://gateway.thegraph.com/api/${GRAPH_KEY}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`,
  aave_v3:    `https://gateway.thegraph.com/api/${GRAPH_KEY}/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnWm89byeSo`,
};

async function graphql(subgraph: string, query: string): Promise<any> {
  const url = SUBGRAPHS[subgraph];
  if (!url) {
    throw new Error(`Subgraph not configured: ${subgraph}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`The Graph query failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`The Graph GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data || {};
}

export interface SwapRecord {
  tx_hash: string;
  chain: string;
  wallet: string;
  protocol: string;
  token_in: string;
  token_out: string;
  amount_in: number;
  amount_out: number;
  amount_usd: number;
  fee_tier: number;
  block_time: string;
}

export interface LendingRecord {
  tx_hash: string;
  chain: string;
  wallet: string;
  protocol: string;
  action: string;
  token: string;
  amount: number;
  block_time: string;
}

export async function getUniswapSwaps(wallet: string, limit = 100): Promise<SwapRecord[]> {
  const query = `
    {
      swaps(
        where: {origin: "${wallet.toLowerCase()}"}
        first: ${limit}
        orderBy: timestamp
        orderDirection: desc
      ) {
        transaction { id }
        timestamp
        token0 { symbol decimals }
        token1 { symbol decimals }
        amount0
        amount1
        amountUSD
        pool { feeTier }
      }
    }
  `;

  try {
    const data = await graphql("uniswap_v3", query);
    if (!data.swaps || !Array.isArray(data.swaps)) return [];

    return data.swaps.map((s: any) => {
      const amount0 = parseFloat(s.amount0);
      const isNegative = amount0 < 0;
      return {
        tx_hash: s.transaction.id,
        chain: "ethereum",
        wallet,
        protocol: "Uniswap V3",
        token_in: isNegative ? s.token0.symbol : s.token1.symbol,
        token_out: isNegative ? s.token1.symbol : s.token0.symbol,
        amount_in: Math.abs(amount0),
        amount_out: Math.abs(parseFloat(s.amount1)),
        amount_usd: parseFloat(s.amountUSD || "0"),
        fee_tier: parseInt(s.pool.feeTier) / 1e6,
        block_time: new Date(parseInt(s.timestamp) * 1000).toISOString(),
      };
    });
  } catch (e) {
    console.error("[thegraph] getUniswapSwaps error:", e);
    return [];
  }
}

export async function getAaveActivity(wallet: string): Promise<LendingRecord[]> {
  const w = wallet.toLowerCase();
  const query = `
    {
      deposits(where: {user: "${w}"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      withdraws(where: {user: "${w}"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      borrows(where: {user: "${w}"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      repays(where: {user: "${w}"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      liquidationCalls(where: {user: "${w}"}, first: 100, orderBy: timestamp, orderDirection: desc) {
        id principalAmount collateralReserve { symbol decimals } timestamp
      }
    }
  `;

  try {
    const data = await graphql("aave_v3", query);
    const items: LendingRecord[] = [];

    const actions = [
      { key: "deposits", action: "deposit" },
      { key: "withdraws", action: "withdraw" },
      { key: "borrows", action: "borrow" },
      { key: "repays", action: "repay" },
    ];

    for (const act of actions) {
      const records = data[act.key];
      if (Array.isArray(records)) {
        for (const tx of records) {
          const decimals = parseInt(tx.reserve?.decimals || "18");
          items.push({
            tx_hash: tx.id.split(":")[0],
            chain: "ethereum",
            wallet,
            protocol: "Aave V3",
            action: act.action,
            token: tx.reserve.symbol,
            amount: parseFloat(tx.amount) / Math.pow(10, decimals),
            block_time: new Date(parseInt(tx.timestamp) * 1000).toISOString(),
          });
        }
      }
    }

    if (Array.isArray(data.liquidationCalls)) {
      for (const liq of data.liquidationCalls) {
        const decimals = parseInt(liq.collateralReserve?.decimals || "18");
        items.push({
          tx_hash: liq.id.split(":")[0],
          chain: "ethereum",
          wallet,
          protocol: "Aave V3",
          action: "liquidated",
          token: liq.collateralReserve.symbol,
          amount: parseFloat(liq.principalAmount) / Math.pow(10, decimals),
          block_time: new Date(parseInt(liq.timestamp) * 1000).toISOString(),
        });
      }
    }

    return items;
  } catch (e) {
    console.error("[thegraph] getAaveActivity error:", e);
    return [];
  }
}

export async function getGlobalSwapStats(minUsd = 10000, limit = 100): Promise<any[]> {
  const query = `
    {
      swaps(
        first: ${limit}
        orderBy: timestamp
        orderDirection: desc
        where: { amountUSD_gte: "${minUsd}" }
      ) {
        transaction { id }
        timestamp
        origin
        token0 { symbol }
        token1 { symbol }
        amount0
        amount1
        amountUSD
      }
    }
  `;

  try {
    const data = await graphql("uniswap_v3", query);
    if (!data.swaps || !Array.isArray(data.swaps)) return [];

    return data.swaps.map((s: any) => {
      const amount0 = parseFloat(s.amount0);
      return {
        tx_hash: s.transaction.id,
        wallet: s.origin,
        token_in: amount0 < 0 ? s.token0.symbol : s.token1.symbol,
        token_out: amount0 < 0 ? s.token1.symbol : s.token0.symbol,
        amount_usd: parseFloat(s.amountUSD),
        block_time: new Date(parseInt(s.timestamp) * 1000).toISOString(),
      };
    });
  } catch (e) {
    console.error("[thegraph] getGlobalSwapStats error:", e);
    return [];
  }
}
