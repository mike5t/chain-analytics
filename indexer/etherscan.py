"""
Etherscan API module — pulls full transaction history for any address.

Handles ERC-20 token transfers and native ETH/BNB/MATIC transfers.
All functions are async and paginate automatically (max 10,000 txs per call).
"""

import httpx
import asyncio
from datetime import datetime
from config.chains import CHAINS
from config.tokens import BURN_ADDRESS

# Limit concurrent calls to Etherscan V2 to avoid rate-limiting (5 req/s free tier)
_ETHERSCAN_SEM = asyncio.Semaphore(2)


async def _fetch(url: str, params: dict) -> dict:
    """Low-level async GET with retries. Throttles Etherscan V2 calls."""
    from config.chains import ETHERSCAN_V2
    use_sem = (url == ETHERSCAN_V2)
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for attempt in range(3):
            try:
                if use_sem:
                    async with _ETHERSCAN_SEM:
                        r = await client.get(url, params=params)
                        await asyncio.sleep(0.3)  # 300ms gap between V2 calls
                else:
                    r = await client.get(url, params=params)
                r.raise_for_status()
                return r.json()
            except Exception as e:
                if attempt == 2:
                    raise
                await asyncio.sleep(1.5 ** attempt)
    return {}


def _params(cfg: dict, base: dict) -> dict:
    """Build explorer params — add chainid only for Etherscan V2 endpoints."""
    if cfg.get("explorer_v2", True):
        base["chainid"] = cfg["chain_id"]
    if cfg["explorer_key"]:
        base["apikey"] = cfg["explorer_key"]
    return base


async def fetch_token_transfers(wallet: str, chain: str) -> list[dict]:
    """Fetch all ERC-20 token transfers for a wallet on a chain."""
    cfg = CHAINS[chain]
    data = await _fetch(cfg["explorer"], _params(cfg, {
        "module":  "account",
        "action":  "tokentx",
        "address": wallet,
        "sort":    "asc",
    }))

    if data.get("status") != "1":
        return []

    flows = []
    for tx in data["result"]:
        decimals = int(tx.get("tokenDecimal") or 18)
        flows.append({
            "tx_hash":       tx["hash"],
            "chain":         chain,
            "from_address":  tx["from"].lower(),
            "to_address":    tx["to"].lower(),
            "token":         tx["tokenSymbol"],
            "token_address": tx["contractAddress"].lower(),
            "amount":        int(tx["value"]) / (10 ** decimals),
            "block_number":  int(tx["blockNumber"]),
            "block_time":    datetime.fromtimestamp(int(tx["timeStamp"])),
        })
    return flows


async def fetch_native_transfers(wallet: str, chain: str) -> list[dict]:
    """Fetch all native transfers (ETH/BNB/MATIC) for a wallet on a chain."""
    cfg = CHAINS[chain]
    data = await _fetch(cfg["explorer"], _params(cfg, {
        "module":  "account",
        "action":  "txlist",
        "address": wallet,
        "sort":    "asc",
    }))

    if data.get("status") != "1":
        return []

    flows = []
    for tx in data["result"]:
        value_eth = int(tx["value"]) / 1e18
        if value_eth == 0:
            continue
        flows.append({
            "tx_hash":       tx["hash"],
            "chain":         chain,
            "from_address":  tx["from"].lower(),
            "to_address":    tx.get("to", "").lower(),
            "token":         CHAINS[chain]["native"],
            "token_address": "native",
            "amount":        value_eth,
            "block_number":  int(tx["blockNumber"]),
            "block_time":    datetime.fromtimestamp(int(tx["timeStamp"])),
        })
    return flows


async def fetch_internal_transfers(wallet: str, chain: str) -> list[dict]:
    """Fetch internal (contract-to-contract) ETH transfers."""
    cfg = CHAINS[chain]
    data = await _fetch(cfg["explorer"], _params(cfg, {
        "module":  "account",
        "action":  "txlistinternal",
        "address": wallet,
        "sort":    "asc",
    }))

    if data.get("status") != "1":
        return []

    flows = []
    for tx in data["result"]:
        value_eth = int(tx.get("value", 0)) / 1e18
        if value_eth == 0:
            continue
        flows.append({
            "tx_hash":       tx["hash"],
            "chain":         chain,
            "from_address":  tx["from"].lower(),
            "to_address":    tx["to"].lower(),
            "token":         CHAINS[chain]["native"] + "_internal",
            "token_address": "native_internal",
            "amount":        value_eth,
            "block_number":  int(tx["blockNumber"]),
            "block_time":    datetime.fromtimestamp(int(tx["timeStamp"])),
        })
    return flows


async def fetch_nft_transfers(wallet: str, chain: str) -> list[dict]:
    """Fetch ERC-721 NFT transfers for a wallet on a chain."""
    cfg = CHAINS[chain]
    try:
        data = await _fetch(cfg["explorer"], _params(cfg, {
            "module":  "account",
            "action":  "tokennfttx",
            "address": wallet,
            "sort":    "asc",
        }))
    except Exception:
        return []  # NFT endpoint not supported on this explorer

    if data.get("status") != "1":
        return []

    flows = []
    for tx in data["result"]:
        flows.append({
            "tx_hash":       tx["hash"],
            "chain":         chain,
            "from_address":  tx["from"].lower(),
            "to_address":    tx["to"].lower(),
            "token":         f"{tx.get('tokenName','NFT')} #{tx.get('tokenID','?')} [{tx.get('tokenSymbol','')}]",
            "token_address": tx["contractAddress"].lower(),
            "amount":        1.0,
            "block_number":  int(tx["blockNumber"]),
            "block_time":    datetime.fromtimestamp(int(tx["timeStamp"])),
        })
    return flows


async def investigate_address(wallet: str, chain: str) -> dict:
    """
    Full investigation of a wallet on a single chain.
    Returns inflows, outflows, burns, and all raw flows (ERC-20 + native + NFT).
    """
    wallet = wallet.lower()
    token_flows, native_flows, nft_flows = await asyncio.gather(
        fetch_token_transfers(wallet, chain),
        fetch_native_transfers(wallet, chain),
        fetch_nft_transfers(wallet, chain),
    )
    all_flows = token_flows + native_flows + nft_flows
    burn_addr = BURN_ADDRESS.lower()

    return {
        "wallet":    wallet,
        "chain":     chain,
        "all_flows": all_flows,
        "inflows":   [f for f in all_flows if f["to_address"] == wallet],
        "outflows":  [f for f in all_flows if f["from_address"] == wallet],
        "burns":     [f for f in token_flows if f["to_address"] == burn_addr],
        "nfts":      nft_flows,
    }


async def investigate_all_chains(wallet: str) -> dict:
    """
    Investigate a wallet across all supported chains.
    Etherscan V2 chains run sequentially (rate limit: 5 req/s free tier).
    Blockscout/other chains run in parallel alongside them.
    """
    supported = [c for c, cfg in CHAINS.items() if cfg.get("explorer_supported", True)]
    v2_chains    = [c for c in supported if CHAINS[c].get("explorer_v2", True)]
    other_chains = [c for c in supported if not CHAINS[c].get("explorer_v2", True)]

    combined: dict = {"wallet": wallet, "chains": {}}

    async def run_chain(chain, delay=0):
        if delay:
            await asyncio.sleep(delay)
        try:
            r = await investigate_address(wallet, chain)
            combined["chains"][chain] = r
        except Exception as e:
            print(f"[etherscan] {chain} error: {e}")

    # Etherscan V2 chains: stagger by 0.6s each to stay under 5 req/s
    v2_tasks = [run_chain(c, delay=i * 0.6) for i, c in enumerate(v2_chains)]
    # Blockscout/other chains: run all in parallel (generous limits)
    other_tasks = [run_chain(c) for c in other_chains]

    await asyncio.gather(*v2_tasks, *other_tasks)
    return combined
