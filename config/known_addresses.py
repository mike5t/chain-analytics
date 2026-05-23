KNOWN_ADDRESSES = {
    # ── Centralised Exchanges ──────────────────────────────────────────────────
    "0x28c6c06298d514db089934071355e5743bf21d60": {"label": "Binance Hot Wallet",   "category": "cex"},
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": {"label": "Binance Cold Wallet",  "category": "cex"},
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": {"label": "Binance US",            "category": "cex"},
    "0xeb2629a2734e272bcc07bf1039e2dd5f63d5c9b4": {"label": "Coinbase",              "category": "cex"},
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": {"label": "Coinbase 2",            "category": "cex"},
    "0x0d0707963952f2fba59dd06f2b425ace40b492fe": {"label": "Gate.io",               "category": "cex"},
    "0xf89d7b9c864f589bbf53a82105107622b35eaa40": {"label": "Bybit",                 "category": "cex"},
    "0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67": {"label": "Binance 14",            "category": "cex"},

    # ── DeFi Protocols ────────────────────────────────────────────────────────
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": {"label": "Uniswap V2 Router",    "category": "defi"},
    "0xe592427a0aece92de3edee1f18e0157c05861564": {"label": "Uniswap V3 Router",    "category": "defi"},
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": {"label": "Uniswap Universal Router", "category": "defi"},
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": {"label": "Aave V3 Pool",         "category": "defi"},
    "0xc3d688b66703497daa19211eedff47f25384cdc3": {"label": "Compound V3",          "category": "defi"},
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": {"label": "SushiSwap Router",     "category": "defi"},
    "0xba12222222228d8ba445958a75a0704d566bf2c8": {"label": "Balancer Vault",        "category": "defi"},
    "0x1111111254eeb25477b68fb85ed929f73a960582": {"label": "1inch V5",              "category": "defi"},

    # ── Bridges ───────────────────────────────────────────────────────────────
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585": {"label": "Wormhole Bridge",      "category": "bridge"},
    "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f": {"label": "Arbitrum Bridge",      "category": "bridge"},
    "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1": {"label": "Optimism Bridge",      "category": "bridge"},
    "0x3154cf16ccdb4c6d922629664174b904d80f2c35": {"label": "Base Bridge",          "category": "bridge"},

    # ── Mixers / Privacy ──────────────────────────────────────────────────────
    "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": {"label": "Tornado Cash 0.1 ETH", "category": "mixer"},
    "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": {"label": "Tornado Cash 10 ETH",  "category": "mixer"},
    "0xa160cdab225685da1d56aa342ad8841c3b53f291": {"label": "Tornado Cash 100 ETH", "category": "mixer"},

    # ── Burn ──────────────────────────────────────────────────────────────────
    "0x000000000000000000000000000000000000dead": {"label": "Burn Address",         "category": "burn"},
    "0x0000000000000000000000000000000000000000": {"label": "Zero Address",         "category": "burn"},
}

# Quick lookup sets
CEX_ADDRESSES = {
    addr for addr, info in KNOWN_ADDRESSES.items()
    if info["category"] == "cex"
}

MIXER_ADDRESSES = {
    addr for addr, info in KNOWN_ADDRESSES.items()
    if info["category"] == "mixer"
}

BRIDGE_ADDRESSES = {
    addr for addr, info in KNOWN_ADDRESSES.items()
    if info["category"] == "bridge"
}
