"""
Flashbots API — MEV bundle lookup and sandwich attack detection.

Uses the public Flashbots blocks API (no auth required).
"""

import httpx

FLASHBOTS_API = "https://blocks.flashbots.net/v1"


async def get_mev_bundles(block_number: int) -> list[dict]:
    """Return all MEV bundles included in a block."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{FLASHBOTS_API}/blocks",
            params={"block_number": block_number},
        )
    return r.json().get("blocks", [])


async def check_wallet_mev(wallet: str, blocks: list[int]) -> list[dict]:
    """
    Check if a wallet appears in any Flashbots bundles across the given blocks.
    Returns a list of MEV findings.
    """
    wallet = wallet.lower()
    findings = []
    for block in blocks:
        try:
            bundles = await get_mev_bundles(block)
        except Exception as e:
            print(f"[flashbots] block {block} error: {e}")
            continue

        for bundle in bundles:
            for tx in bundle.get("transactions", []):
                if (
                    tx.get("from", "").lower() == wallet
                    or tx.get("to", "").lower() == wallet
                ):
                    findings.append({
                        "block":          block,
                        "bundle_type":    bundle.get("type"),
                        "miner_reward":   bundle.get("miner_reward"),
                        "coin_base_transfer": bundle.get("coinbase_transfer"),
                        "tx_hash":        tx.get("transaction_hash"),
                        "gas_used":       tx.get("gas_used"),
                    })
    return findings


def detect_sandwich(flows: list[dict], target_tx: str) -> dict | None:
    """
    Heuristic sandwich detection:  if two other txs in the same block trade
    the same token as target_tx, it may be a sandwich attack.

    Returns a finding dict or None.
    """
    target = next((f for f in flows if f["tx_hash"] == target_tx), None)
    if not target:
        return None

    block      = target["block_number"]
    token      = target["token"]
    same_block = [
        f for f in flows
        if f["block_number"] == block
        and f["token"] == token
        and f["tx_hash"] != target_tx
    ]

    if len(same_block) >= 2:
        return {
            "target_tx":       target_tx,
            "block":           block,
            "token":           token,
            "likely_sandwich": True,
            "surrounding_txs": [f["tx_hash"] for f in same_block],
            "note":            "Two or more same-token txs in the same block around target",
        }
    return None


async def get_mev_searcher_activity(searcher_address: str, limit: int = 10) -> list[dict]:
    """Return recent blocks where a known searcher address participated."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{FLASHBOTS_API}/bundles",
            params={"eoa_address": searcher_address, "limit": limit},
        )
    return r.json().get("bundles", [])
