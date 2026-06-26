import { createClient, Client } from "@libsql/client";
import path from "path";
import fs from "fs";

// Create data directory if it doesn't exist
const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, "chain_analytics.db");

export const client: Client = createClient({
  url: `file:${dbPath}`,
});

let isInitialized = false;

export async function initDb() {
  if (isInitialized) return;

  const schema = `
    CREATE TABLE IF NOT EXISTS wallets (
        address     TEXT PRIMARY KEY,
        label       TEXT,
        flagged     INTEGER DEFAULT 0,
        notes       TEXT,
        added_at    TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS native_balances (
        wallet      TEXT,
        chain       TEXT,
        balance     REAL,
        updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wallet, chain)
    );

    CREATE TABLE IF NOT EXISTS token_balances (
        wallet      TEXT,
        chain       TEXT,
        token       TEXT,
        amount      REAL,
        updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wallet, chain, token)
    );

    CREATE TABLE IF NOT EXISTS address_flows (
        tx_hash         TEXT,
        chain           TEXT,
        from_address    TEXT,
        to_address      TEXT,
        token           TEXT,
        token_address   TEXT,
        amount          REAL,
        block_number    INTEGER,
        block_time      TEXT,
        PRIMARY KEY (tx_hash, chain, token_address)
    );

    CREATE TABLE IF NOT EXISTS burns (
        tx_hash         TEXT,
        chain           TEXT,
        token           TEXT,
        token_address   TEXT,
        from_address    TEXT,
        amount          REAL,
        block_number    INTEGER,
        block_time      TEXT,
        PRIMARY KEY (tx_hash, chain)
    );

    CREATE TABLE IF NOT EXISTS address_labels (
        address     TEXT,
        chain       TEXT,
        label       TEXT,
        category    TEXT,
        PRIMARY KEY (address, chain)
    );

    CREATE TABLE IF NOT EXISTS hop_graph (
        source          TEXT,
        destination     TEXT,
        chain           TEXT,
        hop_number      INTEGER,
        total_amount    REAL,
        token           TEXT,
        tx_count        INTEGER,
        PRIMARY KEY (source, destination, chain, token)
    );

    CREATE TABLE IF NOT EXISTS clusters (
        cluster_id      TEXT,
        address         TEXT,
        chain           TEXT,
        reason          TEXT,
        PRIMARY KEY (cluster_id, address)
    );

    CREATE TABLE IF NOT EXISTS risk_scores (
        address         TEXT PRIMARY KEY,
        score           INTEGER,
        flags           TEXT,
        scored_at       TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sanctions (
        address         TEXT PRIMARY KEY,
        name            TEXT,
        program         TEXT,
        added_date      TEXT
    );

    CREATE TABLE IF NOT EXISTS defi_swaps (
        tx_hash         TEXT,
        chain           TEXT,
        wallet          TEXT,
        protocol        TEXT,
        token_in        TEXT,
        token_out       TEXT,
        amount_in       REAL,
        amount_out      REAL,
        block_time      TEXT,
        PRIMARY KEY (tx_hash, chain)
    );

    CREATE TABLE IF NOT EXISTS defi_lending (
        tx_hash         TEXT,
        chain           TEXT,
        wallet          TEXT,
        protocol        TEXT,
        action          TEXT,
        token           TEXT,
        amount          REAL,
        block_time      TEXT,
        PRIMARY KEY (tx_hash, chain)
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet          TEXT,
        chain           TEXT,
        alert_type      TEXT,
        threshold       REAL,
        active          INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS alerts_fired (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_id         INTEGER,
        wallet          TEXT,
        tx_hash         TEXT,
        message         TEXT,
        fired_at        TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alchemy_transfers (
        tx_hash         TEXT,
        chain           TEXT,
        from_address    TEXT,
        to_address      TEXT,
        asset           TEXT,
        value           REAL,
        category        TEXT,
        block_num       INTEGER,
        block_time      TEXT,
        PRIMARY KEY (tx_hash, chain)
    );
  `;

  // Execute schema creation statements
  // Split by double newline or separate sql block execution since libsql client executes multiple queries when separated by semicolons
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (e) {
      console.warn("[db] initDb warning executing statement:", stmt.substring(0, 50), e);
    }
  }

  isInitialized = true;
}

// Ensure database helper connection executes initDb
export async function getDb(): Promise<Client> {
  await initDb();
  return client;
}

// Helpers mirroring the Python db/database.py structure

export async function storeFlows(flows: any[]): Promise<number> {
  if (!flows || flows.length === 0) return 0;
  const db = await getDb();
  let count = 0;
  for (const f of flows) {
    try {
      // Ensure date format is string
      const blockTimeStr = f.block_time instanceof Date ? f.block_time.toISOString() : f.block_time;
      await db.execute({
        sql: `INSERT OR REPLACE INTO address_flows 
              (tx_hash, chain, from_address, to_address, token, token_address, amount, block_number, block_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          f.tx_hash,
          f.chain,
          f.from_address.toLowerCase(),
          f.to_address ? f.to_address.toLowerCase() : "",
          f.token,
          f.token_address ? f.token_address.toLowerCase() : "",
          Number(f.amount),
          Number(f.block_number),
          blockTimeStr,
        ],
      });
      count++;
    } catch (e) {
      console.error(`[db] storeFlows error: ${e}`, f);
    }
  }
  return count;
}

export async function storeBurn(burn: any): Promise<void> {
  const db = await getDb();
  try {
    const blockTimeStr = burn.block_time instanceof Date ? burn.block_time.toISOString() : burn.block_time;
    await db.execute({
      sql: `INSERT OR REPLACE INTO burns 
            (tx_hash, chain, token, token_address, from_address, amount, block_number, block_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        burn.tx_hash,
        burn.chain,
        burn.token,
        burn.token_address.toLowerCase(),
        burn.from_address.toLowerCase(),
        Number(burn.amount),
        Number(burn.block_number),
        blockTimeStr,
      ],
    });
  } catch (e) {
    console.error(`[db] storeBurn error: ${e}`);
  }
}

export async function storeRiskScore(result: any): Promise<void> {
  const db = await getDb();
  try {
    const flagsStr = Array.isArray(result.flags) ? result.flags.join(", ") : result.flags || "";
    await db.execute({
      sql: `INSERT OR REPLACE INTO risk_scores (address, score, flags, scored_at)
            VALUES (?, ?, ?, datetime('now'))`,
      args: [result.wallet.toLowerCase(), Number(result.score), flagsStr],
    });
  } catch (e) {
    console.error(`[db] storeRiskScore error: ${e}`);
  }
}

export async function storeSwaps(swaps: any[]): Promise<void> {
  const db = await getDb();
  for (const s of swaps) {
    try {
      const blockTimeStr = s.block_time instanceof Date ? s.block_time.toISOString() : s.block_time;
      await db.execute({
        sql: `INSERT OR REPLACE INTO defi_swaps 
              (tx_hash, chain, wallet, protocol, token_in, token_out, amount_in, amount_out, block_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          s.tx_hash,
          s.chain,
          s.wallet.toLowerCase(),
          s.protocol,
          s.token_in,
          s.token_out,
          Number(s.amount_in),
          Number(s.amount_out),
          blockTimeStr,
        ],
      });
    } catch (e) {
      console.error(`[db] storeSwaps error: ${e}`);
    }
  }
}

export async function storeLending(items: any[]): Promise<void> {
  const db = await getDb();
  for (const item of items) {
    try {
      const blockTimeStr = item.block_time instanceof Date ? item.block_time.toISOString() : item.block_time;
      await db.execute({
        sql: `INSERT OR REPLACE INTO defi_lending 
              (tx_hash, chain, wallet, protocol, action, token, amount, block_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          item.tx_hash,
          item.chain,
          item.wallet.toLowerCase(),
          item.protocol,
          item.action,
          item.token,
          Number(item.amount),
          blockTimeStr,
        ],
      });
    } catch (e) {
      console.error(`[db] storeLending error: ${e}`);
    }
  }
}

export async function storeAlchemyTransfers(transfers: any[]): Promise<number> {
  if (!transfers || transfers.length === 0) return 0;
  const db = await getDb();
  let count = 0;
  for (const t of transfers) {
    try {
      const blockTimeStr = t.block_time instanceof Date ? t.block_time.toISOString() : t.block_time;
      await db.execute({
        sql: `INSERT OR REPLACE INTO alchemy_transfers 
              (tx_hash, chain, from_address, to_address, asset, value, category, block_num, block_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          t.tx_hash,
          t.chain,
          t.from_address.toLowerCase(),
          t.to_address ? t.to_address.toLowerCase() : "",
          t.asset,
          Number(t.value),
          t.category,
          Number(t.block_num),
          blockTimeStr,
        ],
      });
      count++;
    } catch (e) {
      console.error(`[db] storeAlchemyTransfers error: ${e}`);
    }
  }
  return count;
}

export async function queryRows(sql: string, params: any[] = []): Promise<any[]> {
  const db = await getDb();
  try {
    const res = await db.execute({ sql, args: params });
    // Convert ResultSet rows to standard array of objects
    return res.rows.map((row: any) => {
      const obj: any = {};
      res.columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (e) {
    console.error(`[db] queryRows error executing: ${sql}`, e);
    throw e;
  }
}
