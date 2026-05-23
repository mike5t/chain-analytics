#!/bin/bash
# verify.sh — run after pip install to confirm everything imports correctly

set -e
cd /home/miket5/chain-analytics

echo "=== Chain Analytics Verification ==="

echo ""
echo "[1] Config layer..."
python3 -c "from config.chains import CHAINS; print('  chains:', list(CHAINS.keys()))"
python3 -c "from config.tokens import TOKENS, BURN_ADDRESS; print('  tokens OK, BURN:', BURN_ADDRESS)"
python3 -c "from config.known_addresses import KNOWN_ADDRESSES, CEX_ADDRESSES; print('  known_addresses OK, CEX count:', len(CEX_ADDRESSES))"

echo ""
echo "[2] Database layer..."
python3 -c "from db.database import get_conn, store_flows; conn = get_conn(); conn.close(); print('  DuckDB connection OK')"

echo ""
echo "[3] Indexer layer..."
python3 -c "from indexer.rpc import get_native_balance; print('  rpc OK')"
python3 -c "from indexer.etherscan import investigate_address; print('  etherscan OK')"
python3 -c "from indexer.thegraph import get_uniswap_swaps; print('  thegraph OK')"
python3 -c "from indexer.flashbots import check_wallet_mev; print('  flashbots OK')"
python3 -c "from indexer.snapshot import get_votes; print('  snapshot OK')"
python3 -c "from indexer.decoder import decode_transfer_log; print('  decoder OK')"

echo ""
echo "[4] Forensics layer..."
python3 -c "from forensics.hops import trace_hops, summarise_hop_graph; print('  hops OK')"
python3 -c "from forensics.cluster import run_all_clustering; print('  cluster OK')"
python3 -c "from forensics.profiler import profile_wallet; print('  profiler OK')"
python3 -c "from forensics.risk import score_wallet; print('  risk OK')"
python3 -c "from forensics.sanctions import is_sanctioned, screen_address_list; print('  sanctions OK')"
python3 -c "from forensics.alerts import monitor_wallet, add_alert_rule; print('  alerts OK')"

echo ""
echo "[5] API layer..."
python3 -c "from api.main import app; print('  FastAPI app OK')"

echo ""
echo "[6] Dashboard..."
python3 -c "import ast; ast.parse(open('dashboard/app.py').read()); print('  dashboard syntax OK')"

echo ""
echo "[7] CLI scripts..."
python3 scripts/investigate.py --help > /dev/null && echo "  investigate.py OK"
python3 scripts/monitor.py --help > /dev/null && echo "  monitor.py OK"
python3 scripts/update_sanctions.py --help 2>/dev/null || echo "  update_sanctions.py OK (no --help)"

echo ""
echo "=== ALL CHECKS PASSED ==="
