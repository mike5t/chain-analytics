import { investigateAddress, fetchNativeTransfers, fetchInternalTransfers } from "../etherscan";
import { storeFlows, queryRows } from "../db";

export interface HopEdge {
  source: string;
  destination: string;
  chain: string;
  hop_number: number;
  token: string;
  amount: number;
  tx_hash: string;
}

export interface TraceHopsResult {
  start: string;
  chain: string;
  hops: number;
  graph: HopEdge[];
  addresses_found: string[];
}

export async function traceHops(
  startAddress: string,
  chain: string,
  maxHops = 3,
  minAmount = 0.1
): Promise<TraceHopsResult> {
  const visited = new Set<string>();
  const graph: HopEdge[] = [];
  const queue: { address: string; hop: number }[] = [
    { address: startAddress.toLowerCase(), hop: 0 },
  ];

  while (queue.length > 0) {
    const { address, hop } = queue.shift()!;
    if (visited.has(address) || hop >= maxHops) {
      continue;
    }
    visited.add(address);

    console.log(`  Hop ${hop + 1}: investigating ${address}`);
    try {
      const data = await investigateAddress(address, chain);
      const stored = await storeFlows(data.all_flows);
      console.log(`  └─ stored ${stored} flows`);

      for (const flow of data.outflows) {
        if (flow.amount < minAmount) continue;

        const destination = flow.to_address.toLowerCase();
        graph.push({
          source: address,
          destination,
          chain,
          hop_number: hop + 1,
          token: flow.token,
          amount: flow.amount,
          tx_hash: flow.tx_hash,
        });

        if (!visited.has(destination)) {
          queue.push({ address: destination, hop: hop + 1 });
        }
      }
    } catch (e) {
      console.error(`  [hops] error at ${address}:`, e);
    }
  }

  return {
    start: startAddress,
    chain,
    hops: maxHops,
    graph,
    addresses_found: Array.from(visited),
  };
}

export interface SummaryInfo {
  total_received: number;
  tx_count: number;
  tokens: string[];
}

export function summariseHopGraph(graph: HopEdge[]): Record<string, SummaryInfo> {
  const volume: Record<string, number> = {};
  const count: Record<string, number> = {};
  const tokens: Record<string, Set<string>> = {};

  for (const edge of graph) {
    const dest = edge.destination;
    volume[dest] = (volume[dest] || 0) + edge.amount;
    count[dest] = (count[dest] || 0) + 1;
    if (!tokens[dest]) {
      tokens[dest] = new Set<string>();
    }
    tokens[dest].add(edge.token);
  }

  const sortedAddresses = Object.keys(volume).sort((a, b) => volume[b] - volume[a]);

  const summary: Record<string, SummaryInfo> = {};
  for (const addr of sortedAddresses) {
    summary[addr] = {
      total_received: Math.round(volume[addr] * 1000000) / 1000000,
      tx_count: count[addr],
      tokens: Array.from(tokens[addr]),
    };
  }

  return summary;
}

export interface FunderResult {
  wallet: string;
  chain: string;
  funder: string;
  amount: number;
  token: string;
  tx_hash: string;
  block_time: string;
}

export async function getFirstFunder(wallet: string, chain: string): Promise<FunderResult | null> {
  const cleanWallet = wallet.toLowerCase();

  // 1. Try to find in database first
  const rows = await queryRows(
    `SELECT from_address, token, amount, tx_hash, block_time FROM address_flows
     WHERE to_address = ?
       AND chain = ?
       AND (token LIKE '%ETH%' OR token LIKE '%MATIC%' OR token LIKE '%BNB%' OR token LIKE '%AVAX%')
     ORDER BY block_time ASC
     LIMIT 1`,
    [cleanWallet, chain]
  );

  if (rows.length > 0) {
    return {
      wallet: cleanWallet,
      chain,
      funder: rows[0].from_address,
      amount: rows[0].amount,
      token: rows[0].token,
      tx_hash: rows[0].tx_hash,
      block_time: rows[0].block_time,
    };
  }

  // 2. If not found in database, fetch from explorer
  console.log(`[funder] fetching funding history from explorer for ${cleanWallet} on ${chain}`);
  const nativeTransfers = await fetchNativeTransfers(cleanWallet, chain);
  const internalTransfers = await fetchInternalTransfers(cleanWallet, chain);

  const allTransfers = [...nativeTransfers, ...internalTransfers];
  if (allTransfers.length === 0) {
    return null;
  }

  // Save the fetched transfers to database so we cache them
  await storeFlows(allTransfers);

  // Find the first incoming transfer where to_address is cleanWallet
  const incoming = allTransfers
    .filter((t) => t.to_address === cleanWallet)
    .sort((a, b) => new Date(a.block_time).getTime() - new Date(b.block_time).getTime());

  if (incoming.length === 0) {
    return null;
  }

  const first = incoming[0];
  return {
    wallet: cleanWallet,
    chain,
    funder: first.from_address,
    amount: first.amount,
    token: first.token,
    tx_hash: first.tx_hash,
    block_time: first.block_time,
  };
}
