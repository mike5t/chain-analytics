"""
OFAC sanctions screening.

Downloads the OFAC SDN XML list, extracts ETH addresses,
and stores them in DuckDB for fast local screening.

Run update_sanctions_list() weekly via scripts/update_sanctions.py.
"""

import re
import httpx
from db.database import get_conn

OFAC_URL = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml"

# Regex to extract ETH addresses from the OFAC XML
_ETH_PATTERN = re.compile(
    r"<id:idType>ETH</id:idType>.*?<id:idNumber>(0x[a-fA-F0-9]{40})</id:idNumber>",
    re.DOTALL,
)


async def update_sanctions_list() -> int:
    """
    Download the OFAC SDN list and store all ETH addresses in the DB.
    Returns the number of addresses loaded.
    Run this weekly.
    """
    print("Downloading OFAC SDN list...")
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        r = await client.get(OFAC_URL)
        r.raise_for_status()

    eth_addresses = _ETH_PATTERN.findall(r.text)

    conn = get_conn()
    for addr in eth_addresses:
        conn.execute("""
            INSERT OR REPLACE INTO sanctions (address, name, program, added_date)
            VALUES (?, 'OFAC SDN', 'SDN', CURRENT_DATE)
        """, [addr.lower()])
    conn.close()

    print(f"Sanctions updated: {len(eth_addresses)} ETH addresses loaded")
    return len(eth_addresses)


def is_sanctioned(address: str) -> bool:
    """Return True if the address appears in the local OFAC sanctions list."""
    conn = get_conn()
    row  = conn.execute(
        "SELECT 1 FROM sanctions WHERE address = ?", [address.lower()]
    ).fetchone()
    conn.close()
    return row is not None


def screen_address_list(addresses: list[str]) -> list[dict]:
    """
    Screen a list of addresses against the local OFAC sanctions list.

    Returns only the addresses that ARE sanctioned, with name and program.
    Returns an empty list if none are found.
    """
    conn    = get_conn()
    results = []
    for addr in addresses:
        row = conn.execute(
            "SELECT name, program FROM sanctions WHERE address = ?",
            [addr.lower()],
        ).fetchone()
        if row:
            results.append({
                "address": addr,
                "name":    row[0],
                "program": row[1],
            })
    conn.close()
    return results


def count_sanctioned() -> int:
    """Return the total number of sanctioned addresses in the DB."""
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) FROM sanctions").fetchone()[0]
    conn.close()
    return count
