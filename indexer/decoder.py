"""
ABI log decoder — decodes raw EVM event logs into human-readable dicts.

Useful for decoding Transfer, Swap, Deposit, Borrow events from
transaction receipts when Etherscan data is insufficient.
"""

import json
from web3 import Web3
from web3.types import LogReceipt


# ── Common event signatures ───────────────────────────────────────────────────

TRANSFER_TOPIC = Web3.keccak(text="Transfer(address,address,uint256)").hex()
SWAP_V2_TOPIC  = Web3.keccak(text="Swap(address,uint256,uint256,uint256,uint256,address)").hex()
SWAP_V3_TOPIC  = Web3.keccak(text="Swap(address,address,int256,int256,uint160,uint128,int24)").hex()
APPROVAL_TOPIC = Web3.keccak(text="Approval(address,address,uint256)").hex()


def decode_transfer_log(log: LogReceipt) -> dict | None:
    """
    Decode an ERC-20 Transfer event log.
    Returns {from, to, amount_raw, contract} or None if not a Transfer.
    """
    if not log["topics"] or log["topics"][0].hex() != TRANSFER_TOPIC:
        return None
    if len(log["topics"]) < 3:
        return None

    from_addr = "0x" + log["topics"][1].hex()[-40:]
    to_addr   = "0x" + log["topics"][2].hex()[-40:]
    amount    = int(log["data"].hex(), 16) if log["data"] else 0

    return {
        "from":     from_addr.lower(),
        "to":       to_addr.lower(),
        "amount_raw": amount,
        "contract": log["address"].lower(),
    }


def decode_logs(receipt_logs: list, abi: list | None = None) -> list[dict]:
    """
    Attempt to decode a list of raw logs.
    Returns decoded Transfer events; skips unknown log types.
    """
    decoded = []
    for log in receipt_logs:
        try:
            transfer = decode_transfer_log(log)
            if transfer:
                decoded.append({"type": "Transfer", **transfer})
        except Exception:
            continue
    return decoded


def load_abi(path: str) -> list:
    """Load an ABI JSON file from disk."""
    with open(path) as f:
        return json.load(f)
