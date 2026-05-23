# RPC endpoints — free, no key required.
# Explorer: Etherscan V2 (free for ETH/ARB/MATIC), Blockscout (free, keyless) for others.
# explorer_v2=False  → Blockscout format (no chainid param, no apikey)
# explorer_supported=False → RPC only, no tx history available free

import os
from dotenv import load_dotenv
load_dotenv()

ETHERSCAN_V2  = "https://api.etherscan.io/v2/api"
ETHERSCAN_KEY = os.getenv("ETHERSCAN_KEY", "")

CHAINS = {
    "ethereum": {
        "rpc":                "https://ethereum-rpc.publicnode.com",
        "chain_id":           1,
        "explorer":           ETHERSCAN_V2,
        "explorer_key":       ETHERSCAN_KEY,
        "explorer_supported": True,
        "explorer_v2":        True,
        "native":             "ETH",
    },
    "base": {
        "rpc":                "https://mainnet.base.org",
        "chain_id":           8453,
        "explorer":           "https://base.blockscout.com/api",
        "explorer_key":       "",
        "explorer_supported": True,
        "explorer_v2":        False,
        "native":             "ETH",
    },
    "arbitrum": {
        "rpc":                "https://arb1.arbitrum.io/rpc",
        "chain_id":           42161,
        "explorer":           ETHERSCAN_V2,
        "explorer_key":       ETHERSCAN_KEY,
        "explorer_supported": True,
        "explorer_v2":        True,
        "native":             "ETH",
    },
    "polygon": {
        "rpc":                "https://polygon-bor-rpc.publicnode.com",
        "chain_id":           137,
        "explorer":           ETHERSCAN_V2,
        "explorer_key":       ETHERSCAN_KEY,
        "explorer_supported": True,
        "explorer_v2":        True,
        "native":             "MATIC",
    },
    "optimism": {
        "rpc":                "https://mainnet.optimism.io",
        "chain_id":           10,
        "explorer":           "https://optimism.blockscout.com/api",
        "explorer_key":       "",
        "explorer_supported": True,
        "explorer_v2":        False,
        "native":             "ETH",
    },
    "bsc": {
        "rpc":                "https://bsc-dataseed.binance.org",
        "chain_id":           56,
        "explorer":           ETHERSCAN_V2,
        "explorer_key":       ETHERSCAN_KEY,
        "explorer_supported": False,  # requires paid Etherscan plan
        "explorer_v2":        True,
        "native":             "BNB",
    },
    "scroll": {
        "rpc":                "https://scroll-rpc.publicnode.com",
        "chain_id":           534352,
        "explorer":           "https://scrollscan.com/api",
        "explorer_key":       "",
        "explorer_supported": True,
        "explorer_v2":        False,
        "native":             "ETH",
    },
    "avalanche": {
        "rpc":                "https://avalanche-c-chain-rpc.publicnode.com",
        "chain_id":           43114,
        "explorer":           "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api",
        "explorer_key":       "",
        "explorer_supported": True,
        "explorer_v2":        False,
        "native":             "AVAX",
    },
}
