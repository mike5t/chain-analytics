"""
Raw Web3 RPC calls.

Uses direct eth_* calls via web3.py — no Etherscan needed.
Works on free-tier Alchemy nodes for current state.
"""

from web3 import Web3
from config.chains import CHAINS
from config.tokens import TOKENS

ERC20_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function",
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_w3(chain: str) -> Web3:
    return Web3(Web3.HTTPProvider(CHAINS[chain]["rpc"]))


def get_native_balance(wallet: str, chain: str) -> float:
    """Return native token balance (ETH / BNB / MATIC) in full units."""
    w3 = get_w3(chain)
    wei = w3.eth.get_balance(Web3.to_checksum_address(wallet))
    return float(w3.from_wei(wei, "ether"))


def get_all_native_balances(wallet: str) -> dict:
    """Return native balances across all configured chains."""
    results = {}
    for chain in CHAINS:
        try:
            results[chain] = get_native_balance(wallet, chain)
        except Exception as e:
            results[chain] = f"error: {e}"
    return results


def get_token_balance(
    wallet: str, token_address: str, decimals: int, chain: str
) -> float:
    """Return ERC-20 token balance in full units."""
    w3 = get_w3(chain)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(token_address), abi=ERC20_ABI
    )
    raw = contract.functions.balanceOf(Web3.to_checksum_address(wallet)).call()
    return raw / (10**decimals)


def get_all_token_balances(wallet: str, chain: str) -> dict:
    """Return all configured token balances for a wallet on a chain."""
    if chain not in TOKENS:
        return {}
    results = {}
    for symbol, info in TOKENS[chain].items():
        try:
            results[symbol] = get_token_balance(
                wallet, info["address"], info["decimals"], chain
            )
        except Exception:
            results[symbol] = 0.0
    return results


def get_token_total_supply(
    token_address: str, decimals: int, chain: str
) -> float:
    """Return total supply of an ERC-20 token in full units."""
    w3 = get_w3(chain)
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(token_address), abi=ERC20_ABI
    )
    raw = contract.functions.totalSupply().call()
    return raw / (10**decimals)


def get_latest_block(chain: str) -> int:
    """Return the current block number for a chain."""
    return get_w3(chain).eth.block_number


def get_block_timestamp(block_number: int, chain: str) -> int:
    """Return Unix timestamp for a block."""
    block = get_w3(chain).eth.get_block(block_number)
    return block["timestamp"]
