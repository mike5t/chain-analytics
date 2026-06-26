import { queryRows } from "../db";

export async function findCommonFunder(addresses: string[], chain: string): Promise<Record<string, string[]>> {
  const funders: Record<string, string[]> = {};
  const cleanAddresses = addresses.map((a) => a.toLowerCase());

  for (const addr of cleanAddresses) {
    // Find distinct funders of native tokens (ETH, MATIC, BNB, etc.)
    const rows = await queryRows(
      `SELECT DISTINCT from_address FROM address_flows
       WHERE to_address = ?
         AND chain = ?
         AND token IN ('ETH', 'MATIC', 'BNB', 'ETH_internal', 'MATIC_internal', 'BNB_internal')`,
      [addr, chain]
    );

    for (const row of rows) {
      const funder = row.from_address.toLowerCase();
      if (!funders[funder]) {
        funders[funder] = [];
      }
      funders[funder].push(addr);
    }
  }

  // Filter to only funders that funded at least 2 of the input addresses
  const result: Record<string, string[]> = {};
  for (const [funder, targets] of Object.entries(funders)) {
    if (targets.length >= 2) {
      result[funder] = targets;
    }
  }

  return result;
}

export interface SameTimingCluster {
  address_1: string;
  address_2: string;
  shared_timing_txs: number;
  reason: string;
}

export async function findSameTimingWallets(
  addresses: string[],
  chain: string,
  windowMinutes = 5,
  minOccurrences = 3
): Promise<SameTimingCluster[]> {
  const clusters: SameTimingCluster[] = [];
  const cleanAddresses = addresses.map((a) => a.toLowerCase());

  for (let i = 0; i < cleanAddresses.length; i++) {
    for (let j = i + 1; j < cleanAddresses.length; j++) {
      const addr1 = cleanAddresses[i];
      const addr2 = cleanAddresses[j];

      // Convert ISO strings in database to unix seconds using strftime('%s') and take the absolute difference
      const rows = await queryRows(
        `SELECT COUNT(*) AS cnt
         FROM address_flows a
         JOIN address_flows b
           ON abs(strftime('%s', a.block_time) - strftime('%s', b.block_time)) < ?
         WHERE a.from_address = ?
           AND b.from_address = ?
           AND a.chain = ?`,
        [windowMinutes * 60, addr1, addr2, chain]
      );

      const count = rows[0]?.cnt || 0;
      if (count >= minOccurrences) {
        clusters.push({
          address_1: addr1,
          address_2: addr2,
          shared_timing_txs: count,
          reason: `Transact within ${windowMinutes}min of each other ${count} times`,
        });
      }
    }
  }

  return clusters;
}

export async function clusterByGasWallet(addresses: string[], chain: string): Promise<Record<string, string[]>> {
  const gasFunders: Record<string, string> = {};
  const cleanAddresses = addresses.map((a) => a.toLowerCase());

  for (const addr of cleanAddresses) {
    const rows = await queryRows(
      `SELECT from_address FROM address_flows
       WHERE to_address = ?
         AND chain = ?
         AND token IN ('ETH', 'MATIC', 'BNB')
       ORDER BY block_time ASC
       LIMIT 1`,
      [addr, chain]
    );

    if (rows.length > 0) {
      gasFunders[addr] = rows[0].from_address.toLowerCase();
    }
  }

  const funderGroups: Record<string, string[]> = {};
  for (const [addr, funder] of Object.entries(gasFunders)) {
    if (!funderGroups[funder]) {
      funderGroups[funder] = [];
    }
    funderGroups[funder].push(addr);
  }

  const result: Record<string, string[]> = {};
  for (const [funder, targets] of Object.entries(funderGroups)) {
    if (targets.length >= 2) {
      result[funder] = targets;
    }
  }

  return result;
}

export async function runAllClustering(addresses: string[], chain: string): Promise<any> {
  const common_funder = await findCommonFunder(addresses, chain);
  const same_timing = await findSameTimingWallets(addresses, chain);
  const gas_wallet = await clusterByGasWallet(addresses, chain);

  return {
    common_funder,
    same_timing,
    gas_wallet,
  };
}
