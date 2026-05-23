# Chain Analytics

A personal Dune-like blockchain forensics system using direct RPC calls, light targeted indexing, and DuckDB for SQL querying.

## Features

- Multi-chain wallet balance checker (ETH, Base, Arbitrum, Optimism, Polygon, BSC)
- Full inflow / outflow analysis via Etherscan API
- Recursive hop analysis — follow money N levels deep
- Address clustering (common funder, timing, gas wallet)
- Wallet profiler (age, top tokens, hourly behaviour)
- Risk scoring 0–100
- OFAC sanctions screening
- DeFi activity (Uniswap swaps, Aave lending/liquidations)
- MEV / sandwich detection via Flashbots API
- Real-time alert rules
- Streamlit dashboard + FastAPI

**Total monthly cost: $0** — all free APIs.

## Quick Start

```bash
# 1. Create and activate venv
python -m venv venv
source venv/bin/activate   # Linux/macOS
# venv\Scripts\activate    # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up API keys
cp .env.example .env
# Edit .env and fill in ALCHEMY_KEY and ETHERSCAN_KEY

# 4. Investigate a wallet
python scripts/investigate.py 0xYourWalletAddress

# 5. Launch dashboard
streamlit run dashboard/app.py

# 6. Start real-time monitor
python scripts/monitor.py 0xYourWalletAddress ethereum

# 7. Update OFAC sanctions list (run weekly)
python scripts/update_sanctions.py
```

## API Keys Needed

| Key | Where to get | Cost |
|-----|-------------|------|
| `ALCHEMY_KEY` | https://alchemy.com | Free |
| `ETHERSCAN_KEY` | https://etherscan.io/apis | Free |

## Project Structure

```
chain-analytics/
├── .env                     # API keys (never commit)
├── .env.example             # Template
├── requirements.txt
├── README.md
│
├── config/
│   ├── chains.py            # RPC endpoints per chain
│   ├── tokens.py            # Token addresses + decimals
│   └── known_addresses.py   # CEX, bridges, protocols, sanctions
│
├── indexer/
│   ├── rpc.py               # Raw Web3 RPC calls
│   ├── etherscan.py         # Etherscan API — tx history
│   ├── decoder.py           # ABI log decoding
│   ├── thegraph.py          # The Graph — DeFi data
│   ├── flashbots.py         # MEV analysis
│   └── snapshot.py          # Governance voting
│
├── forensics/
│   ├── hops.py              # Multi-hop money tracing
│   ├── cluster.py           # Address clustering
│   ├── profiler.py          # Wallet profiling
│   ├── risk.py              # Risk scoring
│   ├── sanctions.py         # OFAC screening
│   └── alerts.py            # Real-time monitoring
│
├── db/
│   ├── schema.sql
│   └── database.py
│
├── api/
│   └── main.py              # FastAPI endpoints
│
├── dashboard/
│   └── app.py               # Streamlit dashboard
│
└── scripts/
    ├── investigate.py        # CLI investigation
    ├── monitor.py            # Real-time alert runner
    └── update_sanctions.py   # Refresh OFAC list
```

## What Requires an Archive Node

- Flash loan detection
- Internal transaction tracing
- Tornado Cash / mixer path tracing

Options: Alchemy Growth plan, QuickNode, or self-hosted. Everything else works on free-tier nodes.
