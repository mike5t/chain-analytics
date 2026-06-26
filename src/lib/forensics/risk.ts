import { queryRows } from "../db";
import { CEX_ADDRESSES, MIXER_ADDRESSES } from "../config";

async function getLabel(address: string): Promise<{ label: string; category: string } | null> {
  const rows = await queryRows(
    "SELECT label, category FROM address_labels WHERE address = ?",
    [address.toLowerCase()]
  );
  if (rows.length > 0) {
    return { label: rows[0].label, category: rows[0].category };
  }
  return null;
}

async function isSanctioned(address: string): Promise<boolean> {
  const rows = await queryRows(
    "SELECT 1 FROM sanctions WHERE address = ?",
    [address.toLowerCase()]
  );
  return rows.length > 0;
}

export interface LabelFound {
  address: string;
  label: string;
  category: string;
}

export interface RiskScoreResult {
  wallet: string;
  chain: string;
  score: number;
  rating: "HIGH RISK" | "MEDIUM RISK" | "LOW RISK";
  flags: string[];
  labels_found: LabelFound[];
}

export async function scoreWallet(wallet: string, chain: string): Promise<RiskScoreResult> {
  const w = wallet.toLowerCase();
  let score = 0;
  const flags: string[] = [];

  // 1. Direct sanctions hit
  if (await isSanctioned(w)) {
    score += 50;
    flags.push("🚨 SANCTIONED ADDRESS (OFAC SDN list)");
  }

  // 2. Interaction with sanctioned addresses
  const sancHitsRows = await queryRows(
    `SELECT COUNT(*) AS cnt
     FROM address_flows f
     JOIN sanctions s ON (f.to_address = s.address OR f.from_address = s.address)
     WHERE (f.from_address = ? OR f.to_address = ?) AND f.chain = ?`,
    [w, w, chain]
  );
  const sancHits = sancHitsRows[0]?.cnt || 0;
  if (sancHits > 0) {
    score += 40;
    flags.push(`🚨 Interacted with ${sancHits} SANCTIONED address(es)`);
  }

  // 3. Label-based counterparty checks
  const counterpartiesRows = await queryRows(
    `SELECT DISTINCT
         CASE WHEN from_address = ? THEN to_address ELSE from_address END AS counterparty
     FROM address_flows
     WHERE (from_address = ? OR to_address = ?) AND chain = ?`,
    [w, w, w, chain]
  );

  let mixerHits = 0;
  let hackerHits = 0;
  let scamHits = 0;
  let cexHits = 0;
  let defiHits = 0;
  const foundLabels: LabelFound[] = [];

  for (const cpRow of counterpartiesRows) {
    const cp = cpRow.counterparty.toLowerCase();
    const info = await getLabel(cp);
    if (!info) continue;

    foundLabels.push({ address: cp, label: info.label, category: info.category });

    if (info.category === "mixer") {
      mixerHits++;
    } else if (info.category === "hacker") {
      hackerHits++;
    } else if (info.category === "scam") {
      scamHits++;
    } else if (info.category === "cex") {
      cexHits++;
    } else if (["dex", "lending", "staking"].includes(info.category)) {
      defiHits++;
    }
  }

  if (mixerHits > 0) {
    score += 25;
    flags.push(`⚠️ Interacted with ${mixerHits} mixer address(es) (Tornado Cash etc.)`);
  }
  if (mixerHits > 5) {
    score += 15;
    flags.push(`🔴 High mixer exposure — ${mixerHits} interactions`);
  }
  if (hackerHits > 0) {
    score += 35;
    flags.push(`🚨 Interacted with ${hackerHits} known HACKER address(es)`);
  }
  if (scamHits > 0) {
    score += 20;
    flags.push(`⚠️ Interacted with ${scamHits} known SCAM/PHISHING address(es)`);
  }
  if (cexHits > 0) {
    score -= 10;
    flags.push(`✅ Interacted with ${cexHits} known CEX(es) — lower risk signal`);
  }
  if (defiHits > 0) {
    flags.push(`ℹ️ Uses DeFi protocols (${defiHits} known contracts)`);
  }

  // 4. Fallback mixer check (config/known_addresses.py)
  if (mixerHits === 0 && MIXER_ADDRESSES.size > 0) {
    const mixers = Array.from(MIXER_ADDRESSES);
    const placeholders = mixers.map(() => "?").join(",");
    const oldMixerRows = await queryRows(
      `SELECT COUNT(*) AS cnt FROM address_flows
       WHERE (from_address = ? OR to_address = ?)
         AND (to_address IN (${placeholders}) OR from_address IN (${placeholders}))
         AND chain = ?`,
      [w, w, ...mixers, ...mixers, chain]
    );
    const oldMixer = oldMixerRows[0]?.cnt || 0;
    if (oldMixer > 0) {
      score += 20;
      flags.push(`⚠️ Interacted with Tornado Cash / mixer ${oldMixer} time(s)`);
    }
  }

  // 5. Burns
  const burnsRows = await queryRows(
    `SELECT COUNT(*) AS cnt FROM address_flows
     WHERE from_address = ?
       AND to_address = '0x000000000000000000000000000000000000dead'
       AND chain = ?`,
    [w, chain]
  );
  const burns = burnsRows[0]?.cnt || 0;
  if (burns > 0) {
    score += 10;
    flags.push(`Sent to burn address ${burns} time(s)`);
  }

  // 6. CEX funding fallback
  if (cexHits === 0 && CEX_ADDRESSES.size > 0) {
    const cexes = Array.from(CEX_ADDRESSES);
    const placeholders = cexes.map(() => "?").join(",");
    const cexFundedRows = await queryRows(
      `SELECT COUNT(*) AS cnt FROM address_flows
       WHERE to_address = ? AND chain = ?
         AND from_address IN (${placeholders})`,
      [w, chain, ...cexes]
    );
    const cexFunded = cexFundedRows[0]?.cnt || 0;
    if (cexFunded > 0) {
      score -= 10;
      flags.push("✅ Funded from known CEX (lower risk)");
    }
  }

  // 7. No CEX interaction at all
  const totalTxRows = await queryRows(
    `SELECT COUNT(*) AS cnt FROM address_flows
     WHERE (from_address = ? OR to_address = ?) AND chain = ?`,
    [w, w, chain]
  );
  const totalTxs = totalTxRows[0]?.cnt || 0;
  if (totalTxs > 10 && cexHits === 0) {
    score += 10;
    flags.push("ℹ️ No exchange interactions — fully on-chain activity");
  }

  // 8. Wallet age
  const ageRows = await queryRows(
    `SELECT MIN(block_time) AS min_time FROM address_flows
     WHERE (from_address = ? OR to_address = ?) AND chain = ?`,
    [w, w, chain]
  );
  const firstSeenStr = ageRows[0]?.min_time;
  if (firstSeenStr) {
    const firstSeen = new Date(firstSeenStr);
    const ageMs = Date.now() - firstSeen.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays < 30) {
      score += 10;
      flags.push(`⚠️ New wallet — only ${ageDays} days old`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    wallet,
    chain,
    score,
    rating: score >= 60 ? "HIGH RISK" : score >= 30 ? "MEDIUM RISK" : "LOW RISK",
    flags,
    labels_found: foundLabels,
  };
}
