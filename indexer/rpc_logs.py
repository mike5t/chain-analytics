"""
RPC-based transaction fetcher using eth_getLogs.

Fetches ERC-20 Transfer events directly via the RPC node —
no Etherscan API key required. Works on any public RPC that
supports eth_getLogs with a block range.

Limitations vs Etherscan:
  - Block range per call is typically capped at 2,000–10,000 blocks
    depending on the RPC provider. We auto-chunk.
  - Native ETH transfers (not events) are NOT catchable via eth_getLogs.
    Use indexer/etherscan.py (free, no-key, rate-limited) for those,
    or just use the balance diff approach for native tokens.
"""

import asyncio
from datetime import datetime
from web3 import Web3

from config.chains import CHAINS
from config.tokens import TOKENS, BURN_ADDRESS

# keccak256("Transfer(address,address,uint256)")
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# Maximum block range per eth_getLogs call (conservative — works on all free RPCs)
CHUNK_SIZE = 2_000


def _get_w3(chain: str) -> Web3:
    return Web3(Web3.HTTPProvider(CHAINS[chain]["rpc"]))


def _decode_transfer_log(log: dict, chain: str, w3: Web3) -> dict | None:
    """Decode a raw Transfer log into a flow dict."""
    try:
        topics = log["topics"]
        if len(topics) < 3:
            return None

        from_addr = "0x" + topics[1].hex()[-40:]
        to_addr   = "0x" + topics[2].hex()[-40:]
        data      = log["data"]
        amount_raw = int(data.hex() if isinstance(data, bytes) else data, 16)

        token_addr = log["address"].lower()

        # Find decimals + symbol from known tokens
        decimals = 18
        symbol   = "UNKNOWN"
        if chain in TOKENS:
            for sym, info in TOKENS[chain].items():
                if info["address"].lower() == token_addr:
                    decimals = info["decimals"]
                    symbol   = sym
                    break

        return {
            "tx_hash":       log["transactionHash"].hex()
                             if isinstance(log["transactionHash"], bytes)
                             else log["transactionHash"],
            "chain":         chain,
            "from_address":  from_addr.lower(),
            "to_address":    to_addr.lower(),
            "token":         symbol,
            "token_address": token_addr,
            "amount":        amount_raw / (10 ** decimals),
            "block_number":  int(log["blockNumber"], 16)
                             if isinstance(log["blockNumber"], str)
                             else log["blockNumber"],
            "block_time":    None,   # filled in below if needed
        }
    except Exception as e:
        return None


async def fetch_token_transfers_rpc(
    wallet: str,
    chain: str,
    from_block: int = 0,
    to_block: int | None = None,
    token_address: str | None = None,
) -> list[dict]:
    """
    Fetch all ERC-20 Transfer events involving `wallet` (as sender OR receiver)
    using eth_getLogs over chunked block ranges.

    Args:
        wallet:        Address to filter for (matches from or to).
        chain:         Chain name from config.
        from_block:    Start block (default 0).
        to_block:      End block (default: current block).
        token_address: Filter to a specific token contract (optional).

    Returns:
        List of flow dicts compatible with db.database.store_flows().
    """
    w3     = _get_w3(chain)
    wallet = wallet.lower()

    if to_block is None:
        to_block = w3.eth.block_number

    # Pad wallet address to 32 bytes for topic matching
    wallet_topic = "0x" + "0" * 24 + wallet[2:]

    flows: list[dict] = []

    # Chunk the block range
    chunks = [
        (start, min(start + CHUNK_SIZE - 1, to_block))
        for start in range(from_block, to_block + 1, CHUNK_SIZE)
    ]

    print(f"  [rpc_logs] {chain}: scanning {len(chunks)} block chunks for {wallet}")

    for chunk_from, chunk_to in chunks:
        filter_params: dict = {
            "fromBlock": hex(chunk_from),
            "toBlock":   hex(chunk_to),
            "topics": [
                TRANSFER_TOPIC,
                None,           # from: any (we filter wallet below)
                None,           # to:   any
            ],
        }
        if token_address:
            filter_params["address"] = Web3.to_checksum_address(token_address)

        try:
            # Run both directions concurrently: wallet as sender and wallet as receiver
            logs_from = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: w3.eth.get_logs({**filter_params, "topics": [TRANSFER_TOPIC, wallet_topic, None]}),
            )
            logs_to = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: w3.eth.get_logs({**filter_params, "topics": [TRANSFER_TOPIC, None, wallet_topic]}),
            )
            all_logs = list(logs_from) + list(logs_to)
        except Exception as e:
            print(f"  [rpc_logs] chunk {chunk_from}-{chunk_to} error: {e}")
            continue

        for log in all_logs:
            flow = _decode_transfer_log(dict(log), chain, w3)
            if flow:
                flows.append(flow)

    # Deduplicate by tx_hash + token_address
    seen: set[tuple] = set()
    unique: list[dict] = []
    for f in flows:
        key = (f["tx_hash"], f["token_address"])
        if key not in seen:
            seen.add(key)
            unique.append(f)

    print(f"  [rpc_logs] {chain}: found {len(unique)} transfer events")
    return unique


async def fetch_known_token_transfers_rpc(
    wallet: str,
    chain: str,
    from_block: int = 0,
    to_block: int | None = None,
) -> list[dict]:
    """
    Fetch ERC-20 transfers only for the configured known tokens on a chain.
    Much faster than a full open scan — one call per token.
    """
    if chain not in TOKENS:
        return []

    tasks = [
        fetch_token_transfers_rpc(
            wallet, chain,
            from_block=from_block,
            to_block=to_block,
            token_address=info["address"],
        )
        for info in TOKENS[chain].values()
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    flows: list[dict] = []
    for r in results:
        if isinstance(r, list):
            flows.extend(r)
    return flows


async def investigate_address_rpc(
    wallet: str,
    chain: str,
    from_block: int = 0,
    to_block: int | None = None,
) -> dict:
    """
    Pure-RPC investigation — no Etherscan needed.

    Fetches ERC-20 Transfer events for all known tokens via eth_getLogs.
    Note: native ETH/MATIC/BNB transfers are not included (no event emitted).
    Use indexer/rpc.py get_native_balance() for current native balance instead.
    """
    wallet = wallet.lower()
    flows  = await fetch_token_transfers_rpc(wallet, chain, from_block, to_block)
    burn   = BURN_ADDRESS.lower()

    return {
        "wallet":    wallet,
        "chain":     chain,
        "all_flows": flows,
        "inflows":   [f for f in flows if f["to_address"] == wallet],
        "outflows":  [f for f in flows if f["from_address"] == wallet],
        "burns":     [f for f in flows if f["to_address"] == burn],
    }
