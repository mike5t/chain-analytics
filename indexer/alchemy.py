"""
Alchemy API — chain-wide asset transfer queries.
Answers broad questions like "all wallets that sent 10+ ETH this year".
"""

import os
import httpx
import asyncio
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

ALCHEMY_KEY = os.getenv("ALCHEMY_KEY", "")

ALCHEMY_RPCS = {
    "ethereum": f"https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}",
    "base":     f"https://base-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}",
    "arbitrum": f"https://arb-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}",
    "polygon":  f"https://polygon-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}",
    "optimism": f"https://opt-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}",
}


async def get_asset_transfers(
    chain: str = "ethereum",
    from_address: str | None = None,
    to_address: str | None = None,
    min_value: float = 0.0,
    category: list[str] | None = None,
    from_block: str = "0x0",
    to_block: str = "latest",
    max_count: int = 1000,
) -> list[dict]:
    """
    Query asset transfers across the entire chain via Alchemy.
    Can filter by sender, receiver, min value, asset category, block range.
    """
    if chain not in ALCHEMY_RPCS:
        raise ValueError(f"Alchemy not configured for chain: {chain}")

    params: dict = {
        "fromBlock":  from_block,
        "toBlock":    to_block,
        "category":   category or ["external", "erc20", "erc721"],
        "withMetadata": True,
        "excludeZeroValue": True,
        "maxCount":   hex(min(max_count, 1000)),
    }
    if from_address:
        params["fromAddress"] = from_address
    if to_address:
        params["toAddress"] = to_address

    transfers = []
    page_key = None

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            if page_key:
                params["pageKey"] = page_key

            r = await client.post(ALCHEMY_RPCS[chain], json={
                "jsonrpc": "2.0", "id": 1,
                "method": "alchemy_getAssetTransfers",
                "params": [params],
            })
            data = r.json()
            result = data.get("result", {})
            raw = result.get("transfers", [])

            for tx in raw:
                value = tx.get("value") or 0.0
                if value < min_value:
                    continue
                meta = tx.get("metadata", {})
                ts_str = meta.get("blockTimestamp", "")
                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except Exception:
                    ts = None

                transfers.append({
                    "tx_hash":      tx.get("hash", ""),
                    "chain":        chain,
                    "from_address": tx.get("from", "").lower(),
                    "to_address":   (tx.get("to") or "").lower(),
                    "asset":        tx.get("asset") or "ETH",
                    "value":        value,
                    "category":     tx.get("category", ""),
                    "block_num":    int(tx.get("blockNum", "0x0"), 16),
                    "block_time":   ts,
                })

            page_key = result.get("pageKey")
            if not page_key or len(transfers) >= max_count:
                break

    return transfers


async def count_wallets_by_threshold(
    chain: str = "ethereum",
    min_eth: float = 10.0,
    from_block: str = "0x0",
    to_block: str = "latest",
) -> dict:
    """
    Count unique wallets that sent >= min_eth on a chain in a block range.
    """
    transfers = await get_asset_transfers(
        chain=chain,
        min_value=min_eth,
        category=["external"],
        from_block=from_block,
        to_block=to_block,
        max_count=1000,
    )
    senders   = {t["from_address"] for t in transfers}
    receivers = {t["to_address"]   for t in transfers}
    return {
        "transfers":      len(transfers),
        "unique_senders": len(senders),
        "unique_receivers": len(receivers),
        "total_volume":   sum(t["value"] for t in transfers),
        "transfers_raw":  transfers,
    }
