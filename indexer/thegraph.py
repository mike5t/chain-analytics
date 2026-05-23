"""
The Graph — DeFi protocol data via the decentralized network.
Uses the real Graph API key for proper Uniswap V3 and Aave V3 data.
"""

import os
import httpx
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

GRAPH_KEY = os.getenv("GRAPH_KEY", "")

SUBGRAPHS = {
    "uniswap_v3": f"https://gateway.thegraph.com/api/{GRAPH_KEY}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
    "aave_v3":    f"https://gateway.thegraph.com/api/{GRAPH_KEY}/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnWm89byeSo",
}


async def _graphql(subgraph: str, query: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(SUBGRAPHS[subgraph], json={"query": query})
        r.raise_for_status()
        return r.json().get("data", {})


async def get_uniswap_swaps(wallet: str, limit: int = 100) -> list[dict]:
    """Return Uniswap V3 swaps for a wallet with full token and USD data."""
    query = """
    {
      swaps(
        where: {origin: "%s"}
        first: %d
        orderBy: timestamp
        orderDirection: desc
      ) {
        transaction { id }
        timestamp
        token0 { symbol decimals }
        token1 { symbol decimals }
        amount0
        amount1
        amountUSD
        pool { feeTier }
      }
    }
    """ % (wallet.lower(), limit)

    try:
        data = await _graphql("uniswap_v3", query)
    except Exception:
        return []

    swaps = []
    for s in data.get("swaps", []):
        amount0 = float(s["amount0"])
        swaps.append({
            "tx_hash":    s["transaction"]["id"],
            "chain":      "ethereum",
            "wallet":     wallet,
            "protocol":   "Uniswap V3",
            "token_in":   s["token0"]["symbol"] if amount0 < 0 else s["token1"]["symbol"],
            "token_out":  s["token1"]["symbol"] if amount0 < 0 else s["token0"]["symbol"],
            "amount_in":  abs(amount0),
            "amount_out": abs(float(s["amount1"])),
            "amount_usd": float(s.get("amountUSD", 0)),
            "fee_tier":   int(s["pool"]["feeTier"]) / 1e6,
            "block_time": datetime.fromtimestamp(int(s["timestamp"])),
        })
    return swaps


async def get_aave_activity(wallet: str) -> list[dict]:
    """Return Aave V3 lending/borrowing/liquidation activity for a wallet."""
    w = wallet.lower()
    query = """
    {
      deposits(where: {user: "%s"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      withdraws(where: {user: "%s"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      borrows(where: {user: "%s"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      repays(where: {user: "%s"}, first: 100, orderBy: timestamp, orderDirection: desc)
        { id amount reserve { symbol decimals } timestamp }
      liquidationCalls(where: {user: "%s"}, first: 100, orderBy: timestamp, orderDirection: desc) {
        id principalAmount collateralReserve { symbol decimals } timestamp
      }
    }
    """ % (w, w, w, w, w)

    try:
        data = await _graphql("aave_v3", query)
    except Exception:
        return []

    items = []
    for action, key in [("deposit","deposits"),("withdraw","withdraws"),
                        ("borrow","borrows"),("repay","repays")]:
        for tx in data.get(key, []):
            decimals = int(tx["reserve"].get("decimals", 18))
            items.append({
                "tx_hash":    tx["id"].split(":")[0],
                "chain":      "ethereum",
                "wallet":     wallet,
                "protocol":   "Aave V3",
                "action":     action,
                "token":      tx["reserve"]["symbol"],
                "amount":     float(tx["amount"]) / (10 ** decimals),
                "block_time": datetime.fromtimestamp(int(tx["timestamp"])),
            })

    for liq in data.get("liquidationCalls", []):
        decimals = int(liq["collateralReserve"].get("decimals", 18))
        items.append({
            "tx_hash":    liq["id"].split(":")[0],
            "chain":      "ethereum",
            "wallet":     wallet,
            "protocol":   "Aave V3",
            "action":     "liquidated",
            "token":      liq["collateralReserve"]["symbol"],
            "amount":     float(liq["principalAmount"]) / (10 ** decimals),
            "block_time": datetime.fromtimestamp(int(liq["timestamp"])),
        })

    return items


async def get_global_swap_stats(min_usd: float = 10000, limit: int = 100) -> list[dict]:
    """Get recent large Uniswap V3 swaps chain-wide (not filtered by wallet)."""
    query = """
    {
      swaps(
        first: %d
        orderBy: timestamp
        orderDirection: desc
        where: { amountUSD_gte: "%s" }
      ) {
        transaction { id }
        timestamp
        origin
        token0 { symbol }
        token1 { symbol }
        amount0
        amount1
        amountUSD
      }
    }
    """ % (limit, min_usd)

    try:
        data = await _graphql("uniswap_v3", query)
    except Exception:
        return []

    results = []
    for s in data.get("swaps", []):
        amount0 = float(s["amount0"])
        results.append({
            "tx_hash":    s["transaction"]["id"],
            "wallet":     s["origin"],
            "token_in":   s["token0"]["symbol"] if amount0 < 0 else s["token1"]["symbol"],
            "token_out":  s["token1"]["symbol"] if amount0 < 0 else s["token0"]["symbol"],
            "amount_usd": float(s["amountUSD"]),
            "block_time": datetime.fromtimestamp(int(s["timestamp"])),
        })
    return results
