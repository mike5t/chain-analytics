# Chain Analytics — Full Build Guide
> A personal Dune-like blockchain forensics system using RPCs, light indexing, and SQL

---

## What You're Building

A system that can:
- Track wallet balances across multiple EVM chains
- Pull full transaction history for any address
- Find who sent money to a target address (inflow analysis)
- Find where money went from a target address (outflow analysis)
- Follow money N hops deep across addresses
- Cluster addresses controlled by the same entity
- Track token burn events
- Score wallets for risk
- Monitor DeFi activity (swaps, LP, lending)
- Screen against sanction lists
- Alert on large movements
- Store everything in a local SQL database for querying

**Architecture philosophy:** Direct RPC for live data. Light targeted indexing for historical forensics. No full chain indexing.

---

## What Needs What

| Feature | Foundation | Extra Code | Extra API |
|---|---|---|---|
| Balance checker | ✅ | — | — |
| Inflow / outflow | ✅ | — | — |
| Burn tracking | ✅ | — | — |
| Cross-chain mapping | ✅ | — | — |
| Hop analysis | ✅ | Recursive loop | — |
| Cluster analysis | ✅ | Pattern algorithm | — |
| Wallet profiling | ✅ | Extra queries | — |
| Risk scoring | ✅ | Scoring algorithm | — |
| Sanction screening | ✅ | — | OFAC list (free) |
| Swap history | ✅ | — | The Graph (free) |
| LP tracking | ✅ | — | The Graph (free) |
| Lending/liquidations | ✅ | — | The Graph (free) |
| MEV / sandwich | ✅ | — | Flashbots API (free) |
| Governance voting | ✅ | — | Snapshot API (free) |
| Real-time alerts | ✅ | WebSocket loop | — |

---

## Stack

| Layer | Tool | Cost |
|---|---|---|
| RPC / Data source | Alchemy + Etherscan API | Free tier |
| DeFi data | The Graph | Free |
| MEV data | Flashbots API | Free |
| Governance | Snapshot.org API | Free |
| Sanctions | OFAC SDN list | Free public download |
| Backend | Python + FastAPI | Free |
| Database | DuckDB | Free |
| Frontend | Streamlit (MVP) → React later | Free |
| Environment | WSL2 + Docker | Already have |

**Total monthly cost: $0**

---

## Project Structure

```
chain-analytics/
├── README.md
├── .env
├── requirements.txt
│
├── config/
│   ├── chains.py
│   ├── tokens.py
│   └── known_addresses.py       # CEX, bridges, protocols, sanctions
│
├── indexer/
│   ├── rpc.py                   # Raw RPC calls
│   ├── etherscan.py             # Etherscan API — tx history
│   ├── decoder.py               # ABI log decoding
│   ├── thegraph.py              # The Graph — DeFi data
│   ├── flashbots.py             # MEV analysis
│   └── snapshot.py              # Governance voting
│
├── forensics/
│   ├── hops.py                  # Multi-hop money tracing
│   ├── cluster.py               # Address clustering
│   ├── profiler.py              # Wallet profiling
│   ├── risk.py                  # Risk scoring
│   ├── sanctions.py             # OFAC screening
│   └── alerts.py                # Real-time monitoring
│
├── db/
│   ├── schema.sql
│   └── database.py
│
├── api/
│   └── main.py
│
├── dashboard/
│   └── app.py
│
└── scripts/
    ├── investigate.py
    ├── monitor.py               # Real-time alert runner
    └── update_sanctions.py      # Refresh OFAC list
```

---

## Step 1 — Environment Setup

```bash
mkdir chain-analytics && cd chain-analytics
python -m venv venv
source venv/bin/activate

pip install web3 httpx fastapi uvicorn duckdb streamlit \
            python-dotenv asyncio networkx pandas requests
```

**.env**
```env
ALCHEMY_KEY=your_alchemy_key_here
ETHERSCAN_KEY=your_etherscan_key_here
```

**Free API keys:**
- Alchemy: https://alchemy.com
- Etherscan: https://etherscan.io/apis

---

## Step 2 — Chain + Token Config

**`config/chains.py`**
```python
import os
from dotenv import load_dotenv
load_dotenv()

KEY = os.getenv("ALCHEMY_KEY")

CHAINS = {
    "ethereum": {
        "rpc":          f"https://eth-mainnet.g.alchemy.com/v2/{KEY}",
        "chain_id":     1,
        "explorer":     "https://api.etherscan.io/api",
        "explorer_key": os.getenv("ETHERSCAN_KEY"),
        "native":       "ETH",
    },
    "base": {
        "rpc":          f"https://base-mainnet.g.alchemy.com/v2/{KEY}",
        "chain_id":     8453,
        "explorer":     "https://api.basescan.org/api",
        "explorer_key": os.getenv("ETHERSCAN_KEY"),
        "native":       "ETH",
    },
    "arbitrum": {
        "rpc":          f"https://arb-mainnet.g.alchemy.com/v2/{KEY}",
        "chain_id":     42161,
        "explorer":     "https://api.arbiscan.io/api",
        "explorer_key": os.getenv("ETHERSCAN_KEY"),
        "native":       "ETH",
    },
    "polygon": {
        "rpc":          f"https://polygon-mainnet.g.alchemy.com/v2/{KEY}",
        "chain_id":     137,
        "explorer":     "https://api.polygonscan.com/api",
        "explorer_key": os.getenv("ETHERSCAN_KEY"),
        "native":       "MATIC",
    },
    "optimism": {
        "rpc":          f"https://opt-mainnet.g.alchemy.com/v2/{KEY}",
        "chain_id":     10,
        "explorer":     "https://api-optimistic.etherscan.io/api",
        "explorer_key": os.getenv("ETHERSCAN_KEY"),
        "native":       "ETH",
    },
    "bsc": {
        "rpc":          "https://bsc-dataseed.binance.org/",
        "chain_id":     56,
        "explorer":     "https://api.bscscan.com/api",
        "explorer_key": os.getenv("ETHERSCAN_KEY"),
        "native":       "BNB",
    },
}
```

**`config/tokens.py`**
```python
TOKENS = {
    "ethereum": {
        "USDC": {"address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "decimals": 6},
        "USDT": {"address": "0xdAC17F958D2ee523a2206206994597C13D831ec7", "decimals": 6},
        "WETH": {"address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "decimals": 18},
        "DAI":  {"address": "0x6B175474E89094C44Da98b954EedeAC495271d0F", "decimals": 18},
    },
    "base": {
        "USDC": {"address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "decimals": 6},
        "WETH": {"address": "0x4200000000000000000000000000000000000006", "decimals": 18},
    },
}

BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD"
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
```

**`config/known_addresses.py`**
```python
KNOWN_ADDRESSES = {
    # Centralised Exchanges
    "0x28c6c06298d514db089934071355e5743bf21d60": {"label": "Binance Hot Wallet",  "category": "cex"},
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": {"label": "Binance Cold Wallet", "category": "cex"},
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": {"label": "Binance US",           "category": "cex"},
    "0xeb2629a2734e272bcc07bf1039e2dd5f63d5c9b4": {"label": "Coinbase",             "category": "cex"},
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": {"label": "Coinbase 2",           "category": "cex"},
    "0x0d0707963952f2fba59dd06f2b425ace40b492fe": {"label": "Gate.io",              "category": "cex"},

    # DeFi Protocols
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": {"label": "Uniswap V2 Router",   "category": "defi"},
    "0xe592427a0aece92de3edee1f18e0157c05861564": {"label": "Uniswap V3 Router",   "category": "defi"},
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": {"label": "Aave V3 Pool",        "category": "defi"},
    "0xc3d688b66703497daa19211eedff47f25384cdc3": {"label": "Compound V3",         "category": "defi"},

    # Bridges
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585": {"label": "Wormhole Bridge",     "category": "bridge"},
    "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f": {"label": "Arbitrum Bridge",     "category": "bridge"},

    # Burn
    "0x000000000000000000000000000000000000dead": {"label": "Burn Address",        "category": "burn"},
}

CEX_ADDRESSES = {
    addr for addr, info in KNOWN_ADDRESSES.items()
    if info["category"] == "cex"
}
```

---

## Step 3 — Database Schema

**`db/schema.sql`**
```sql
CREATE TABLE IF NOT EXISTS wallets (
    address     TEXT PRIMARY KEY,
    label       TEXT,
    flagged     BOOLEAN DEFAULT FALSE,
    notes       TEXT,
    added_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS native_balances (
    wallet      TEXT,
    chain       TEXT,
    balance     DOUBLE,
    updated_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (wallet, chain)
);

CREATE TABLE IF NOT EXISTS token_balances (
    wallet      TEXT,
    chain       TEXT,
    token       TEXT,
    amount      DOUBLE,
    updated_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (wallet, chain, token)
);

CREATE TABLE IF NOT EXISTS address_flows (
    tx_hash         TEXT,
    chain           TEXT,
    from_address    TEXT,
    to_address      TEXT,
    token           TEXT,
    token_address   TEXT,
    amount          DOUBLE,
    block_number    BIGINT,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain, token_address)
);

CREATE TABLE IF NOT EXISTS burns (
    tx_hash         TEXT,
    chain           TEXT,
    token           TEXT,
    token_address   TEXT,
    from_address    TEXT,
    amount          DOUBLE,
    block_number    BIGINT,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);

CREATE TABLE IF NOT EXISTS address_labels (
    address     TEXT,
    chain       TEXT,
    label       TEXT,
    category    TEXT,
    PRIMARY KEY (address, chain)
);

CREATE TABLE IF NOT EXISTS hop_graph (
    source          TEXT,
    destination     TEXT,
    chain           TEXT,
    hop_number      INT,
    total_amount    DOUBLE,
    token           TEXT,
    tx_count        INT,
    PRIMARY KEY (source, destination, chain, token)
);

CREATE TABLE IF NOT EXISTS clusters (
    cluster_id      TEXT,
    address         TEXT,
    chain           TEXT,
    reason          TEXT,
    PRIMARY KEY (cluster_id, address)
);

CREATE TABLE IF NOT EXISTS risk_scores (
    address         TEXT PRIMARY KEY,
    score           INT,
    flags           TEXT,
    scored_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sanctions (
    address         TEXT PRIMARY KEY,
    name            TEXT,
    program         TEXT,
    added_date      TEXT
);

CREATE TABLE IF NOT EXISTS defi_swaps (
    tx_hash         TEXT,
    chain           TEXT,
    wallet          TEXT,
    protocol        TEXT,
    token_in        TEXT,
    token_out       TEXT,
    amount_in       DOUBLE,
    amount_out      DOUBLE,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);

CREATE TABLE IF NOT EXISTS defi_lending (
    tx_hash         TEXT,
    chain           TEXT,
    wallet          TEXT,
    protocol        TEXT,
    action          TEXT,
    token           TEXT,
    amount          DOUBLE,
    block_time      TIMESTAMP,
    PRIMARY KEY (tx_hash, chain)
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id              INTEGER PRIMARY KEY,
    wallet          TEXT,
    chain           TEXT,
    alert_type      TEXT,
    threshold       DOUBLE,
    active          BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS alerts_fired (
    id              INTEGER PRIMARY KEY,
    rule_id         INTEGER,
    wallet          TEXT,
    tx_hash         TEXT,
    message         TEXT,
    fired_at        TIMESTAMP DEFAULT NOW()
);
```

---

## Step 4 — RPC Module

**`indexer/rpc.py`**
```python
from web3 import Web3
from config.chains import CHAINS
from config.tokens import TOKENS

ERC20_ABI = [
    {"constant": True, "inputs": [{"name": "_owner", "type": "address"}],
     "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function"},
    {"constant": True, "inputs": [], "name": "decimals",
     "outputs": [{"name": "", "type": "uint8"}], "type": "function"},
    {"constant": True, "inputs": [], "name": "totalSupply",
     "outputs": [{"name": "", "type": "uint256"}], "type": "function"},
]

def get_w3(chain: str) -> Web3:
    return Web3(Web3.HTTPProvider(CHAINS[chain]["rpc"]))

def get_native_balance(wallet: str, chain: str) -> float:
    w3  = get_w3(chain)
    wei = w3.eth.get_balance(Web3.to_checksum_address(wallet))
    return float(w3.from_wei(wei, "ether"))

def get_all_native_balances(wallet: str) -> dict:
    return {chain: get_native_balance(wallet, chain) for chain in CHAINS}

def get_token_balance(wallet: str, token_address: str, decimals: int, chain: str) -> float:
    w3       = get_w3(chain)
    contract = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    raw      = contract.functions.balanceOf(Web3.to_checksum_address(wallet)).call()
    return raw / (10 ** decimals)

def get_all_token_balances(wallet: str, chain: str) -> dict:
    if chain not in TOKENS:
        return {}
    results = {}
    for symbol, info in TOKENS[chain].items():
        try:
            results[symbol] = get_token_balance(wallet, info["address"], info["decimals"], chain)
        except:
            results[symbol] = 0.0
    return results

def get_token_total_supply(token_address: str, decimals: int, chain: str) -> float:
    w3       = get_w3(chain)
    contract = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
    raw      = contract.functions.totalSupply().call()
    return raw / (10 ** decimals)
```

---

## Step 5 — Etherscan Module

**`indexer/etherscan.py`**
```python
import httpx
import asyncio
from datetime import datetime
from config.chains import CHAINS
from config.tokens import BURN_ADDRESS

async def fetch_token_transfers(wallet: str, chain: str) -> list[dict]:
    cfg = CHAINS[chain]
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(cfg["explorer"], params={
            "module": "account", "action": "tokentx",
            "address": wallet, "sort": "asc", "apikey": cfg["explorer_key"],
        })
    data = r.json()
    if data["status"] != "1":
        return []

    flows = []
    for tx in data["result"]:
        decimals = int(tx.get("tokenDecimal", 18))
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
    cfg = CHAINS[chain]
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(cfg["explorer"], params={
            "module": "account", "action": "txlist",
            "address": wallet, "sort": "asc", "apikey": cfg["explorer_key"],
        })
    data = r.json()
    if data["status"] != "1":
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
            "to_address":    tx["to"].lower(),
            "token":         CHAINS[chain]["native"],
            "token_address": "native",
            "amount":        value_eth,
            "block_number":  int(tx["blockNumber"]),
            "block_time":    datetime.fromtimestamp(int(tx["timeStamp"])),
        })
    return flows

async def investigate_address(wallet: str, chain: str) -> dict:
    wallet = wallet.lower()
    token_flows, native_flows = await asyncio.gather(
        fetch_token_transfers(wallet, chain),
        fetch_native_transfers(wallet, chain),
    )
    all_flows = token_flows + native_flows
    return {
        "wallet":    wallet,
        "chain":     chain,
        "all_flows": all_flows,
        "inflows":   [f for f in all_flows if f["to_address"] == wallet],
        "outflows":  [f for f in all_flows if f["from_address"] == wallet],
        "burns":     [f for f in token_flows if f["to_address"] == BURN_ADDRESS.lower()],
    }

async def investigate_all_chains(wallet: str) -> dict:
    tasks   = [investigate_address(wallet, chain) for chain in CHAINS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    combined = {"wallet": wallet, "chains": {}}
    for r in results:
        if not isinstance(r, Exception):
            combined["chains"][r["chain"]] = r
    return combined
```

---

## Step 6 — The Graph Module (DeFi Data)

**`indexer/thegraph.py`**
```python
import httpx
from datetime import datetime

SUBGRAPHS = {
    "uniswap_v3": "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
    "aave_v3":    "https://api.thegraph.com/subgraphs/name/aave/protocol-v3",
}

async def get_uniswap_swaps(wallet: str, limit: int = 100) -> list[dict]:
    query = """{ swaps(where: {origin: "%s"}, first: %d, orderBy: timestamp, orderDirection: desc) {
        transaction { id } timestamp
        token0 { symbol } token1 { symbol }
        amount0 amount1 amountUSD
    }}""" % (wallet.lower(), limit)

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(SUBGRAPHS["uniswap_v3"], json={"query": query})

    swaps = []
    for s in r.json().get("data", {}).get("swaps", []):
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
            "block_time": datetime.fromtimestamp(int(s["timestamp"])),
        })
    return swaps

async def get_aave_activity(wallet: str) -> list[dict]:
    query = """{ 
        deposits(where: {user: "%s"}, first: 100)   { id amount reserve { symbol } timestamp }
        withdraws(where: {user: "%s"}, first: 100)  { id amount reserve { symbol } timestamp }
        borrows(where: {user: "%s"}, first: 100)    { id amount reserve { symbol } timestamp }
        repays(where: {user: "%s"}, first: 100)     { id amount reserve { symbol } timestamp }
        liquidationCalls(where: {user: "%s"}, first: 100) {
            id principalAmount collateralReserve { symbol } timestamp }
    }""" % ((wallet.lower(),) * 5)

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(SUBGRAPHS["aave_v3"], json={"query": query})

    data  = r.json().get("data", {})
    items = []

    for action, key in [("deposit","deposits"),("withdraw","withdraws"),
                        ("borrow","borrows"),("repay","repays")]:
        for tx in data.get(key, []):
            items.append({
                "tx_hash":    tx["id"].split(":")[0],
                "chain":      "ethereum",
                "wallet":     wallet,
                "protocol":   "Aave V3",
                "action":     action,
                "token":      tx["reserve"]["symbol"],
                "amount":     float(tx["amount"]) / 1e18,
                "block_time": datetime.fromtimestamp(int(tx["timestamp"])),
            })

    for liq in data.get("liquidationCalls", []):
        items.append({
            "tx_hash":    liq["id"].split(":")[0],
            "chain":      "ethereum",
            "wallet":     wallet,
            "protocol":   "Aave V3",
            "action":     "liquidated",
            "token":      liq["collateralReserve"]["symbol"],
            "amount":     float(liq["principalAmount"]) / 1e18,
            "block_time": datetime.fromtimestamp(int(liq["timestamp"])),
        })

    return items
```

---

## Step 7 — MEV / Sandwich Detection

**`indexer/flashbots.py`**
```python
import httpx

FLASHBOTS_API = "https://blocks.flashbots.net/v1"

async def get_mev_bundles(block_number: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{FLASHBOTS_API}/blocks", params={"block_number": block_number})
    return r.json().get("blocks", [])

async def check_wallet_mev(wallet: str, blocks: list[int]) -> list[dict]:
    wallet   = wallet.lower()
    findings = []
    for block in blocks:
        bundles = await get_mev_bundles(block)
        for bundle in bundles:
            for tx in bundle.get("transactions", []):
                if tx.get("from","").lower() == wallet or tx.get("to","").lower() == wallet:
                    findings.append({
                        "block":        block,
                        "bundle_type":  bundle.get("type"),
                        "miner_reward": bundle.get("miner_reward"),
                        "tx_hash":      tx.get("transaction_hash"),
                    })
    return findings

def detect_sandwich(flows: list[dict], target_tx: str) -> dict | None:
    target = next((f for f in flows if f["tx_hash"] == target_tx), None)
    if not target:
        return None

    block      = target["block_number"]
    token      = target["token"]
    same_block = [f for f in flows if f["block_number"] == block
                  and f["token"] == token and f["tx_hash"] != target_tx]

    if len(same_block) >= 2:
        return {
            "target_tx":       target_tx,
            "block":           block,
            "token":           token,
            "likely_sandwich": True,
            "surrounding_txs": [f["tx_hash"] for f in same_block],
        }
    return None
```

---

## Step 8 — Forensics Modules

### 8a — Hop Analysis

**`forensics/hops.py`**
```python
import asyncio
from indexer.etherscan import investigate_address
from db.database import store_flows

async def trace_hops(
    start_address: str,
    chain: str,
    max_hops: int = 3,
    min_amount: float = 0.1
) -> dict:
    """
    Follow money from start_address up to max_hops deep.
    
    Example:
        Hop 1: start → A, start → B
        Hop 2: A → C, A → D, B → E
        Hop 3: C → F, D → G
    """
    visited = set()
    graph   = []
    queue   = [(start_address.lower(), 0)]

    while queue:
        address, hop = queue.pop(0)
        if address in visited or hop >= max_hops:
            continue
        visited.add(address)

        print(f"  Hop {hop + 1}: investigating {address}")
        data = await investigate_address(address, chain)
        store_flows(data["all_flows"])

        for flow in data["outflows"]:
            if flow["amount"] < min_amount:
                continue
            destination = flow["to_address"]
            graph.append({
                "source":      address,
                "destination": destination,
                "chain":       chain,
                "hop_number":  hop + 1,
                "token":       flow["token"],
                "amount":      flow["amount"],
                "tx_hash":     flow["tx_hash"],
            })
            if destination not in visited:
                queue.append((destination, hop + 1))

    return {
        "start":             start_address,
        "chain":             chain,
        "hops":              max_hops,
        "graph":             graph,
        "addresses_found":   list(visited),
    }

def summarise_hop_graph(graph: list[dict]) -> dict:
    from collections import defaultdict
    volume = defaultdict(float)
    count  = defaultdict(int)
    for edge in graph:
        volume[edge["destination"]] += edge["amount"]
        count[edge["destination"]]  += 1
    return {
        addr: {"total_received": volume[addr], "tx_count": count[addr]}
        for addr in sorted(volume, key=lambda x: -volume[x])
    }
```

### 8b — Cluster Analysis

**`forensics/cluster.py`**
```python
from collections import defaultdict
from db.database import get_conn

def find_common_funder(addresses: list[str], chain: str) -> dict:
    """
    Common funder = likely same entity controlling multiple wallets.
    """
    conn    = get_conn()
    funders = defaultdict(list)

    for addr in addresses:
        rows = conn.execute("""
            SELECT DISTINCT from_address FROM address_flows
            WHERE to_address = ? AND chain = ? AND token IN ('ETH','MATIC','BNB')
        """, [addr.lower(), chain]).fetchall()
        for (funder,) in rows:
            funders[funder].append(addr)

    conn.close()
    return {f: w for f, w in funders.items() if len(w) >= 2}

def find_same_timing_wallets(addresses: list[str], chain: str, window_minutes: int = 5) -> list:
    """
    Wallets that transact within minutes of each other = likely same operator.
    """
    conn     = get_conn()
    clusters = []

    for i, addr1 in enumerate(addresses):
        for addr2 in addresses[i+1:]:
            row = conn.execute("""
                SELECT COUNT(*) FROM address_flows a
                JOIN address_flows b
                  ON ABS(EPOCH(a.block_time) - EPOCH(b.block_time)) < ?
                WHERE a.from_address = ? AND b.from_address = ? AND a.chain = ?
            """, [window_minutes * 60, addr1.lower(), addr2.lower(), chain]).fetchone()

            if row and row[0] > 3:
                clusters.append({
                    "address_1":         addr1,
                    "address_2":         addr2,
                    "shared_timing_txs": row[0],
                    "reason":            f"Transact within {window_minutes}min of each other {row[0]} times",
                })

    conn.close()
    return clusters

def cluster_by_gas_wallet(addresses: list[str], chain: str) -> dict:
    """
    Wallets with the same first ETH funder = same operator.
    """
    conn        = get_conn()
    gas_funders = {}

    for addr in addresses:
        row = conn.execute("""
            SELECT from_address FROM address_flows
            WHERE to_address = ? AND chain = ? AND token IN ('ETH','MATIC','BNB')
            ORDER BY block_time ASC LIMIT 1
        """, [addr.lower(), chain]).fetchone()
        if row:
            gas_funders[addr] = row[0]

    conn.close()

    funder_groups = defaultdict(list)
    for addr, funder in gas_funders.items():
        funder_groups[funder].append(addr)

    return {f: w for f, w in funder_groups.items() if len(w) >= 2}
```

### 8c — Wallet Profiler

**`forensics/profiler.py`**
```python
from db.database import get_conn
from config.known_addresses import KNOWN_ADDRESSES
from datetime import datetime

def profile_wallet(wallet: str, chain: str) -> dict:
    conn = get_conn()
    w    = wallet.lower()

    stats = conn.execute("""
        SELECT COUNT(*), MIN(block_time), MAX(block_time),
               COUNT(DISTINCT CASE WHEN from_address = ? THEN to_address END),
               COUNT(DISTINCT CASE WHEN to_address   = ? THEN from_address END)
        FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [w, w, w, w, chain]).fetchone()

    tokens = conn.execute("""
        SELECT token, SUM(amount) AS volume, COUNT(*) AS txs
        FROM address_flows WHERE from_address = ? AND chain = ?
        GROUP BY token ORDER BY volume DESC
    """, [w, chain]).fetchall()

    hourly = conn.execute("""
        SELECT EXTRACT(HOUR FROM block_time) AS hour, COUNT(*) AS txs
        FROM address_flows WHERE from_address = ? AND chain = ?
        GROUP BY hour ORDER BY hour
    """, [w, chain]).fetchall()

    top_sent_to = conn.execute("""
        SELECT to_address, SUM(amount) AS total FROM address_flows
        WHERE from_address = ? AND chain = ?
        GROUP BY to_address ORDER BY total DESC LIMIT 10
    """, [w, chain]).fetchall()

    top_received_from = conn.execute("""
        SELECT from_address, SUM(amount) AS total FROM address_flows
        WHERE to_address = ? AND chain = ?
        GROUP BY from_address ORDER BY total DESC LIMIT 10
    """, [w, chain]).fetchall()

    conn.close()

    def label(addr):
        return KNOWN_ADDRESSES.get(addr.lower(), {}).get("label", addr)

    return {
        "wallet":             wallet,
        "chain":              chain,
        "total_txs":          stats[0],
        "first_seen":         str(stats[1]),
        "last_seen":          str(stats[2]),
        "wallet_age_days":    (datetime.now() - stats[1]).days if stats[1] else None,
        "unique_recipients":  stats[3],
        "unique_senders":     stats[4],
        "top_tokens":         [{"token": r[0], "volume": r[1], "txs": r[2]} for r in tokens],
        "hourly_activity":    [{"hour": int(r[0]), "txs": r[1]} for r in hourly],
        "top_sent_to":        [{"address": label(r[0]), "total": r[1]} for r in top_sent_to],
        "top_received_from":  [{"address": label(r[0]), "total": r[1]} for r in top_received_from],
    }
```

### 8d — Risk Scoring

**`forensics/risk.py`**
```python
from db.database import get_conn
from config.known_addresses import CEX_ADDRESSES
from forensics.sanctions import is_sanctioned

def score_wallet(wallet: str, chain: str) -> dict:
    """Score a wallet 0-100. Higher = more suspicious."""
    conn  = get_conn()
    w     = wallet.lower()
    score = 0
    flags = []

    if is_sanctioned(wallet):
        score += 50
        flags.append("SANCTIONED ADDRESS")

    sanctioned_interactions = conn.execute("""
        SELECT COUNT(*) FROM address_flows f
        JOIN sanctions s ON (f.to_address = s.address OR f.from_address = s.address)
        WHERE (f.from_address = ? OR f.to_address = ?) AND f.chain = ?
    """, [w, w, chain]).fetchone()[0]
    if sanctioned_interactions > 0:
        score += 30
        flags.append(f"Interacted with {sanctioned_interactions} sanctioned address(es)")

    burns = conn.execute("""
        SELECT COUNT(*) FROM address_flows
        WHERE from_address = ?
          AND to_address = '0x000000000000000000000000000000000000dead'
          AND chain = ?
    """, [w, chain]).fetchone()[0]
    if burns > 0:
        score += 10
        flags.append(f"Sent to burn address {burns} time(s)")

    cex_funded = conn.execute("""
        SELECT COUNT(*) FROM address_flows
        WHERE to_address = ? AND chain = ?
          AND from_address IN ({})
    """.format(",".join(["?" for _ in CEX_ADDRESSES])),
    [w, chain] + list(CEX_ADDRESSES)).fetchone()[0]
    if cex_funded > 0:
        score -= 10
        flags.append("Funded from known CEX (lower risk)")

    cex_deposits = conn.execute("""
        SELECT COUNT(*) FROM address_flows
        WHERE from_address = ? AND chain = ?
          AND to_address IN ({})
    """.format(",".join(["?" for _ in CEX_ADDRESSES])),
    [w, chain] + list(CEX_ADDRESSES)).fetchone()[0]
    if cex_deposits > 0:
        flags.append(f"Deposited to CEX {cex_deposits} time(s) — potential cashout")

    conn.close()
    score = max(0, min(100, score))

    return {
        "wallet": wallet,
        "chain":  chain,
        "score":  score,
        "rating": "HIGH RISK" if score >= 60 else "MEDIUM" if score >= 30 else "LOW RISK",
        "flags":  flags,
    }
```

### 8e — Sanctions Screening

**`forensics/sanctions.py`**
```python
import httpx, re
from db.database import get_conn

OFAC_URL = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml"

async def update_sanctions_list():
    """Download OFAC SDN list and store ETH addresses. Run weekly."""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(OFAC_URL)

    eth_addresses = re.findall(
        r'<id:idType>ETH</id:idType>.*?<id:idNumber>(0x[a-fA-F0-9]{40})</id:idNumber>',
        r.text, re.DOTALL
    )

    conn = get_conn()
    for addr in eth_addresses:
        conn.execute("""
            INSERT OR REPLACE INTO sanctions (address, name, program, added_date)
            VALUES (?, 'OFAC SDN', 'SDN', CURRENT_DATE)
        """, [addr.lower()])
    conn.close()
    print(f"Sanctions updated: {len(eth_addresses)} ETH addresses loaded")

def is_sanctioned(address: str) -> bool:
    conn = get_conn()
    row  = conn.execute("SELECT 1 FROM sanctions WHERE address = ?", [address.lower()]).fetchone()
    conn.close()
    return row is not None

def screen_address_list(addresses: list[str]) -> list[dict]:
    conn    = get_conn()
    results = []
    for addr in addresses:
        row = conn.execute(
            "SELECT name, program FROM sanctions WHERE address = ?", [addr.lower()]
        ).fetchone()
        if row:
            results.append({"address": addr, "name": row[0], "program": row[1]})
    conn.close()
    return results
```

### 8f — Real-Time Alerts

**`forensics/alerts.py`**
```python
import asyncio
from web3 import Web3
from config.chains import CHAINS
from config.known_addresses import CEX_ADDRESSES
from db.database import get_conn

async def monitor_wallet(wallet: str, chain: str, poll_interval: int = 15):
    """Poll for new transactions every N seconds and fire alert rules."""
    w3     = Web3(Web3.HTTPProvider(CHAINS[chain]["rpc"]))
    conn   = get_conn()
    wallet = wallet.lower()

    row = conn.execute("""
        SELECT MAX(block_number) FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [wallet, wallet, chain]).fetchone()
    last_block = row[0] or w3.eth.block_number

    print(f"Monitoring {wallet} on {chain} from block {last_block}")

    while True:
        current_block = w3.eth.block_number
        if current_block > last_block:
            from indexer.etherscan import fetch_token_transfers, fetch_native_transfers
            token_flows, native_flows = await asyncio.gather(
                fetch_token_transfers(wallet, chain),
                fetch_native_transfers(wallet, chain),
            )
            new_flows = [f for f in token_flows + native_flows if f["block_number"] > last_block]
            for flow in new_flows:
                _check_rules(flow, conn)
            last_block = current_block

        await asyncio.sleep(poll_interval)

def _check_rules(flow: dict, conn):
    wallet = flow["from_address"]
    rules  = conn.execute("""
        SELECT id, alert_type, threshold FROM alert_rules
        WHERE (wallet = ? OR wallet = ?) AND chain = ? AND active = TRUE
    """, [wallet, flow["to_address"], flow["chain"]]).fetchall()

    for rule_id, alert_type, threshold in rules:
        message = None

        if alert_type == "threshold" and flow["amount"] >= threshold:
            message = f"LARGE TRANSFER: {flow['amount']} {flow['token']} from {wallet}"

        elif alert_type == "cex_deposit" and flow["to_address"] in CEX_ADDRESSES:
            message = f"CEX DEPOSIT: {wallet} sent {flow['amount']} {flow['token']}"

        elif alert_type == "new_counterparty":
            existing = conn.execute("""
                SELECT 1 FROM address_flows
                WHERE from_address = ? AND to_address = ? AND chain = ? LIMIT 1
            """, [wallet, flow["to_address"], flow["chain"]]).fetchone()
            if not existing:
                message = f"NEW COUNTERPARTY: {wallet} → {flow['to_address']}"

        if message:
            print(f"[ALERT] {message}")
            conn.execute("""
                INSERT INTO alerts_fired (rule_id, wallet, tx_hash, message)
                VALUES (?, ?, ?, ?)
            """, [rule_id, wallet, flow["tx_hash"], message])
```

---

## Step 9 — SQL Queries

```sql
-- Who sent money to a target in a date range
SELECT from_address, token, SUM(amount) AS total, COUNT(*) AS txs,
       MIN(block_time) AS first_tx, MAX(block_time) AS last_tx
FROM address_flows
WHERE to_address = '0xtarget'
  AND block_time BETWEEN '2022-01-01' AND '2023-12-31'
GROUP BY from_address, token
ORDER BY total DESC;

-- Follow money 2 hops (source → middle → destination)
SELECT a.from_address, a.to_address AS middle, b.to_address AS final,
       a.amount AS first_amount, b.amount AS second_amount
FROM address_flows a
JOIN address_flows b ON a.to_address = b.from_address
WHERE a.from_address = '0xsource' AND b.to_address != '0xsource';

-- Wallets that interacted with both target AND a sanctioned address
SELECT DISTINCT from_address FROM address_flows
WHERE to_address = '0xtarget'
  AND from_address IN (
    SELECT from_address FROM address_flows
    WHERE to_address IN (SELECT address FROM sanctions)
  );

-- Token concentration: top holders as % of total
SELECT to_address AS holder,
       SUM(amount) AS balance,
       SUM(amount) / (
           SELECT SUM(amount) FROM address_flows
           WHERE token = 'USDC' AND chain = 'ethereum'
       ) * 100 AS pct_supply
FROM address_flows
WHERE token = 'USDC' AND chain = 'ethereum'
GROUP BY holder ORDER BY balance DESC LIMIT 20;

-- Biggest burns
SELECT token, from_address, SUM(amount) AS burned, COUNT(*) AS burn_txs
FROM burns GROUP BY token, from_address ORDER BY burned DESC LIMIT 20;

-- CEX cashout detection
SELECT DISTINCT a.to_address AS intermediary
FROM address_flows a
JOIN address_flows b ON a.to_address = b.from_address
WHERE a.from_address = '0xsource'
  AND b.to_address IN (SELECT address FROM address_labels WHERE category = 'cex');

-- Behavioural fingerprint: activity by hour
SELECT EXTRACT(HOUR FROM block_time) AS hour, COUNT(*) AS tx_count
FROM address_flows WHERE from_address = '0xtarget'
GROUP BY hour ORDER BY hour;

-- Cross-chain summary for a wallet
SELECT chain, token, SUM(amount) AS received, COUNT(*) AS txs
FROM address_flows WHERE to_address = '0xtarget'
GROUP BY chain, token ORDER BY received DESC;

-- High risk wallets
SELECT address, score, rating, flags FROM risk_scores
WHERE score >= 60 ORDER BY score DESC;

-- Aave liquidations
SELECT wallet, token, amount, block_time FROM defi_lending
WHERE action = 'liquidated' ORDER BY block_time DESC;

-- Wallets that funded multiple addresses (clustering signal)
SELECT from_address, COUNT(DISTINCT to_address) AS wallets_funded
FROM address_flows WHERE token IN ('ETH','MATIC','BNB')
GROUP BY from_address HAVING wallets_funded >= 3
ORDER BY wallets_funded DESC;
```

---

## Step 10 — Streamlit Dashboard

**`dashboard/app.py`**
```python
import streamlit as st
import asyncio
from db.database import get_conn, store_flows, store_burn
from indexer.rpc import get_all_native_balances
from indexer.etherscan import investigate_all_chains
from indexer.thegraph import get_uniswap_swaps, get_aave_activity
from forensics.hops import trace_hops, summarise_hop_graph
from forensics.profiler import profile_wallet
from forensics.risk import score_wallet
from forensics.sanctions import screen_address_list

st.set_page_config(page_title="Chain Analytics", layout="wide")
st.title("Chain Analytics")

page = st.sidebar.selectbox("Page", [
    "Wallet Checker",
    "Investigate Address",
    "Hop Analysis",
    "Wallet Profile",
    "Risk Score",
    "DeFi Activity",
    "Sanctions Screen",
    "SQL Query",
    "Alerts",
])

if page == "Wallet Checker":
    st.header("Wallet Balance Checker")
    wallet = st.text_input("Wallet Address", placeholder="0x...")
    if st.button("Check") and wallet:
        st.json(get_all_native_balances(wallet))

elif page == "Investigate Address":
    st.header("Address Investigation")
    wallet = st.text_input("Target Address")
    if st.button("Investigate") and wallet:
        with st.spinner("Fetching across all chains..."):
            result = asyncio.run(investigate_all_chains(wallet))
            for chain, data in result["chains"].items():
                if not data["all_flows"]:
                    continue
                with st.expander(f"{chain.upper()} — {len(data['all_flows'])} txs"):
                    c1, c2, c3 = st.columns(3)
                    c1.metric("Inflows",  len(data["inflows"]))
                    c2.metric("Outflows", len(data["outflows"]))
                    c3.metric("Burns",    len(data["burns"]))
                    store_flows(data["all_flows"])

elif page == "Hop Analysis":
    st.header("Hop Analysis — Follow the Money")
    wallet  = st.text_input("Start Address")
    chain   = st.selectbox("Chain", ["ethereum","base","arbitrum","polygon"])
    hops    = st.slider("Max Hops", 1, 5, 3)
    min_amt = st.number_input("Min Amount to Follow", value=0.1)
    if st.button("Trace") and wallet:
        with st.spinner(f"Tracing {hops} hops..."):
            result  = asyncio.run(trace_hops(wallet, chain, hops, min_amt))
            summary = summarise_hop_graph(result["graph"])
            st.metric("Addresses Found", len(result["addresses_found"]))
            st.dataframe(summary)

elif page == "Wallet Profile":
    st.header("Wallet Profiler")
    wallet = st.text_input("Wallet Address")
    chain  = st.selectbox("Chain", ["ethereum","base","arbitrum","polygon"])
    if st.button("Profile") and wallet:
        p = profile_wallet(wallet, chain)
        c1, c2, c3 = st.columns(3)
        c1.metric("Wallet Age (days)", p["wallet_age_days"])
        c2.metric("Total Txs",         p["total_txs"])
        c3.metric("Unique Recipients", p["unique_recipients"])
        st.subheader("Token Activity")
        st.json(p["top_tokens"])
        st.subheader("Hourly Behaviour")
        st.bar_chart({r["hour"]: r["txs"] for r in p["hourly_activity"]})

elif page == "Risk Score":
    st.header("Risk Scorer")
    wallet = st.text_input("Wallet Address")
    chain  = st.selectbox("Chain", ["ethereum","base","arbitrum","polygon"])
    if st.button("Score") and wallet:
        result = score_wallet(wallet, chain)
        color  = "🔴" if result["score"] >= 60 else "🟡" if result["score"] >= 30 else "🟢"
        st.metric("Risk Score", f"{color} {result['score']} / 100 — {result['rating']}")
        for flag in result["flags"]:
            st.warning(flag)

elif page == "DeFi Activity":
    st.header("DeFi Activity")
    wallet = st.text_input("Wallet Address")
    if st.button("Fetch") and wallet:
        col1, col2 = st.columns(2)
        with col1:
            st.subheader("Uniswap Swaps")
            st.dataframe(asyncio.run(get_uniswap_swaps(wallet)))
        with col2:
            st.subheader("Aave Activity")
            st.dataframe(asyncio.run(get_aave_activity(wallet)))

elif page == "Sanctions Screen":
    st.header("Sanctions Screening")
    raw = st.text_area("Paste addresses (one per line)")
    if st.button("Screen") and raw:
        addresses = [a.strip() for a in raw.split("\n") if a.strip()]
        hits = screen_address_list(addresses)
        if hits:
            st.error(f"{len(hits)} sanctioned address(es) found")
            st.dataframe(hits)
        else:
            st.success("No sanctioned addresses found")

elif page == "SQL Query":
    st.header("SQL Query")
    query = st.text_area("Query", height=150, value="""SELECT from_address, token, SUM(amount) as total
FROM address_flows
GROUP BY from_address, token
ORDER BY total DESC LIMIT 20""")
    if st.button("Run"):
        try:
            conn = get_conn()
            st.dataframe(conn.execute(query).fetchdf())
            conn.close()
        except Exception as e:
            st.error(str(e))

elif page == "Alerts":
    st.header("Alert Rules")
    conn  = get_conn()
    rules = conn.execute("SELECT * FROM alert_rules WHERE active = TRUE").fetchdf()
    st.dataframe(rules)
    st.subheader("Add Rule")
    wallet     = st.text_input("Wallet to watch")
    chain      = st.selectbox("Chain", ["ethereum","base","arbitrum","polygon"])
    alert_type = st.selectbox("Alert Type", ["threshold","cex_deposit","new_counterparty"])
    threshold  = st.number_input("Amount threshold", value=10.0)
    if st.button("Add Rule"):
        conn.execute("""
            INSERT INTO alert_rules (wallet, chain, alert_type, threshold)
            VALUES (?, ?, ?, ?)
        """, [wallet, chain, alert_type, threshold])
        st.success("Rule added")
    conn.close()
```

---

## Running the System

```bash
# Investigate a wallet across all chains (saves to DB)
python scripts/investigate.py 0xWalletAddress

# Investigate on one chain only
python scripts/investigate.py 0xWalletAddress --chain ethereum

# Update OFAC sanctions list (run weekly)
python scripts/update_sanctions.py

# Start real-time monitor
python scripts/monitor.py 0xWalletAddress ethereum

# Launch dashboard
streamlit run dashboard/app.py
```

---

## Build Order

| Week | Task |
|---|---|
| 1 | Setup, config, DB schema, balance checker working |
| 2 | Etherscan inflow/outflow, storing to DuckDB |
| 3 | CLI investigation script, basic SQL queries |
| 4 | Streamlit dashboard live |
| 5 | Hop analysis + cluster analysis |
| 6 | Wallet profiler + risk scorer |
| 7 | Sanctions screening + OFAC integration |
| 8 | The Graph — Uniswap swaps + Aave activity |
| 9 | Real-time alerts + monitoring |
| 10 | MEV/sandwich detection via Flashbots |

---

## Chains Supported

| Chain | EVM | Same Code | Notes |
|---|---|---|---|
| Ethereum | Yes | Yes | Main chain |
| Base | Yes | Yes | — |
| Arbitrum | Yes | Yes | — |
| Optimism | Yes | Yes | — |
| Polygon | Yes | Yes | — |
| BSC | Yes | Yes | Public RPC, no Alchemy needed |
| Solana | No | No | Completely separate codebase |
| Bitcoin | No | No | Completely separate codebase |

---

## What Requires an Archive Node

These features need `debug_traceTransaction` which only works on full archive nodes:

- Flash loan detection
- Internal transaction tracing
- Mixer / Tornado Cash path tracing

Archive node options: Alchemy Growth plan, QuickNode, or self-hosted.
Everything else in this guide works on free-tier standard nodes.