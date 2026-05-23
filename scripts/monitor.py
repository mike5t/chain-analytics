#!/usr/bin/env python3
"""
scripts/monitor.py — Real-time wallet monitoring CLI.

Polls for new transactions every N seconds and fires alert rules
stored in the DuckDB database.

Usage:
    python scripts/monitor.py 0xWalletAddress
    python scripts/monitor.py 0xWalletAddress ethereum
    python scripts/monitor.py 0xWalletAddress ethereum --interval 30
"""

import sys
import asyncio
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forensics.alerts import monitor_wallet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Chain Analytics — real-time wallet monitor")
    p.add_argument("wallet",             help="Ethereum address to monitor")
    p.add_argument("chain", nargs="?",   default="ethereum", help="Chain (default: ethereum)")
    p.add_argument("--interval", "-i",   type=int, default=15, help="Poll interval in seconds (default: 15)")
    return p.parse_args()


async def main():
    args = parse_args()
    print(f"\nChain Analytics — Monitor")
    print(f"  Wallet:   {args.wallet}")
    print(f"  Chain:    {args.chain}")
    print(f"  Interval: {args.interval}s")
    print(f"  Press Ctrl+C to stop.\n")

    try:
        await monitor_wallet(args.wallet, args.chain, args.interval)
    except KeyboardInterrupt:
        print("\nMonitor stopped.")


if __name__ == "__main__":
    asyncio.run(main())
