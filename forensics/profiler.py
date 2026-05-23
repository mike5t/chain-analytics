"""
Wallet profiler — builds a rich behavioural profile of an address.

Queries DuckDB for stats, token usage patterns, hourly activity,
and top counterparties. Annotates addresses with known labels.
"""

from datetime import datetime
from db.database import get_conn
from config.known_addresses import KNOWN_ADDRESSES


def _label(addr: str) -> str:
    """Return a human-readable label for an address, or the address itself."""
    return KNOWN_ADDRESSES.get(addr.lower(), {}).get("label", addr)


def profile_wallet(wallet: str, chain: str) -> dict:
    """
    Build a comprehensive profile of a wallet on a chain.

    Returns a dict with:
        - wallet age, tx counts, unique counterparties
        - top tokens by volume
        - hourly activity distribution
        - top senders and recipients (with labels)
    """
    conn = get_conn()
    w    = wallet.lower()

    stats = conn.execute("""
        SELECT
            COUNT(*),
            MIN(block_time),
            MAX(block_time),
            COUNT(DISTINCT CASE WHEN from_address = ? THEN to_address END),
            COUNT(DISTINCT CASE WHEN to_address   = ? THEN from_address END)
        FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [w, w, w, w, chain]).fetchone()

    tokens = conn.execute("""
        SELECT token, SUM(amount) AS volume, COUNT(*) AS txs
        FROM address_flows
        WHERE from_address = ? AND chain = ?
        GROUP BY token
        ORDER BY volume DESC
        LIMIT 10
    """, [w, chain]).fetchall()

    hourly = conn.execute("""
        SELECT EXTRACT(HOUR FROM block_time) AS hour, COUNT(*) AS txs
        FROM address_flows
        WHERE from_address = ? AND chain = ?
        GROUP BY hour
        ORDER BY hour
    """, [w, chain]).fetchall()

    top_sent_to = conn.execute("""
        SELECT to_address, SUM(amount) AS total, COUNT(*) AS txs
        FROM address_flows
        WHERE from_address = ? AND chain = ?
        GROUP BY to_address
        ORDER BY total DESC
        LIMIT 10
    """, [w, chain]).fetchall()

    top_received_from = conn.execute("""
        SELECT from_address, SUM(amount) AS total, COUNT(*) AS txs
        FROM address_flows
        WHERE to_address = ? AND chain = ?
        GROUP BY from_address
        ORDER BY total DESC
        LIMIT 10
    """, [w, chain]).fetchall()

    # Volume received vs sent
    totals = conn.execute("""
        SELECT
            SUM(CASE WHEN to_address   = ? THEN amount ELSE 0 END) AS total_in,
            SUM(CASE WHEN from_address = ? THEN amount ELSE 0 END) AS total_out
        FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [w, w, w, w, chain]).fetchone()

    conn.close()

    first_seen = stats[1]
    age_days   = (datetime.now() - first_seen).days if first_seen else None

    return {
        "wallet":             wallet,
        "chain":              chain,
        "total_txs":          stats[0] or 0,
        "first_seen":         str(first_seen) if first_seen else None,
        "last_seen":          str(stats[2]) if stats[2] else None,
        "wallet_age_days":    age_days,
        "unique_recipients":  stats[3] or 0,
        "unique_senders":     stats[4] or 0,
        "total_received":     round(float(totals[0] or 0), 6),
        "total_sent":         round(float(totals[1] or 0), 6),
        "top_tokens": [
            {"token": r[0], "volume": round(float(r[1]), 4), "txs": r[2]}
            for r in tokens
        ],
        "hourly_activity": [
            {"hour": int(r[0]), "txs": r[1]}
            for r in hourly
        ],
        "top_sent_to": [
            {"address": _label(r[0]), "raw_address": r[0], "total": round(float(r[1]), 4), "txs": r[2]}
            for r in top_sent_to
        ],
        "top_received_from": [
            {"address": _label(r[0]), "raw_address": r[0], "total": round(float(r[1]), 4), "txs": r[2]}
            for r in top_received_from
        ],
    }
