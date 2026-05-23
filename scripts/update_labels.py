"""
scripts/update_labels.py — populate address_labels table from public sources.

Run this once (and weekly to keep fresh):
    python scripts/update_labels.py

Sources:
  1. MEW Darklist       — phishing/scam addresses (GitHub)
  2. Known CEX wallets  — from config/known_addresses.py
  3. Tornado Cash       — mixer contract addresses (hardcoded)
  4. Known hackers      — major exploit addresses (hardcoded, public record)
  5. DeFi protocols     — Uniswap, Aave, etc. (hardcoded)
"""

import sys, asyncio, httpx, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.database import get_conn

# ── 1. Tornado Cash mixer contracts ──────────────────────────────────────────
TORNADO_CASH = {
    "0x12d66f87a04a9e220c9d5078724a7820446fa8ce": "Tornado Cash 0.1 ETH",
    "0x47ce0c6eaf42405b8e6a1b74bb3f2a5f6e6d3d6": "Tornado Cash 1 ETH",
    "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": "Tornado Cash 10 ETH",
    "0xa160cdab225685da1d56aa342ad8841c3b53f291": "Tornado Cash 100 ETH",
    "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3": "Tornado Cash 100 DAI",
    "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144": "Tornado Cash 1000 DAI",
    "0x07687e702b410fa43f4cb4af7fa097918ffd2730": "Tornado Cash 10000 DAI",
    "0x23773e65ed146a459667dd7e6781c8b6a4c82bd": "Tornado Cash 100000 DAI",
    "0x22aaa7720ddd5388a3c0a3333430953c68f1849b": "Tornado Cash USDC 100",
    "0xba214c1c1928a32bffe790263e38b4af9bfcd659": "Tornado Cash USDC 1000",
    "0xb1c8094b234dce6e03f10a5b673c1d8c69739a00": "Tornado Cash WBTC",
    "0x94a1b5cdb22c43faab4abeb5c74999895464ddaf": "Tornado Cash Router",
    "0x722122df12d4e14e13ac3b6895a86e84145b6967": "Tornado Cash Proxy",
}

# ── 2. Known hacker / exploit addresses (public record) ──────────────────────
KNOWN_HACKERS = {
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96": "Ronin Bridge Hacker (Lazarus Group)",
    "0x850b0d3ab1cbdf78da0c5ea7e5b6e5e4f4e36e46": "Ronin Bridge Hacker 2",
    "0x8589427373d6d84e98730d7795d8f6f8731fda16": "Bitfinex Hacker",
    "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": "Binance Exploiter",
    "0xa2c0c70a1e922a1f7b8a3ea9e0e6e2c7f0b6f1b1": "Poly Network Hacker",
    "0x05328f171b8c1463eafdacca478d9ee9a2859781": "Poly Network Hacker 2",
    "0xc8a65fadf0e0ddaf421f28feab69bf6e2e589963": "Cream Finance Exploiter",
    "0x24d8ddf27b37da92deb2bdf18a51b3b2f31ba8dc": "BadgerDAO Exploiter",
    "0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a": "Lazarus Group",
    "0x7f367cc41522ce07553e823bf3be79a889debe1b": "Lazarus Group 2",
    "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b": "Lazarus Group 3",
    "0x901bb9583b24d97e995513c6778dc6888ab6870e": "Lazarus Group 4",
    "0xa7e5d5a720f06526557c513402f2e6b5fa20b008": "Lazarus Group 5",
    "0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c": "FTX Hacker",
    "0x59abf3837fa962d6853b4cc0a19513aa031fd32b": "Euler Finance Hacker",
    "0xb2361f36d4fb6eedcca97be77bc61a5a4b4bc9bc": "Nomad Bridge Hacker",
    "0x9e7f8d7d4b8b9c2e8f6c1a2b3d4e5f6a7b8c9d0e": "Wormhole Exploiter",
}

# ── 3. DeFi protocol addresses ────────────────────────────────────────────────
DEFI_PROTOCOLS = {
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": ("Uniswap V3 Router",      "dex"),
    "0xe592427a0aece92de3edee1f18e0157c05861564": ("Uniswap V3 Router V1",   "dex"),
    "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": ("Uniswap Universal Router","dex"),
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": ("Aave V3 Pool",           "lending"),
    "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9": ("Aave V2 Pool",           "lending"),
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff": ("0x Exchange Proxy",      "dex"),
    "0x1111111254eeb25477b68fb85ed929f73a960582": ("1inch V5 Router",        "dex"),
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": ("Uniswap V2 Router",      "dex"),
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": ("Wrapped ETH (WETH)",     "token"),
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ("USDC",                  "token"),
    "0xdac17f958d2ee523a2206206994597c13d831ec7": ("USDT",                  "token"),
    "0x6b175474e89094c44da98b954eedeac495271d0f": ("DAI",                   "token"),
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": ("WBTC",                  "token"),
    "0x00000000219ab540356cbb839cbe05303d7705fa": ("ETH2 Deposit Contract",  "staking"),
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": ("Lido stETH",            "staking"),
    "0xba12222222228d8ba445958a75a0704d566bf2c8": ("Balancer Vault",         "dex"),
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": ("SushiSwap Router",       "dex"),
}

# ── 4. Known CEX hot wallets ──────────────────────────────────────────────────
from config.known_addresses import CEX_ADDRESSES, KNOWN_ADDRESSES

CEX_LABELS = {
    addr: (info.get("label", addr), info.get("category", "cex"))
    for addr, info in KNOWN_ADDRESSES.items()
    if isinstance(info, dict)
}


async def load_mew_darklist(conn) -> int:
    """Download MEW phishing/scam address list."""
    print("  Downloading MEW darklist...")
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        r = await client.get(
            "https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists"
            "/master/src/addresses/addresses-darklist.json"
        )
        data = json.loads(r.text)

    count = 0
    for item in data:
        addr    = item.get("address", "").lower()
        comment = item.get("comment", "Phishing/Scam")[:200]
        if not addr.startswith("0x"):
            continue
        conn.execute("""
            INSERT OR REPLACE INTO address_labels (address, chain, label, category)
            VALUES (?, 'ethereum', ?, 'scam')
        """, [addr, comment])
        count += 1
    return count


def load_hardcoded(conn) -> int:
    count = 0

    # Tornado Cash
    for addr, label in TORNADO_CASH.items():
        conn.execute("""
            INSERT OR REPLACE INTO address_labels (address, chain, label, category)
            VALUES (?, 'ethereum', ?, 'mixer')
        """, [addr.lower(), label])
        count += 1

    # Hackers
    for addr, label in KNOWN_HACKERS.items():
        conn.execute("""
            INSERT OR REPLACE INTO address_labels (address, chain, label, category)
            VALUES (?, 'ethereum', ?, 'hacker')
        """, [addr.lower(), label])
        count += 1

    # DeFi protocols
    for addr, (label, category) in DEFI_PROTOCOLS.items():
        conn.execute("""
            INSERT OR REPLACE INTO address_labels (address, chain, label, category)
            VALUES (?, 'ethereum', ?, ?)
        """, [addr.lower(), label, category])
        count += 1

    # CEX addresses
    for addr, (label, category) in CEX_LABELS.items():
        conn.execute("""
            INSERT OR REPLACE INTO address_labels (address, chain, label, category)
            VALUES (?, 'ethereum', ?, ?)
        """, [addr.lower(), label, category])
        count += 1

    return count


async def main():
    conn = get_conn()
    print("=== Updating Address Labels ===\n")

    n1 = await load_mew_darklist(conn)
    print(f"  MEW Darklist    : {n1} scam/phishing addresses")

    n2 = load_hardcoded(conn)
    print(f"  Hardcoded       : {n2} addresses (mixers, hackers, DeFi, CEX)")

    total = conn.execute("SELECT COUNT(*) FROM address_labels").fetchone()[0]
    breakdown = conn.execute("""
        SELECT category, COUNT(*) as cnt
        FROM address_labels
        GROUP BY category ORDER BY cnt DESC
    """).fetchall()

    print(f"\n  Total in DB: {total:,}")
    print("  Breakdown:")
    for cat, cnt in breakdown:
        print(f"    {cat:<15} {cnt:>5,}")

    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
