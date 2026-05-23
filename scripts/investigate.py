#!/usr/bin/env python3
"""
scripts/investigate.py — CLI wallet investigation tool.

Usage:
    python scripts/investigate.py 0xWalletAddress
    python scripts/investigate.py 0xWalletAddress --chain ethereum
    python scripts/investigate.py 0xWalletAddress --chain ethereum --hops 3

Examples:
    python scripts/investigate.py 0x28c6c06298d514db089934071355e5743bf21d60
    python scripts/investigate.py 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --chain ethereum
"""

import sys
import asyncio
import argparse
from pathlib import Path

# Allow running from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from indexer.etherscan import investigate_address, investigate_all_chains
from forensics.hops import trace_hops, summarise_hop_graph
from forensics.profiler import profile_wallet
from forensics.risk import score_wallet
from forensics.sanctions import is_sanctioned
from db.database import store_flows


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Chain Analytics — wallet investigation CLI")
    p.add_argument("wallet",          help="Ethereum address to investigate")
    p.add_argument("--chain",         default=None, help="Chain (default: all chains)")
    p.add_argument("--hops",          type=int, default=0, help="Trace N hops deep (0 = no hop tracing)")
    p.add_argument("--min-amount",    type=float, default=0.1, help="Minimum amount for hop tracing")
    p.add_argument("--no-profile",    action="store_true", help="Skip wallet profiler")
    p.add_argument("--no-risk",       action="store_true", help="Skip risk scoring")
    return p.parse_args()


async def main():
    args   = parse_args()
    wallet = args.wallet.lower()

    print(f"\n{'='*60}")
    print(f"  Chain Analytics — Investigating {wallet}")
    print(f"{'='*60}\n")

    # ── Sanctions check ───────────────────────────────────────────────────────
    if is_sanctioned(wallet):
        print("⚠️  SANCTIONED ADDRESS — found in OFAC SDN list!\n")

    # ── Transaction investigation ─────────────────────────────────────────────
    if args.chain:
        print(f"[1/4] Fetching transactions on {args.chain}...")
        data   = await investigate_address(wallet, args.chain)
        chains = {args.chain: data}
    else:
        print("[1/4] Fetching transactions across all chains...")
        result = await investigate_all_chains(wallet)
        chains = result["chains"]

    total_flows = 0
    for chain, data in chains.items():
        n = len(data["all_flows"])
        if n == 0:
            continue
        total_flows += n
        stored = store_flows(data["all_flows"])
        print(
            f"  {chain:12s}  {n:5d} txs  "
            f"(in: {len(data['inflows'])}, out: {len(data['outflows'])}, burns: {len(data['burns'])})"
            f"  → {stored} stored"
        )

    print(f"\n  Total: {total_flows} transactions stored\n")

    # ── Hop analysis ──────────────────────────────────────────────────────────
    if args.hops > 0:
        hop_chain = args.chain or "ethereum"
        print(f"[2/4] Hop tracing ({args.hops} hops on {hop_chain})...")
        hop_result = await trace_hops(wallet, hop_chain, args.hops, args.min_amount)
        summary    = summarise_hop_graph(hop_result["graph"])

        print(f"\n  Addresses found: {len(hop_result['addresses_found'])}")
        print(f"  Flow edges:      {len(hop_result['graph'])}")
        print(f"\n  Top destinations:")
        for i, (addr, info) in enumerate(list(summary.items())[:10]):
            print(f"    {i+1:2d}. {addr}  {info['total_received']:.4f}  ({info['tx_count']} txs)")
    else:
        print("[2/4] Hop tracing skipped (use --hops N to enable)\n")

    # ── Wallet profile ────────────────────────────────────────────────────────
    profile_chain = args.chain or "ethereum"

    if not args.no_profile and total_flows > 0:
        print(f"[3/4] Building wallet profile ({profile_chain})...")
        p = profile_wallet(wallet, profile_chain)
        print(f"  Age:            {p['wallet_age_days']} days")
        print(f"  Total txs:      {p['total_txs']}")
        print(f"  Recipients:     {p['unique_recipients']}")
        print(f"  Senders:        {p['unique_senders']}")
        print(f"  Total received: {p['total_received']:,.4f}")
        print(f"  Total sent:     {p['total_sent']:,.4f}")
        if p["top_tokens"]:
            print(f"  Top token:      {p['top_tokens'][0]['token']}")
        print()
    else:
        print("[3/4] Profile skipped\n")

    # ── Risk score ────────────────────────────────────────────────────────────
    if not args.no_risk:
        print(f"[4/4] Risk scoring ({profile_chain})...")
        risk = score_wallet(wallet, profile_chain)
        rating_icon = "🔴" if risk["score"] >= 60 else "🟡" if risk["score"] >= 30 else "🟢"
        print(f"  {rating_icon} Score: {risk['score']} / 100 — {risk['rating']}")
        for flag in risk["flags"]:
            print(f"     • {flag}")
        print()
    else:
        print("[4/4] Risk score skipped\n")

    print("Done. Data saved to data/chain_analytics.duckdb")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(main())
