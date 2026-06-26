import { queryRows } from "../db";
import { KNOWN_ADDRESSES } from "../config";

function getLabel(addr: string): string {
  const cleanAddr = addr.toLowerCase();
  return KNOWN_ADDRESSES[cleanAddr]?.label || addr;
}

export interface TokenVolumeInfo {
  token: string;
  volume: number;
  txs: number;
}

export interface HourlyActivityInfo {
  hour: number;
  txs: number;
}

export interface CounterpartyVolumeInfo {
  address: string;
  raw_address: string;
  total: number;
  txs: number;
}

export interface WalletProfile {
  wallet: string;
  chain: string;
  total_txs: number;
  first_seen: string | null;
  last_seen: string | null;
  wallet_age_days: number | null;
  unique_recipients: number;
  unique_senders: number;
  total_received: number;
  total_sent: number;
  top_tokens: TokenVolumeInfo[];
  hourly_activity: HourlyActivityInfo[];
  top_sent_to: CounterpartyVolumeInfo[];
  top_received_from: CounterpartyVolumeInfo[];
}

export async function profileWallet(wallet: string, chain: string): Promise<WalletProfile> {
  const w = wallet.toLowerCase();

  // 1. Fetch general transaction statistics
  const statsRows = await queryRows(
    `SELECT
        COUNT(*) AS total_txs,
        MIN(block_time) AS first_seen,
        MAX(block_time) AS last_seen,
        COUNT(DISTINCT CASE WHEN from_address = ? THEN to_address END) AS unique_recipients,
        COUNT(DISTINCT CASE WHEN to_address   = ? THEN from_address END) AS unique_senders
     FROM address_flows
     WHERE (from_address = ? OR to_address = ?) AND chain = ?`,
    [w, w, w, w, chain]
  );
  const stats = statsRows[0] || { total_txs: 0, first_seen: null, last_seen: null, unique_recipients: 0, unique_senders: 0 };

  // 2. Fetch top tokens by volume
  const tokenRows = await queryRows(
    `SELECT token, SUM(amount) AS volume, COUNT(*) AS txs
     FROM address_flows
     WHERE from_address = ? AND chain = ?
     GROUP BY token
     ORDER BY volume DESC
     LIMIT 10`,
    [w, chain]
  );

  // 3. Fetch hourly activity distribution using strftime
  const hourlyRows = await queryRows(
    `SELECT CAST(strftime('%H', block_time) AS INTEGER) AS hour, COUNT(*) AS txs
     FROM address_flows
     WHERE from_address = ? AND chain = ?
     GROUP BY hour
     ORDER BY hour`,
    [w, chain]
  );

  // 4. Fetch top recipient counterparties
  const sentToRows = await queryRows(
    `SELECT to_address, SUM(amount) AS total, COUNT(*) AS txs
     FROM address_flows
     WHERE from_address = ? AND chain = ?
     GROUP BY to_address
     ORDER BY total DESC
     LIMIT 10`,
    [w, chain]
  );

  // 5. Fetch top sender counterparties
  const receivedFromRows = await queryRows(
    `SELECT from_address, SUM(amount) AS total, COUNT(*) AS txs
     FROM address_flows
     WHERE to_address = ? AND chain = ?
     GROUP BY from_address
     ORDER BY total DESC
     LIMIT 10`,
    [w, chain]
  );

  // 6. Fetch total volume received vs sent
  const totalsRows = await queryRows(
    `SELECT
        SUM(CASE WHEN to_address   = ? THEN amount ELSE 0 END) AS total_in,
        SUM(CASE WHEN from_address = ? THEN amount ELSE 0 END) AS total_out
     FROM address_flows
     WHERE (from_address = ? OR to_address = ?) AND chain = ?`,
    [w, w, w, w, chain]
  );
  const totals = totalsRows[0] || { total_in: 0, total_out: 0 };

  // Calculate wallet age in days
  const firstSeenStr = stats.first_seen;
  let ageDays: number | null = null;
  if (firstSeenStr) {
    const firstSeenDate = new Date(firstSeenStr);
    const diffMs = Date.now() - firstSeenDate.getTime();
    ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return {
    wallet,
    chain,
    total_txs: stats.total_txs || 0,
    first_seen: firstSeenStr ? String(firstSeenStr) : null,
    last_seen: stats.last_seen ? String(stats.last_seen) : null,
    wallet_age_days: ageDays,
    unique_recipients: stats.unique_recipients || 0,
    unique_senders: stats.unique_senders || 0,
    total_received: Math.round(Number(totals.total_in || 0) * 1000000) / 1000000,
    total_sent: Math.round(Number(totals.total_out || 0) * 1000000) / 1000000,
    top_tokens: tokenRows.map((r: any) => ({
      token: r.token,
      volume: Math.round(Number(r.volume || 0) * 10000) / 10000,
      txs: Number(r.txs),
    })),
    hourly_activity: hourlyRows.map((r: any) => ({
      hour: Number(r.hour),
      txs: Number(r.txs),
    })),
    top_sent_to: sentToRows.map((r: any) => ({
      address: getLabel(r.to_address),
      raw_address: r.to_address,
      total: Math.round(Number(r.total || 0) * 10000) / 10000,
      txs: Number(r.txs),
    })),
    top_received_from: receivedFromRows.map((r: any) => ({
      address: getLabel(r.from_address),
      raw_address: r.from_address,
      total: Math.round(Number(r.total || 0) * 10000) / 10000,
      txs: Number(r.txs),
    })),
  };
}
