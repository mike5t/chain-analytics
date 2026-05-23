"""
DuckDB connection and storage helpers.

The database file lives at chain-analytics/data/chain_analytics.duckdb.
All helpers use INSERT OR REPLACE to be idempotent — safe to re-run.
"""

import os
import duckdb
from pathlib import Path

# ── Database path ─────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent.parent
_DB_PATH = _ROOT / "data" / "chain_analytics.duckdb"


def get_conn() -> duckdb.DuckDBPyConnection:
    """Return a connection to the DuckDB database, initialising schema if needed."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(_DB_PATH))
    _init_schema(conn)
    return conn


def _init_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """Run schema.sql once to create all tables."""
    schema_path = Path(__file__).resolve().parent / "schema.sql"
    sql = schema_path.read_text()
    # Execute statement-by-statement (DuckDB doesn't support multi-statement executescript)
    for statement in sql.split(";"):
        stmt = statement.strip()
        if stmt:
            try:
                conn.execute(stmt)
            except Exception:
                pass  # Ignore IF NOT EXISTS false-positives


# ── Storage helpers ───────────────────────────────────────────────────────────

def store_flows(flows: list[dict]) -> int:
    """Upsert a list of flow dicts into address_flows. Returns rows inserted."""
    if not flows:
        return 0
    conn = get_conn()
    count = 0
    for f in flows:
        try:
            conn.execute("""
                INSERT OR REPLACE INTO address_flows
                    (tx_hash, chain, from_address, to_address, token,
                     token_address, amount, block_number, block_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                f["tx_hash"], f["chain"], f["from_address"], f["to_address"],
                f["token"], f["token_address"], f["amount"],
                f["block_number"], f["block_time"],
            ])
            count += 1
        except Exception as e:
            print(f"[db] store_flows warning: {e}")
    conn.close()
    return count


def store_burn(burn: dict) -> None:
    """Upsert a single burn record into the burns table."""
    conn = get_conn()
    try:
        conn.execute("""
            INSERT OR REPLACE INTO burns
                (tx_hash, chain, token, token_address, from_address,
                 amount, block_number, block_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            burn["tx_hash"], burn["chain"], burn["token"],
            burn["token_address"], burn["from_address"], burn["amount"],
            burn["block_number"], burn["block_time"],
        ])
    finally:
        conn.close()


def store_risk_score(result: dict) -> None:
    """Upsert a risk score record."""
    conn = get_conn()
    try:
        conn.execute("""
            INSERT OR REPLACE INTO risk_scores (address, score, flags, scored_at)
            VALUES (?, ?, ?, NOW())
        """, [result["wallet"], result["score"], ", ".join(result.get("flags", []))])
    finally:
        conn.close()


def store_swaps(swaps: list[dict]) -> None:
    """Upsert DeFi swap records."""
    conn = get_conn()
    for s in swaps:
        try:
            conn.execute("""
                INSERT OR REPLACE INTO defi_swaps
                    (tx_hash, chain, wallet, protocol, token_in, token_out,
                     amount_in, amount_out, block_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                s["tx_hash"], s["chain"], s["wallet"], s["protocol"],
                s["token_in"], s["token_out"], s["amount_in"],
                s["amount_out"], s["block_time"],
            ])
        except Exception as e:
            print(f"[db] store_swaps warning: {e}")
    conn.close()


def store_lending(items: list[dict]) -> None:
    """Upsert DeFi lending records."""
    conn = get_conn()
    for item in items:
        try:
            conn.execute("""
                INSERT OR REPLACE INTO defi_lending
                    (tx_hash, chain, wallet, protocol, action, token, amount, block_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                item["tx_hash"], item["chain"], item["wallet"],
                item["protocol"], item["action"], item["token"],
                item["amount"], item["block_time"],
            ])
        except Exception as e:
            print(f"[db] store_lending warning: {e}")
    conn.close()


def store_alchemy_transfers(transfers: list[dict]) -> int:
    """Upsert Alchemy chain-wide transfer records."""
    if not transfers:
        return 0
    conn = get_conn()
    count = 0
    for t in transfers:
        try:
            conn.execute("""
                INSERT OR REPLACE INTO alchemy_transfers
                    (tx_hash, chain, from_address, to_address, asset,
                     value, category, block_num, block_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [t["tx_hash"], t["chain"], t["from_address"], t["to_address"],
                  t["asset"], t["value"], t["category"], t.get("block_num", 0), t["block_time"]])
            count += 1
        except Exception as e:
            print(f"[db] store_alchemy warning: {e}")
    conn.close()
    return count


def query_df(sql: str, params: list | None = None):
    """Run a SQL query and return a pandas DataFrame."""
    conn = get_conn()
    try:
        if params:
            return conn.execute(sql, params).fetchdf()
        return conn.execute(sql).fetchdf()
    finally:
        conn.close()
