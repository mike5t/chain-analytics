#!/usr/bin/env python3
"""
scripts/update_sanctions.py — Download and refresh the OFAC SDN sanctions list.

Downloads the OFAC SDN Advanced XML, extracts all ETH addresses,
and stores them in the local DuckDB database.

Run this weekly to keep the list current.

Usage:
    python scripts/update_sanctions.py
"""

import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from forensics.sanctions import update_sanctions_list, count_sanctioned


async def main():
    print("Chain Analytics — OFAC Sanctions Update")
    print("=" * 50)

    before = count_sanctioned()
    print(f"Addresses in DB before update: {before}")

    try:
        count = await update_sanctions_list()
        after = count_sanctioned()
        print(f"Addresses in DB after update:  {after}")
        print(f"✅ Done — {count} ETH addresses loaded from OFAC SDN list.")
    except Exception as e:
        print(f"❌ Update failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
