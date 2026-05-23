"""
Address clustering — identifies wallets likely controlled by the same entity.

Three clustering signals:
  1. Common funder       — same wallet sent the first ETH to multiple addresses
  2. Same-timing         — wallets that transact within minutes of each other repeatedly
  3. Gas wallet pattern  — same address topped up gas for multiple wallets
"""

from collections import defaultdict
from db.database import get_conn


def find_common_funder(addresses: list[str], chain: str) -> dict[str, list[str]]:
    """
    Common funder = likely same entity controlling multiple wallets.

    Returns a dict mapping funder_address → [list of funded addresses]
    where the funder funded >= 2 of the input addresses.
    """
    conn    = get_conn()
    funders: dict[str, list[str]] = defaultdict(list)

    for addr in addresses:
        rows = conn.execute("""
            SELECT DISTINCT from_address FROM address_flows
            WHERE to_address = ?
              AND chain = ?
              AND token IN ('ETH', 'MATIC', 'BNB', 'ETH_internal')
        """, [addr.lower(), chain]).fetchall()

        for (funder,) in rows:
            funders[funder].append(addr)

    conn.close()
    return {f: w for f, w in funders.items() if len(w) >= 2}


def find_same_timing_wallets(
    addresses: list[str],
    chain: str,
    window_minutes: int = 5,
    min_occurrences: int = 3,
) -> list[dict]:
    """
    Wallets that transact within `window_minutes` of each other on
    `min_occurrences`+ occasions are likely run by the same operator.
    """
    conn     = get_conn()
    clusters = []

    for i, addr1 in enumerate(addresses):
        for addr2 in addresses[i + 1:]:
            row = conn.execute("""
                SELECT COUNT(*)
                FROM address_flows a
                JOIN address_flows b
                  ON ABS(EPOCH(a.block_time) - EPOCH(b.block_time)) < ?
                WHERE a.from_address = ?
                  AND b.from_address = ?
                  AND a.chain = ?
            """, [window_minutes * 60, addr1.lower(), addr2.lower(), chain]).fetchone()

            if row and row[0] >= min_occurrences:
                clusters.append({
                    "address_1":         addr1,
                    "address_2":         addr2,
                    "shared_timing_txs": row[0],
                    "reason": (
                        f"Transact within {window_minutes}min of each other "
                        f"{row[0]} times"
                    ),
                })

    conn.close()
    return clusters


def cluster_by_gas_wallet(addresses: list[str], chain: str) -> dict[str, list[str]]:
    """
    Wallets with the same first-ever ETH funder share an operator gas wallet.
    Returns funder → [list of addresses it first funded].
    """
    conn        = get_conn()
    gas_funders: dict[str, str] = {}

    for addr in addresses:
        row = conn.execute("""
            SELECT from_address FROM address_flows
            WHERE to_address = ?
              AND chain = ?
              AND token IN ('ETH', 'MATIC', 'BNB')
            ORDER BY block_time ASC
            LIMIT 1
        """, [addr.lower(), chain]).fetchone()
        if row:
            gas_funders[addr] = row[0]

    conn.close()

    funder_groups: dict[str, list[str]] = defaultdict(list)
    for addr, funder in gas_funders.items():
        funder_groups[funder].append(addr)

    return {f: w for f, w in funder_groups.items() if len(w) >= 2}


def run_all_clustering(addresses: list[str], chain: str) -> dict:
    """
    Run all three clustering heuristics and return combined results.
    """
    return {
        "common_funder":  find_common_funder(addresses, chain),
        "same_timing":    find_same_timing_wallets(addresses, chain),
        "gas_wallet":     cluster_by_gas_wallet(addresses, chain),
    }
